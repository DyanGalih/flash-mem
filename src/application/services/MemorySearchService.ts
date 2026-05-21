import { IMemoryEntryRepository } from '../../domain/repositories/interfaces';
import { MemoryEntry } from '../../domain/entities/MemoryEntry';
import { Relationship } from '../../domain/entities/Relationship';

export class MemorySearchService {
  constructor(private readonly entryRepository: IMemoryEntryRepository) {}

  public search(
    projectId: string,
    query: string,
    limit = 20
  ): Array<MemoryEntry & { tags: string[]; relationships: Relationship[]; score: number }> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    return this.entryRepository.search(projectId, trimmed, limit);
  }
}
