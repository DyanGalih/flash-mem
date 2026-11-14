import * as fs from 'fs-extra';
import * as path from 'path';
import { ExtractionRuleRegistry } from '../../domain/entities/ExtractionRule';
import { KnowledgeObjectInput } from '../../domain/entities/KnowledgeObject';
import { KnowledgeService } from './KnowledgeService';
import { SecretScanner } from '../../infrastructure/safety/SecretScanner';

export interface CaptureResult {
  captured: number;
  skipped: number;
}

export class CaptureOrchestrator {
  constructor(
    private readonly registry: ExtractionRuleRegistry,
    private readonly knowledgeService: KnowledgeService
  ) {}

  public captureFromWorkspace(workspaceRoot: string, projectId: string): CaptureResult {
    const result: CaptureResult = { captured: 0, skipped: 0 };

    for (const rule of this.registry.getAll()) {
      const files = this.discoverFiles(workspaceRoot, rule.filePattern);
      
      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const redacted = SecretScanner.redact(content);
        const objects = rule.extract(redacted, filePath, projectId);
        
        for (const obj of objects) {
          const persisted = this.knowledgeService.create(obj as KnowledgeObjectInput);
          if (persisted) result.captured++;
          else result.skipped++;
        }
      }
    }

    return result;
  }

  public captureSingle(input: KnowledgeObjectInput): boolean {
    const redacted = SecretScanner.redact(input.content);
    const persisted = this.knowledgeService.create({ ...input, content: redacted });
    return persisted !== null;
  }

  private discoverFiles(root: string, pattern: string, baseRoot: string = root): string[] {
    const files: string[] = [];
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        if (entry.isDirectory() && (!entry.name.startsWith('.') || entry.name === '.architecture-guard')) {
          files.push(...this.discoverFiles(fullPath, pattern, baseRoot));
        } else if (entry.isFile()) {
          const relative = path.relative(baseRoot, fullPath);
          const patternRegex = pattern
            .replace(/\{([^}]+)\}/g, (_, choices) => `(?:${choices.split(',').join('|')})`)
            .replace(/\*\*\/?|\*|\./g, m => {
              if (m === '**/') return '(?:.*\\/)?';
              if (m === '**') return '.*';
              if (m === '*') return '[^/]*';
              if (m === '.') return '\\.';
              return m;
            });
          if (new RegExp(patternRegex, 'i').test(relative)) {
            files.push(fullPath);
          }
        }
      }
    } catch {
      // Directory not found
    }
    return files;
  }
}