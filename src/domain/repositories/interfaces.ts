import { Project } from '../entities/Project';
import { MemoryEntry } from '../entities/MemoryEntry';
import { Tag } from '../entities/Tag';
import { Relationship } from '../entities/Relationship';
import { SourceDocument } from '../entities/SourceDocument';
import { IndexingRun } from '../entities/IndexingRun';

export interface IProjectRepository {
  findByRootPath(rootPath: string): Project | null;
  upsertByRootPath(rootPath: string, name: string): Project;
  findById(projectId: string): Project | null;
}

export interface IMemoryEntryRepository {
  findById(entryId: string): MemoryEntry | null;
  listByProject(projectId: string): MemoryEntry[];
  /** Overwrite an existing entry by ID or insert a new one. Used for backup restoration. */
  restore(entry: MemoryEntry): void;
}

export interface ITagRepository {
  listForEntry(entryId: string): Tag[];
}

export interface IRelationshipRepository {
  listForSourceEntry(entryId: string): Relationship[];
}

export interface ISourceDocumentRepository {
  findById(id: string): SourceDocument | null;
  upsert(projectId: string, path: string, checksum: string, lastIndexedAt?: number | null): SourceDocument;
}

export interface IIndexingRunRepository {
  createRun(projectId: string, schemaVersion: string, sourceCount?: number): IndexingRun;
  finishRun(runId: string, status: IndexingRun['status'], entryCount: number, errorMessage?: string | null): void;
}
