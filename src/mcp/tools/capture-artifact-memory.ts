import { z } from 'zod';
import { ArtifactMemoryCaptureService } from '../../application/services/ArtifactMemoryCaptureService';
import { ArtifactMemoryCaptureInputSchema } from '../../domain/entities/ArtifactMemoryCapture';
import { WorkspaceManager } from "../WorkspaceManager";

export const captureArtifactMemoryInputSchema = ArtifactMemoryCaptureInputSchema.extend({
  project_path: z.string().min(1).describe("Absolute path to the workspace root")
});

export function createCaptureArtifactMemoryTool(manager: WorkspaceManager) {
  return {
    name: 'capture_artifact_memory',
    description: 'Capture repository artifacts into durable memory entries.',
    schema: captureArtifactMemoryInputSchema,
    execute: (input: z.infer<typeof captureArtifactMemoryInputSchema>) => {
      const service = manager.getBundle(input.project_path).artifactMemoryCaptureService;
      return service.captureArtifactMemory(input);
    }
  };
}
