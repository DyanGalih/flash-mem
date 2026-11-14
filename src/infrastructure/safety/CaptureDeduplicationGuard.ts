import * as crypto from 'crypto';

export interface CaptureDeduplicationInput {
  title: string;
  content: string;
  category: string;
  // Knowledge-mode fields (optional for backward compatibility)
  knowledgeType?: string;
  source?: string;
  authorityLevel?: string;
}

export class CaptureDeduplicationGuard {
  public signature(input: CaptureDeduplicationInput): string {
    // Legacy mode: title + content + category
    // Knowledge mode: knowledgeType + title + content + source + authorityLevel
    if (input.knowledgeType && input.source && input.authorityLevel) {
      return crypto.createHash('sha256')
        .update(`${input.knowledgeType}\n${input.title}\n${input.content}\n${input.source}\n${input.authorityLevel}`)
        .digest('hex');
    }
    
    // Legacy signature for backward compatibility
    return crypto.createHash('sha256')
      .update(`${input.title}\n${input.content}\n${input.category}`)
      .digest('hex');
  }
}