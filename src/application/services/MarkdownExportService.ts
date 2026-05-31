import * as path from 'path';
import { ExportManifest, ExportManifestSchema, ExportSectionKey } from '../../domain/entities/ExportManifest';
import { Project, ProjectSchema } from '../../domain/entities/Project';
import {
  IMemoryEntryRepository,
  IProjectRepository,
  IRelationshipRepository,
  ISourceDocumentRepository,
  ITagRepository
} from '../../domain/repositories/interfaces';
import { createId, now } from '../../infrastructure/database/helpers';
import { ExportedMemoryEntry, MarkdownExportFormatter } from '../../infrastructure/markdown/MarkdownExportFormatter';
import { MarkdownExportWriter } from '../../infrastructure/markdown/MarkdownExportWriter';
import { SchemaMigrationService } from './SchemaMigrationService';

export interface MarkdownExportFileResult {
  fileName: string;
  path: string;
  entryCount: number;
}

export interface MarkdownExportResult {
  manifest: ExportManifest;
  files: MarkdownExportFileResult[];
}

interface SectionDefinition {
  key: ExportSectionKey;
  fileName: string;
  title: string;
}

const SECTION_DEFINITIONS: SectionDefinition[] = [
  { key: 'project-summary', fileName: 'project-summary.md', title: 'Project Summary' },
  { key: 'decisions', fileName: 'decisions.md', title: 'Decisions' },
  { key: 'patterns', fileName: 'patterns.md', title: 'Patterns' },
  { key: 'bug-fixes', fileName: 'bug-fixes.md', title: 'Bug Fixes' },
  { key: 'security-notes', fileName: 'security-notes.md', title: 'Security Notes' },
  { key: 'conventions', fileName: 'conventions.md', title: 'Conventions' }
];

export class MarkdownExportService {
  private readonly formatter: MarkdownExportFormatter;
  private readonly exportWriter: MarkdownExportWriter;

  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly memoryEntryRepository: IMemoryEntryRepository,
    private readonly tagRepository: ITagRepository,
    private readonly relationshipRepository: IRelationshipRepository,
    private readonly sourceDocumentRepository: ISourceDocumentRepository,
    private readonly schemaMigrationService?: SchemaMigrationService
  ) {
    this.formatter = new MarkdownExportFormatter();
    this.exportWriter = new MarkdownExportWriter();
  }

  public async exportWorkspace(workspaceRoot: string): Promise<MarkdownExportResult> {
    this.schemaMigrationService?.ensureCurrentSchema();

    const project = this.resolveProject(workspaceRoot);
    const entries = this.loadEntriesForExport(project.id);
    const exportRoot = path.join(workspaceRoot, '.flash-mem', 'exports');
    const manifest = this.buildManifest(project, workspaceRoot, exportRoot, entries);
    const manifestSections = new Map(manifest.sections.map((section) => [section.key, section]));
    const renderedFiles = SECTION_DEFINITIONS.map((definition) => {
      const sectionEntries = definition.key === 'project-summary'
        ? entries
        : entries.filter((entry) => this.matchesSection(definition.key, entry));

      const section = manifestSections.get(definition.key);
      if (!section) {
        throw new Error(`Missing export section definition for "${definition.key}"`);
      }

      return {
        fileName: definition.fileName,
        content: this.formatter.formatSectionDocument(manifest, section, sectionEntries),
        entryCount: sectionEntries.length
      };
    });

    const resolvedExportRoot = await this.exportWriter.write(workspaceRoot, renderedFiles);

    return {
      manifest,
      files: renderedFiles
        .map(({ content: _content, ...file }) => ({
          ...file,
          path: path.join(resolvedExportRoot, file.fileName)
        }))
        .sort((left, right) => left.fileName.localeCompare(right.fileName))
    };
  }

  private resolveProject(workspaceRoot: string): Project {
    const existing = this.projectRepository.findByRootPath(workspaceRoot);
    if (existing) {
      return existing;
    }

    const timestamp = now();
    return ProjectSchema.parse({
      id: createId(),
      rootPath: workspaceRoot,
      name: this.detectProjectName(workspaceRoot),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  }

  private loadEntriesForExport(projectId: string): ExportedMemoryEntry[] {
    const entries = this.memoryEntryRepository.listByProject(projectId);
    const sourceDocuments = new Map<string, string>();
    const sourceDocumentMetadata = new Map<string, { checksum: string; lastIndexedAt: number | null }>();
    const exportEntries: ExportedMemoryEntry[] = [];

    for (const entry of entries) {
      if (entry.sourceDocumentId && !sourceDocuments.has(entry.sourceDocumentId)) {
        const sourceDocument = this.sourceDocumentRepository.findById(entry.sourceDocumentId);
        if (sourceDocument) {
          sourceDocuments.set(sourceDocument.id, sourceDocument.path);
          sourceDocumentMetadata.set(sourceDocument.id, {
            checksum: sourceDocument.checksum,
            lastIndexedAt: sourceDocument.lastIndexedAt ?? null
          });
        }
      }

      const tags = this.tagRepository.listForEntry(entry.id).map((tag) => tag.name);
      const relationships = this.relationshipRepository.listForSourceEntry(entry.id);
      const sourceDocumentId = entry.sourceDocumentId ?? null;
      const sourceDocumentInfo = sourceDocumentId ? sourceDocumentMetadata.get(sourceDocumentId) ?? null : null;
      exportEntries.push({
        id: entry.id,
        title: entry.title,
        content: entry.content,
        category: entry.category,
        summary: entry.summary ?? null,
        confidence: entry.confidence ?? null,
        relatedFiles: entry.relatedFiles ?? [],
        tags,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        sourceDocumentPath: sourceDocumentId ? sourceDocuments.get(sourceDocumentId) ?? null : null,
        sourceDocumentChecksum: sourceDocumentInfo?.checksum ?? null,
        sourceDocumentLastIndexedAt: sourceDocumentInfo?.lastIndexedAt ?? null,
        relationships
      });
    }

    return exportEntries;
  }

  private buildManifest(project: Project, workspaceRoot: string, exportRoot: string, entries: ExportedMemoryEntry[]): ExportManifest {
    const sections = SECTION_DEFINITIONS.map((definition) => {
      let entryCount = entries.length;
      if (definition.key !== 'project-summary') {
        entryCount = entries.filter((entry) => this.matchesSection(definition.key, entry)).length;
      }

      return {
        key: definition.key,
        fileName: definition.fileName,
        title: definition.title,
        entryCount
      };
    });

    return ExportManifestSchema.parse({
      id: createId(),
      projectId: project.id,
      projectName: project.name,
      rootPath: workspaceRoot,
      exportRoot,
      generatedAt: now(),
      totalEntries: entries.length,
      sections
    });
  }

  private matchesSection(sectionKey: ExportSectionKey, entry: ExportedMemoryEntry): boolean {
    const haystack = `${entry.category} ${entry.tags.join(' ')}`.toLowerCase();

    switch (sectionKey) {
      case 'project-summary':
        return false;
      case 'decisions':
        return haystack.includes('decision') || haystack.includes('decide');
      case 'patterns':
        return haystack.includes('pattern');
      case 'bug-fixes':
        return haystack.includes('bug') || haystack.includes('fix') || haystack.includes('issue');
      case 'security-notes':
        return haystack.includes('security') || haystack.includes('secret') || haystack.includes('credential');
      case 'conventions':
        return haystack.includes('convention') || haystack.includes('style') || haystack.includes('standard') || haystack.includes('rule');
      default:
        return false;
    }
  }

  private detectProjectName(workspaceRoot: string): string {
    return this.cleanProjectName(path.basename(workspaceRoot));
  }

  private cleanProjectName(name: string): string {
    const cleaned = name.trim().replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-');
    return cleaned || 'unnamed-project';
  }
}
