import { z } from 'zod';
import { ArtifactMemoryCaptureService } from '../../application/services/ArtifactMemoryCaptureService';
import { ArtifactMemoryCaptureInputSchema } from '../../domain/entities/ArtifactMemoryCapture';

export const captureArtifactMemoryInputSchema = ArtifactMemoryCaptureInputSchema;

export function createCaptureArtifactMemoryTool(service: ArtifactMemoryCaptureService) {
  return {
    name: 'capture_artifact_memory',
    description: 'Capture repository artifacts into durable memory entries.',
    schema: captureArtifactMemoryInputSchema,
    execute: (input: z.infer<typeof captureArtifactMemoryInputSchema>) => service.captureArtifactMemory(input)
  };
}
