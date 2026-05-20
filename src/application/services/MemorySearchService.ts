import Database from 'better-sqlite3';
import { MemoryEntryRepository, MemoryEntryRecord } from '../../infrastructure/database/repositories/MemoryEntryRepository';

export class MemorySearchService {
  private readonly entryRepository: MemoryEntryRepository;

  constructor(private readonly db: Database.Database) {
    this.entryRepository = new MemoryEntryRepository(db);
  }

  public search(projectId: string, query: string, limit = 20): Array<MemoryEntryRecord & { score: number }> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    return this.entryRepository.search(projectId, trimmed, limit);
  }
}
