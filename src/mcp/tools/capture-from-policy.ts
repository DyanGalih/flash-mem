import { z } from 'zod';
import { WorkspaceManager } from "../WorkspaceManager";

const CaptureFromPolicyInputSchema = z.object({
  project_path: z.string().min(1),
});

export function createCaptureFromPolicyTool(manager: WorkspaceManager) {
  return {
    name: 'capture_from_policy',
    description: 'Capture knowledge from Architecture Guard policies in the workspace',
    schema: CaptureFromPolicyInputSchema,
    responseFormat: 'json' as const,
    execute: (input: any) => {
      const validated = CaptureFromPolicyInputSchema.parse(input);
      const bundle = manager.getBundle(validated.project_path);
      const orchestrator = (bundle as any).captureOrchestrator;

      const result = orchestrator.captureFromWorkspace(validated.project_path, bundle.project.id);
      return result;
    }
  };
}