import { Project } from '../entities/Project';
import { MemoryEntry, MemoryEntryInput } from '../entities/MemoryEntry';
import { Tag } from '../entities/Tag';
import { Relationship, RelationshipInput } from '../entities/Relationship';
import { SourceDocument } from '../entities/SourceDocument';
import { IndexingRun } from '../entities/IndexingRun';

export interface ITransactionRunner {
  run<T>(work: () => T): T;
}

export interface IProjectRepository {
  findByRootPath(rootPath: string): Project | null;
  upsertByRootPath(rootPath: string, name: string): Project;
  findById(projectId: string): Project | null;
  clearProjectData(projectId: string): void;
}

export interface IMemoryEntryRepository {
  findById(entryId: string): MemoryEntry | null;
  listByProject(projectId: string): MemoryEntry[];
  /** Overwrite an existing entry by ID or insert a new one. Used for backup restoration. */
  restore(entry: MemoryEntry): void;
  create(input: MemoryEntryInput, sourceDocumentId?: string | null): MemoryEntry;
  update(
    entryId: string,
    input: Partial<{
      title: string;
      content: string;
      category: string;
      source: string;
      confidence: number | null;
      relatedFiles: string[] | null;
    }>
  ): MemoryEntry | null;
  softDelete(entryId: string): boolean;
  search(projectId: string, query: string, limit?: number): Array<MemoryEntry & { tags: string[]; relationships: Relationship[]; score: number }>;
  findByProjectAndHash(projectId: string, contentHash: string, category: string): MemoryEntry | null;
}

export interface ITagRepository {
  listForEntry(entryId: string): Tag[];
  replaceEntryTags(entryId: string, tagNames: string[]): Tag[];
}

export interface IRelationshipRepository {
  listForSourceEntry(entryId: string): Relationship[];
  upsert(projectId: string, sourceEntryId: string, relationship: RelationshipInput): Relationship;
}

export interface ISourceDocumentRepository {
  findById(id: string): SourceDocument | null;
  upsert(projectId: string, path: string, checksum: string, lastIndexedAt?: number | null): SourceDocument;
  findByProjectAndPath(projectId: string, path: string): SourceDocument | null;
  listByProject(projectId: string): SourceDocument[];
}

export interface IIndexingRunRepository {
  createRun(projectId: string, schemaVersion: string, sourceCount?: number): IndexingRun;
  finishRun(runId: string, status: IndexingRun['status'], entryCount: number, errorMessage?: string | null): void;
}
