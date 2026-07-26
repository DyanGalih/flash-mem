import { KnowledgeObject, KnowledgeObjectInput } from '../../domain/entities/KnowledgeObject';
import { IAuthorityChainRepository, IKnowledgeObjectRepository, IKnowledgeRelationshipRepository, ITransactionRunner } from '../../domain/repositories/interfaces';

export class KnowledgeService {
  constructor(
    private readonly knowledgeRepo: IKnowledgeObjectRepository,
    private readonly relationshipRepo: IKnowledgeRelationshipRepository,
    private readonly authorityRepo: IAuthorityChainRepository,
    private readonly transactionRunner: ITransactionRunner
  ) { }

  create(input: KnowledgeObjectInput, sourceDocumentId: string | null = null): KnowledgeObject | null {
    return this.transactionRunner.run(() => {
      const hash = this.knowledgeHash(input);
      const existing = this.knowledgeRepo.findByHash(input.projectId, hash);
      if (existing) {
        return null;
      }

      return this.knowledgeRepo.create(input, sourceDocumentId);
    });
  }

  get(id: string): KnowledgeObject | null {
    return this.knowledgeRepo.findById(id);
  }

  update(
    id: string,
    input: Partial<{
      title: string; content: string; knowledgeType: string;
      summary: string | null; authorityLevel: string;
      authoritySource: string | null; confidence: number | null;
      freshnessStatus: string; scopeLevel: string;
      scopeProjects: string | null; scopePaths: string | null;
      captureMethod: string; captureTool: string;
      extractionRule: string | null;
    }>,
    changeReason: string,
    changedBy?: string
  ): KnowledgeObject | null {
    return this.transactionRunner.run(() => {
      const existing = this.knowledgeRepo.findById(id);
      if (!existing) return null;

      this.authorityRepo.append(existing.projectId, {
        objectId: id,
        previousHash: existing.hash,
        changeReason,
        changedBy
      });

      return this.knowledgeRepo.update(id, input);
    });
  }

  softDelete(id: string): boolean {
    return this.knowledgeRepo.softDelete(id);
  }

  listByProject(projectId: string): KnowledgeObject[] {
    return this.knowledgeRepo.listByProject(projectId);
  }

  private knowledgeHash(input: KnowledgeObjectInput): string {
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    return createHash('sha256')
      .update(input.knowledgeType + input.title + input.content + input.authorityLevel)
      .digest('hex');
  }
}