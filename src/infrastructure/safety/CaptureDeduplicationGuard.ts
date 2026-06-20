import * as crypto from 'crypto';

export interface CaptureDeduplicationInput {
  title: string;
  content: string;
  category: string;
}

export class CaptureDeduplicationGuard {
  public signature(input: CaptureDeduplicationInput): string {
    return crypto.createHash('sha256').update(`${input.title}\n${input.content}\n${input.category}`).digest('hex');
  }
}