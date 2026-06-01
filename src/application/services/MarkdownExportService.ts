import * as path from 'path';
import { ExportManifest, ExportManifestSchema, ExportSectionKey } from '../../domain/entities/ExportManifest';
import { Project, ProjectSchema } from '../../domain/entities/Project';
import { ProjectSummary } from '../../domain/entities/ProjectSummary';
import {
  IMemoryEntryRepository,
  IProjectRepository,
  IProjectSummaryRepository,
  IRelationshipRepository,
  ISourceDocumentRepository,
  ITagRepository
} from '../../domain/repositories/interfaces';
import { createId, now } from '../../infrastructure/database/helpers';
import { ExportedMemoryEntry, MarkdownExportFormatter } from '../../infrastructure/markdown/MarkdownExportFormatter';
import { MarkdownExportWriter } from '../../infrastructure/markdown/MarkdownExportWriter';
import { ExportSafetyGuard } from '../../infrastructure/safety/ExportSafetyGuard';
import { SchemaMigrationService } from './SchemaMigrationService';

export interface MarkdownExportFileResult {
  fileName: string;
  path: string;
  entryCount: number;
}

export interface MarkdownExportResult {
  manifest: ExportManifest;
  files: MarkdownExportFileResult[];
  skippedFiles: number;
  prunedDirectories: string[];
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

const MAX_ENTRIES_PER_EXPORT_FILE = 20;

export class MarkdownExportService {
  private readonly formatter: MarkdownExportFormatter;
  private readonly exportWriter: MarkdownExportWriter;
  private readonly exportSafetyGuard: ExportSafetyGuard;

  constructor(
    private readonly projectRepository: IProjectRepository,
    private readonly projectSummaryRepository: IProjectSummaryRepository,
    private readonly memoryEntryRepository: IMemoryEntryRepository,
    private readonly tagRepository: ITagRepository,
    private readonly relationshipRepository: IRelationshipRepository,
    private readonly sourceDocumentRepository: ISourceDocumentRepository,
    private readonly schemaMigrationService?: SchemaMigrationService
  ) {
    this.formatter = new MarkdownExportFormatter();
    this.exportWriter = new MarkdownExportWriter();
    this.exportSafetyGuard = new ExportSafetyGuard();
  }

  public async exportWorkspace(workspaceRoot: string): Promise<MarkdownExportResult> {
    this.schemaMigrationService?.ensureCurrentSchema();

    const project = this.resolveProject(workspaceRoot);
    const entries = this.loadEntriesForExport(project.id);
    const exportRoot = path.join(workspaceRoot, '.flash-mem', 'exports');
    const manifest = this.buildManifest(project, workspaceRoot, exportRoot, entries);
    const manifestSections = new Map(manifest.sections.map((section) => [section.key, section]));
    const renderedFiles = this.renderDatedFiles(manifest, manifestSections, entries, this.projectSummaryRepository.findByProjectId(project.id));

    const writeResult = await this.exportWriter.write(workspaceRoot, renderedFiles);
    const prunedDirectories = await this.exportSafetyGuard.pruneStaleExports(writeResult.exportRoot);

    return {
      manifest,
      skippedFiles: writeResult.skipped,
      prunedDirectories,
      files: renderedFiles
        .map(({ content: _content, ...file }) => ({
          ...file,
          path: path.join(writeResult.exportRoot, file.fileName)
        }))
        .sort((left, right) => left.fileName.localeCompare(right.fileName))
    };
  }

  private renderDatedFiles(
    manifest: ExportManifest,
    manifestSections: Map<ExportSectionKey, ExportManifest['sections'][number]>,
    entries: ExportedMemoryEntry[],
    projectSummary: ProjectSummary | null
  ): Array<{ fileName: string; content: string; entryCount: number }> {
    const entriesByDate = this.groupEntriesByDate(entries);
    const renderedFiles: Array<{ fileName: string; content: string; entryCount: number }> = [];

    const projectSummarySection = manifestSections.get('project-summary');
    if (!projectSummarySection) {
      throw new Error('Missing export section definition for "project-summary"');
    }
    const overviewEntries = this.buildProjectSummaryEntries(entries, projectSummary, manifest.generatedAt);
    renderedFiles.push({
      fileName: projectSummarySection.fileName,
      content: this.formatter.formatSectionDocument(manifest, projectSummarySection, overviewEntries, {
        fileName: projectSummarySection.fileName,
        dateKey: new Date(manifest.generatedAt).toISOString().slice(0, 10),
        displayTitle: projectSummarySection.title,
        compact: true
      }),
      entryCount: overviewEntries.length
    });

    for (const [dateKey, datedEntries] of entriesByDate) {
      for (const definition of SECTION_DEFINITIONS) {
        if (definition.key === 'project-summary') {
          continue;
        }

        const sectionEntries = datedEntries.filter((entry) => this.matchesSection(definition.key, entry));

        const section = manifestSections.get(definition.key);
        if (!section) {
          throw new Error(`Missing export section definition for "${definition.key}"`);
        }

        const sectionChunks = this.chunkEntries(sectionEntries, MAX_ENTRIES_PER_EXPORT_FILE);
        for (const [chunkIndex, chunkEntries] of sectionChunks.entries()) {
          const fileName = path.join(dateKey, this.buildChunkedFileName(definition.fileName, chunkIndex, sectionChunks.length));
          const chunkLabel = sectionChunks.length > 1 ? `part ${String(chunkIndex + 1).padStart(2, '0')} of ${String(sectionChunks.length).padStart(2, '0')}` : undefined;
          renderedFiles.push({
            fileName,
            content: this.formatter.formatSectionDocument(manifest, section, chunkEntries, {
              fileName,
              dateKey,
              displayTitle: chunkLabel ? `${section.title} - ${dateKey} (${chunkLabel})` : section.title,
              compact: true
            }),
            entryCount: chunkEntries.length
          });
        }
      }
    }

    return renderedFiles.sort((left, right) => left.fileName.localeCompare(right.fileName));
  }

  private buildProjectSummaryEntries(
    entries: ExportedMemoryEntry[],
    projectSummary: ProjectSummary | null,
    generatedAt: number
  ): ExportedMemoryEntry[] {
    const categoryCounts = new Map<string, number>();
    for (const entry of entries) {
      categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + 1);
    }

    const categoryBreakdown = [...categoryCounts.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));

    const highConfidenceIndex = entries
      .filter((entry) => (entry.confidence ?? 0) >= 90)
      .map((entry) => ({
        title: entry.title,
        category: entry.category,
        confidence: entry.confidence ?? 0
      }))
      .sort((left, right) => right.confidence - left.confidence || left.title.localeCompare(right.title));

    const overview = {
      projectSummary,
      categoryBreakdown,
      highConfidenceIndex
    };

    return [{
      id: 'project-summary-overview',
      title: 'Project Summary Overview',
      content: JSON.stringify(overview),
      category: 'project-summary',
      summary: 'Concise project summary overview export payload.',
      confidence: 100,
      relatedFiles: [],
      tags: [],
      createdAt: generatedAt,
      updatedAt: generatedAt,
      sourceDocumentPath: null,
      sourceDocumentChecksum: null,
      sourceDocumentLastIndexedAt: null,
      relationships: []
    }];
  }

  private chunkEntries<T>(entries: T[], chunkSize: number): T[][] {
    if (entries.length === 0) {
      return [[]];
    }

    const chunks: T[][] = [];
    for (let index = 0; index < entries.length; index += chunkSize) {
      chunks.push(entries.slice(index, index + chunkSize));
    }

    return chunks;
  }

  private buildChunkedFileName(fileName: string, chunkIndex: number, chunkCount: number): string {
    if (chunkCount === 1) {
      return fileName;
    }

    const extension = path.extname(fileName);
    const baseName = path.basename(fileName, extension);
    const suffix = `part-${String(chunkIndex + 1).padStart(2, '0')}`;
    return `${baseName}.${suffix}${extension}`;
  }

  private groupEntriesByDate(entries: ExportedMemoryEntry[]): Map<string, ExportedMemoryEntry[]> {
    const grouped = new Map<string, ExportedMemoryEntry[]>();

    for (const entry of entries) {
      const dateKey = new Date(entry.createdAt).toISOString().slice(0, 10);
      const current = grouped.get(dateKey);
      if (current) {
        current.push(entry);
      } else {
        grouped.set(dateKey, [entry]);
      }
    }

    return new Map([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)));
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
      if (definition.key === 'project-summary') {
        entryCount = 1;
      } else {
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
