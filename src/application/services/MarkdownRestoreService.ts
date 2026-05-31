import * as fs from 'fs-extra';
import * as path from 'path';
import { MemoryEntry, MemoryEntrySchema } from '../../domain/entities/MemoryEntry';
import {
  IMemoryEntryRepository,
  IProjectRepository,
  IRelationshipRepository,
  ISourceDocumentRepository,
  ITagRepository,
  ITransactionRunner
} from '../../domain/repositories/interfaces';
import { MarkdownBackupParser, ParsedMemoryEntry } from '../../infrastructure/markdown/MarkdownBackupParser';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';
import { SchemaMigrationService } from './SchemaMigrationService';

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
    private readonly projectRepo: IProjectRepository,
    private readonly entryRepo: IMemoryEntryRepository,
    private readonly tagRepo: ITagRepository,
    private readonly relationshipRepo: IRelationshipRepository,
    private readonly sourceDocRepo: ISourceDocumentRepository,
    private readonly migrationService: SchemaMigrationService,
    private readonly transactionRunner: ITransactionRunner
  ) { }

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
    const mdFiles = this.scanBackupDirectory(resolvedBackupDir);

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
    const entriesById = new Map<string, ParsedMemoryEntry>();
    const projectNameFromBackup = this.detectProjectName(resolvedBackupDir, resolvedRoot);

    this.parseAndDeduplicate(mdFiles, entriesById, result);

    if (entriesById.size === 0) {
      result.warnings.push(`No valid memory entries found in backup directory.`);
      return result;
    }

    // --- 4. Wrap all database writes in a single transaction (FR-005) ---
    this.transactionRunner.run(() => {
      // Upsert project record
      const project = this.projectRepo.upsertByRootPath(
        resolvedRoot,
        projectNameFromBackup ?? path.basename(resolvedRoot)
      );

      // Restore entries and their tags
      this.restoreEntries(entriesById, project, result);

      // Restore relationships — validate both endpoints exist (FR-008)
      this.restoreRelationships(entriesById, project.id, result);
    });

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Scan backup directory for markdown files.
   */
  private scanBackupDirectory(resolvedBackupDir: string): string[] {
    return fs
      .readdirSync(resolvedBackupDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.join(resolvedBackupDir, f));
  }

  /**
   * Parse backup markdown files and deduplicate them by entry ID.
   */
  private parseAndDeduplicate(
    mdFiles: string[],
    entriesById: Map<string, ParsedMemoryEntry>,
    result: RestoreResult
  ): void {
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
  }

  /**
   * Restore parsed memory entries and their tags to the repositories.
   */
  private restoreEntries(
    entriesById: Map<string, ParsedMemoryEntry>,
    project: { id: string },
    result: RestoreResult
  ): void {
    for (const [, parsed] of entriesById) {
      // Upsert source document if a path was recorded
      let sourceDocumentId: string | null = null;
      if (parsed.sourceDocumentPath) {
        try {
          const sourceDoc = this.sourceDocRepo.upsert(
            project.id,
            parsed.sourceDocumentPath,
            parsed.sourceDocumentChecksum ?? '',
            parsed.sourceDocumentLastIndexedAt ?? parsed.updatedAt
          );
          sourceDocumentId = sourceDoc.id;
        } catch {
          // Non-fatal — continue without source document link
        }
      }

      const contentHash = Buffer.from(
        `${parsed.title}\n${parsed.content}\n${parsed.category}`
      ).toString('base64');

      const entry: MemoryEntry = MemoryEntrySchema.parse({
        id: parsed.id,
        projectId: project.id,
        title: parsed.title,
        content: parsed.content,
        contentHash,
        category: parsed.category,
        confidence: parsed.confidence ?? null,
        summary: parsed.summary ?? null,
        relatedFiles: parsed.relatedFiles.length > 0 ? parsed.relatedFiles : null,
        source: parsed.sourceDocumentPath ? 'file' : 'backup',
        sourceDocumentId,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        deletedAt: null
      });

      this.entryRepo.restore(entry);
      this.tagRepo.replaceEntryTags(entry.id, parsed.tags);
      this.entryRepo.refreshSearchIndex(entry.id);

      result.restoredEntries++;
    }
  }

  /**
   * Restore relationships, ensuring dangling relationships are skipped.
   */
  private restoreRelationships(
    entriesById: Map<string, ParsedMemoryEntry>,
    projectId: string,
    result: RestoreResult
  ): void {
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
  }

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
