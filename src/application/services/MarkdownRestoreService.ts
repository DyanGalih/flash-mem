import * as fs from 'fs-extra';
import * as path from 'path';
import Database from 'better-sqlite3';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';
import { MarkdownBackupParser, ParsedMemoryEntry } from '../../infrastructure/markdown/MarkdownBackupParser';
import { MemoryEntryRepository } from '../../infrastructure/database/repositories/MemoryEntryRepository';
import { TagRepository } from '../../infrastructure/database/repositories/TagRepository';
import { RelationshipRepository } from '../../infrastructure/database/repositories/RelationshipRepository';
import { SourceDocumentRepository } from '../../infrastructure/database/repositories/SourceDocumentRepository';
import { ProjectRepository } from '../../infrastructure/database/repositories/ProjectRepository';
import { SchemaMigrationService } from './SchemaMigrationService';
import { MemoryEntry, MemoryEntrySchema } from '../../domain/entities/MemoryEntry';

export interface RestoreResult {
  restoredEntries: number;
  restoredRelationships: number;
  skippedFiles: string[];
  warnings: string[];
}

/**
 * Application-layer orchestrator for restoring SQLite memory from markdown backup files.
 *
 * Responsibilities (FR-001 through FR-008):
 * - Scan all .md files in a backup directory.
 * - Parse entries, tags, source documents, and relationships via MarkdownBackupParser.
 * - Deduplicate parsed entries by ID.
 * - Execute all database writes inside a single transaction (FR-005, D6).
 * - Restore entries with overwrite semantics for duplicate IDs (FR-004, D7).
 * - Restore relationships, skipping dangling links with stderr warnings (FR-008).
 *
 * Architecture:
 * - Sits in the Application layer (src/application/services/).
 * - Uses PathSanitizer (Safety layer) for directory traversal prevention (P0.004, D1).
 * - Uses SecretScanner (Safety layer) via MarkdownBackupParser.
 * - All SQL is in the Persistence layer via repositories (P0.001, D2).
 */
export class MarkdownRestoreService {
  private readonly parser = new MarkdownBackupParser();

  constructor(
    private readonly db: Database.Database,
    private readonly projectRepo: ProjectRepository,
    private readonly entryRepo: MemoryEntryRepository,
    private readonly tagRepo: TagRepository,
    private readonly relationshipRepo: RelationshipRepository,
    private readonly sourceDocRepo: SourceDocumentRepository,
    private readonly migrationService: SchemaMigrationService
  ) {}

  /**
   * Restore all memory entries from markdown backup files in the given directory.
   *
   * @param backupDirectory Absolute or relative path to the backup directory.
   * @param workspaceRoot   The workspace root used to validate path containment.
   */
  public restore(backupDirectory: string, workspaceRoot: string): RestoreResult {
    // --- 1. Path safety (CWE-22, P0.004, D1) ---
    const resolvedRoot = PathSanitizer.resolveRoot(workspaceRoot);
    const resolvedBackupDir = PathSanitizer.resolveRoot(backupDirectory);

    if (!fs.existsSync(resolvedBackupDir) || !fs.statSync(resolvedBackupDir).isDirectory()) {
      throw new Error(`Backup directory "${resolvedBackupDir}" does not exist or is not a directory.`);
    }

    // Ensure schema is current
    this.migrationService.ensureCurrentSchema();

    // --- 2. Scan .md files ---
    const mdFiles = fs
      .readdirSync(resolvedBackupDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(resolvedBackupDir, f));

    const result: RestoreResult = {
      restoredEntries: 0,
      restoredRelationships: 0,
      skippedFiles: [],
      warnings: []
    };

    if (mdFiles.length === 0) {
      result.warnings.push(`No markdown files found in "${resolvedBackupDir}".`);
      return result;
    }

    // --- 3. Parse all files; deduplicate entries by ID ---
    // Map<entryId, ParsedMemoryEntry> — last parsed wins within the same file set
    const entriesById = new Map<string, ParsedMemoryEntry>();
    const projectNameFromBackup = this.detectProjectName(resolvedBackupDir, resolvedRoot);

    for (const filePath of mdFiles) {
      const filename = path.basename(filePath);
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch (err: any) {
        const msg = `${filename}: Could not read file — ${err.message}. Skipping.`;
        result.warnings.push(msg);
        process.stderr.write(`Warning: ${msg}\n`);
        result.skippedFiles.push(filename);
        continue;
      }

      const parseResult = this.parser.parse(content, filename);

      for (const warning of parseResult.warnings) {
        result.warnings.push(warning);
        process.stderr.write(`Warning: ${warning}\n`);
      }

      // If no entries and warnings mention "skipped", count as skipped file
      if (parseResult.entries.length === 0 && parseResult.warnings.some((w) => w.includes(filename))) {
        result.skippedFiles.push(filename);
        continue;
      }

      for (const entry of parseResult.entries) {
        if (entriesById.has(entry.id)) {
          const dedupMsg = `Duplicate entry ID "${entry.id}" found in "${filename}" — keeping first occurrence.`;
          result.warnings.push(dedupMsg);
          process.stderr.write(`Warning: ${dedupMsg}\n`);
        } else {
          entriesById.set(entry.id, entry);
        }
      }
    }

    if (entriesById.size === 0) {
      result.warnings.push(`No valid memory entries found in backup directory.`);
      return result;
    }

    // --- 4. Wrap all database writes in a single transaction (FR-005) ---
    const doRestore = this.db.transaction(() => {
      // Upsert project record
      const project = this.projectRepo.upsertByRootPath(
        resolvedRoot,
        projectNameFromBackup ?? path.basename(resolvedRoot)
      );

      // Restore entries and their tags
      for (const [, parsed] of entriesById) {
        // Upsert source document if a path was recorded
        let sourceDocumentId: string | null = null;
        if (parsed.sourceDocumentPath) {
          try {
            const sourceDoc = this.sourceDocRepo.upsert(
              project.id,
              parsed.sourceDocumentPath,
              '', // No checksum available from backup
              parsed.updatedAt
            );
            sourceDocumentId = sourceDoc.id;
          } catch {
            // Non-fatal — continue without source document link
          }
        }

        const contentHash = Buffer.from(
          `${parsed.title}\n${parsed.content}\n${parsed.entryType}`
        ).toString('base64');

        const entry: MemoryEntry = MemoryEntrySchema.parse({
          id: parsed.id,
          projectId: project.id,
          title: parsed.title,
          content: parsed.content,
          contentHash,
          entryType: parsed.entryType,
          sourceDocumentId,
          createdAt: parsed.updatedAt,
          updatedAt: parsed.updatedAt,
          deletedAt: null
        });

        this.entryRepo.restore(entry);
        this.tagRepo.replaceEntryTags(entry.id, parsed.tags);

        result.restoredEntries++;
      }

      // Restore relationships — validate both endpoints exist (FR-008)
      for (const [, parsed] of entriesById) {
        for (const rel of parsed.relationships) {
          const sourceExists = this.entryRepo.findById(parsed.id) !== null;
          const targetExists = this.entryRepo.findById(rel.targetEntryId) !== null;

          if (!sourceExists || !targetExists) {
            const msg = `Skipping relationship "${rel.relationshipType}" from "${parsed.id}" to "${rel.targetEntryId}" — one or both entries not found.`;
            result.warnings.push(msg);
            process.stderr.write(`Warning: ${msg}\n`);
            continue;
          }

          const projectEntry = this.entryRepo.findById(parsed.id);
          if (projectEntry) {
            this.relationshipRepo.upsert(projectEntry.projectId, parsed.id, {
              targetEntryId: rel.targetEntryId,
              relationshipType: rel.relationshipType
            });
            result.restoredRelationships++;
          }
        }
      }
    });

    doRestore();
    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Attempt to extract the project name from any backup file's frontmatter.
   * Falls back to null if not determinable.
   */
  private detectProjectName(backupDir: string, _resolvedRoot: string): string | null {
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.md'));
    for (const f of files) {
      try {
        const content = fs.readFileSync(path.join(backupDir, f), 'utf8');
        const parsed = this.parser.parse(content, f);
        if (parsed.projectName) {
          return parsed.projectName;
        }
      } catch {
        // Skip unreadable files
      }
    }
    return null;
  }
}
