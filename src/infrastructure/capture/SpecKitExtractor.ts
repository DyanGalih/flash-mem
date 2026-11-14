import * as path from 'path';
import { ExtractionRule } from '../../domain/entities/ExtractionRule';
import { KnowledgeObjectInput, VALID_KNOWLEDGE_TYPES } from '../../domain/entities/KnowledgeObject';

type KnowledgeType = typeof VALID_KNOWLEDGE_TYPES[number];

interface Section {
  heading: string;
  level: number;
  content: string;
}

function splitSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let currentHeading = 'preamble';
  let currentLevel = 0;
  let currentContent: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentContent.push(line);
      continue;
    }
    const headingMatch = !inCodeBlock ? line.match(/^(#{2,3})\s+(.+)/) : null;
    if (headingMatch) {
      if (currentContent.length > 0) {
        sections.push({ heading: currentHeading, level: currentLevel, content: currentContent.join('\n').trim() });
      }
      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    sections.push({ heading: currentHeading, level: currentLevel, content: currentContent.join('\n').trim() });
  }

  return sections.filter(s => s.content.length > 0 && s.heading !== 'preamble');
}

function classifySection(heading: string, content: string): KnowledgeType {
  const combined = (heading + ' ' + content).toLowerCase();

  if (/\b(security|threat|vulnerability|auth|permission)\b/.test(combined)) return 'constraint';
  if (/\b(constraint|must not|cannot|restriction|limit)\b/.test(combined)) return 'constraint';
  if (/\b(architecture|design|component|module|layer)\b/.test(combined)) return 'pattern';
  if (/\b(api|endpoint|contract|interface|integration)\b/.test(combined)) return 'integration';
  if (/\b(convention|style|practice|recommend)\b/.test(combined)) return 'convention';
  if (/\b(dependency|library|version|package)\b/.test(combined)) return 'dependency';
  if (/\b(decision|rationale|why|trade.?off)\b/.test(combined)) return 'decision';
  if (/\b(requirement|shall|must|should|feature)\b/.test(combined)) return 'specification';
  if (/\b(test|spec|scenario|when|then)\b/.test(combined)) return 'specification';
  if (/\b(migration|upgrade|version|breaking)\b/.test(combined)) return 'pattern';
  if (/\b(lesson|insight|learned)\b/.test(combined)) return 'lesson';

  return 'decision';
}

export const specKitExtractorRule: ExtractionRule = {
  name: 'spec-kit-section',
  sourceType: 'spec_kit',
  filePattern: '**/*.spec.md',

  extract(content: string, filePath: string, projectId: string): KnowledgeObjectInput[] {
    const sections = splitSections(content);
    return sections.map((section) => {
      const knowledgeType = classifySection(section.heading, section.content);
      const title = `[${path.basename(filePath, '.spec.md')}] ${section.heading}`;

      return {
        projectId,
        knowledgeType,
        title,
        content: section.content,
        authorityLevel: 'provisional',
        authoritySource: filePath,
        confidence: 80,
        freshnessStatus: 'current',
        scopeLevel: 'project',
        captureMethod: 'manual',
        captureTool: 'flash-mem-v2-capture',
        extractionRule: 'spec-kit-section',
        tags: [knowledgeType],
      };
    });
  }
};