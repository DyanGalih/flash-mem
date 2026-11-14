import { ExtractionRule } from '../../domain/entities/ExtractionRule';
import { KnowledgeObjectInput, VALID_KNOWLEDGE_TYPES } from '../../domain/entities/KnowledgeObject';
import { now } from '../database/helpers';

type KnowledgeType = typeof VALID_KNOWLEDGE_TYPES[number];

interface PolicyRule {
  domain: string;
  type: string;
  description: string;
}

function parsePolicyYaml(content: string): PolicyRule[] {
  const rules: PolicyRule[] = [];
  const lines = content.split('\n');
  let currentDomain = '';
  let currentType = '';
  let currentDescription = '';

  for (const line of lines) {
    const domainMatch = line.match(/^domain:\s*(.+)/i);
    if (domainMatch) {
      currentDomain = domainMatch[1].trim();
      continue;
    }

    const typeMatch = line.match(/^(requires|forbids|recommends|warns):\s*(.+)/i);
    if (typeMatch) {
      if (currentDescription) {
        rules.push({ domain: currentDomain, type: currentType, description: currentDescription.trim() });
        currentDescription = '';
      }
      currentType = typeMatch[1].toLowerCase();
      currentDescription = typeMatch[2];
      continue;
    }

    if (currentDescription && line.trim() && line.startsWith('  ')) {
      currentDescription += ' ' + line.trim();
    }
  }

  if (currentDescription) {
    rules.push({ domain: currentDomain, type: currentType, description: currentDescription.trim() });
  }

  return rules;
}

function mapPolicyType(type: string): KnowledgeType {
  switch (type) {
    case 'requires': return 'constraint';
    case 'forbids': return 'constraint';
    case 'recommends': return 'decision';
    case 'warns': return 'risk';
    default: return 'decision';
  }
}

export const architectureGuardExtractorRule: ExtractionRule = {
  name: 'architecture-guard-policy',
  sourceType: 'architecture_guard',
  filePattern: '**/.architecture-guard/**/*.{yaml,yml}',

  extract(content: string, filePath: string, projectId: string): KnowledgeObjectInput[] {
    const rules = parsePolicyYaml(content);
    return rules.map((rule) => {
      const knowledgeType = mapPolicyType(rule.type);
      const title = `[${rule.domain}] ${rule.type}: ${rule.description.substring(0, 80)}`;

      return {
        projectId,
        knowledgeType,
        title,
        content: rule.description,
        authorityLevel: 'definitive',
        authoritySource: filePath,
        confidence: 100,
        freshnessStatus: 'current',
        scopeLevel: 'project',
        captureMethod: 'manual',
        captureTool: 'flash-mem-v2-capture',
        extractionRule: 'architecture-guard-policy',
        tags: [rule.domain],
      };
    });
  }
};