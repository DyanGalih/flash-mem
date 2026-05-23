export interface CaptureDeduplicationInput {
  title: string;
  content: string;
  category: string;
}

export class CaptureDeduplicationGuard {
  public signature(input: CaptureDeduplicationInput): string {
    return Buffer.from(`${input.title}\n${input.content}\n${input.category}`).toString('base64');
  }
}