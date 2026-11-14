import { KnowledgeObjectInput } from './KnowledgeObject';

export interface ExtractionRule {
  name: string;
  sourceType: string;
  filePattern: string;
  extract(content: string, filePath: string, projectId: string): KnowledgeObjectInput[];
}

export class ExtractionRuleRegistry {
  private rules: Map<string, ExtractionRule> = new Map();

  public register(rule: ExtractionRule): void {
    this.rules.set(rule.sourceType, rule);
  }

  public getForSourceType(sourceType: string): ExtractionRule | undefined {
    return this.rules.get(sourceType);
  }

  public getAll(): ExtractionRule[] {
    return Array.from(this.rules.values());
  }

  public findMatching(filePath: string): ExtractionRule[] {
    const matched: ExtractionRule[] = [];
    for (const rule of this.rules.values()) {
      const pattern = rule.filePattern
        .replace(/\./g, '\\.')
        .replace(/\{([^}]+)\}/g, (_, choices) => `(?:${choices.split(',').join('|')})`)
        .replace(/\*\*\//g, '(?:.*\\/)?')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*');
      if (new RegExp(pattern, 'i').test(filePath)) {
        matched.push(rule);
      }
    }
    return matched;
  }
}