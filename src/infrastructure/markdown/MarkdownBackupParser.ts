import * as path from 'path';
import { SecretScanner } from '../safety/SecretScanner';

export interface ParsedRelationship {
  targetEntryId: string;
  relationshipType: string;
}

export interface ParsedMemoryEntry {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  updatedAt: number;
  sourceDocumentPath: string | null;
  relationships: ParsedRelationship[];
}

export interface BackupFileParseResult {
  /** Entries successfully parsed from this file. */
  entries: ParsedMemoryEntry[];
  /** Non-fatal validation warnings accumulated during parsing. */
  warnings: string[];
  /** Project name extracted from frontmatter (if present). */
  projectName: string | null;
  /** Workspace root extracted from frontmatter (if present). */
  workspaceRoot: string | null;
}

/**
 * Parses a single markdown backup file, extracting YAML frontmatter and per-entry
 * metadata blocks produced by MarkdownExportFormatter.
 *
 * Positioned in the Markdown Infrastructure layer (src/infrastructure/markdown/).
 * Contains zero SQL or database access (Architecture Constitution §3).
 */
export class MarkdownBackupParser {
  /**
   * Parse an entire markdown backup file from raw string content.
   * Supports both section-level files (## heading per entry) and
   * project-summary files (### heading per entry).
   *
   * @param content  Raw UTF-8 markdown content.
   * @param filename Filename used in warning messages.
   */
  public parse(content: string, filename: string): BackupFileParseResult {
    const warnings: string[] = [];

    // --- 1. Extract YAML frontmatter ---
    const { frontmatter, body } = this.splitFrontmatter(content, filename, warnings);

    const projectName = this.scalarString(frontmatter, 'project');
    const workspaceRoot = this.scalarString(frontmatter, 'workspace_root');

    // --- 2. Determine heading level from file type ---
    // Section files use `## Title`; project-summary uses `### Title`
    const isProjectSummary = this.scalarString(frontmatter, 'section') === 'project-summary';
    const headingPrefix = isProjectSummary ? '### ' : '## ';

    // --- 3. Split body into per-entry chunks ---
    const entries = this.parseEntries(body, headingPrefix, filename, warnings);

    return { entries, warnings, projectName, workspaceRoot };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private splitFrontmatter(
    content: string,
    filename: string,
    warnings: string[]
  ): { frontmatter: Record<string, string | string[]>; body: string } {
    const lines = content.split('\n');
    if (lines[0]?.trim() !== '---') {
      warnings.push(`${filename}: Missing YAML frontmatter opening delimiter. File will be skipped.`);
      return { frontmatter: {}, body: '' };
    }

    const closingIndex = lines.slice(1).findIndex((l) => l.trim() === '---');
    if (closingIndex === -1) {
      warnings.push(`${filename}: Unclosed YAML frontmatter. File will be skipped.`);
      return { frontmatter: {}, body: '' };
    }

    const yamlLines = lines.slice(1, closingIndex + 1);
    const body = lines.slice(closingIndex + 2).join('\n');
    const frontmatter = this.parseSimpleYaml(yamlLines);

    return { frontmatter, body };
  }

  /**
   * Minimal YAML parser that handles the scalar and list shapes
   * emitted by MarkdownMetadataWriter.
   */
  private parseSimpleYaml(lines: string[]): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};
    let currentKey: string | null = null;
    let currentList: string[] | null = null;

    for (const raw of lines) {
      const line = raw.trimEnd();

      // List item (starts with "  - ")
      if (line.startsWith('  - ') && currentKey !== null && currentList !== null) {
        currentList.push(line.slice(4).trim());
        continue;
      }

      // Flush previous list
      if (currentKey !== null && currentList !== null) {
        result[currentKey] = currentList;
        currentKey = null;
        currentList = null;
      }

      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) {
        continue;
      }

      const key = line.slice(0, colonIdx).trim();
      const rest = line.slice(colonIdx + 1).trim();

      if (rest === '' || rest === '[]') {
        // Start a new list block (or empty list)
        currentKey = key;
        currentList = rest === '[]' ? [] : [];
        if (rest === '[]') {
          result[key] = [];
          currentKey = null;
          currentList = null;
        }
      } else {
        // Scalar value — strip surrounding quotes if present
        result[key] = this.unquote(rest);
        currentKey = null;
        currentList = null;
      }
    }

    // Flush trailing list
    if (currentKey !== null && currentList !== null) {
      result[currentKey] = currentList;
    }

    return result;
  }

  private scalarString(
    fm: Record<string, string | string[]>,
    key: string
  ): string | null {
    const v = fm[key];
    if (typeof v === 'string' && v.trim() !== '' && v.trim() !== 'null') {
      return v.trim();
    }
    return null;
  }

  private unquote(value: string): string {
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      return value.slice(1, -1);
    }
    return value;
  }

  /**
   * Split the body into per-entry segments using the given heading prefix,
   * then parse each segment into a ParsedMemoryEntry.
   */
  private parseEntries(
    body: string,
    headingPrefix: string,
    filename: string,
    warnings: string[]
  ): ParsedMemoryEntry[] {
    const lines = body.split('\n');
    const entryStartIndices: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(headingPrefix)) {
        entryStartIndices.push(i);
      }
    }

    const entries: ParsedMemoryEntry[] = [];

    for (let idx = 0; idx < entryStartIndices.length; idx++) {
      const start = entryStartIndices[idx];
      const end =
        idx + 1 < entryStartIndices.length
          ? entryStartIndices[idx + 1]
          : lines.length;

      const segment = lines.slice(start, end);
      const entry = this.parseEntrySegment(
        segment,
        headingPrefix,
        filename,
        warnings
      );
      if (entry !== null) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * Parse a single entry segment (from one heading to the next).
   */
  private parseEntrySegment(
    lines: string[],
    headingPrefix: string,
    filename: string,
    warnings: string[]
  ): ParsedMemoryEntry | null {
    const title = lines[0].slice(headingPrefix.length).trim();
    if (!title) {
      warnings.push(`${filename}: Found an entry heading with no title. Skipping.`);
      return null;
    }

    let id: string | null = null;
    let category: string | null = null;
    let tags: string[] = [];
    let updatedAt: number | null = null;
    let sourceDocumentPath: string | null = null;
    const relationships: ParsedRelationship[] = [];
    const contentLines: string[] = [];

    let inRelationships = false;
    let inContent = false;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Detect the Relationships section boundary
      if (line === '### Relationships' || line === '- Relationships:') {
        inRelationships = true;
        inContent = false;
        continue;
      }

      // Relationship entries
      if (inRelationships) {
        // Two formats produced by the formatter:
        //   "- relType -> `targetId`"        (section file)
        //   "  - relType -> `targetId`"      (project-summary)
        const relMatch = line.match(/^\s*-\s+(.+?)\s+->\s+`(.+?)`/);
        if (relMatch) {
          relationships.push({
            relationshipType: relMatch[1].trim(),
            targetEntryId: relMatch[2].trim()
          });
        }
        // Empty line — relationships block might be ending; keep flag until next meta line
        continue;
      }

      // Meta fields (list items starting with "- ")
      if (line.startsWith('- ')) {
        inContent = false;
        const meta = line.slice(2);

        if (meta.startsWith('ID: ')) {
          id = meta.slice(4).trim();
        } else if (meta.startsWith('Type: ') || meta.startsWith('Category: ')) {
          const isType = meta.startsWith('Type: ');
          category = meta.slice(isType ? 6 : 10).trim();
        } else if (meta.startsWith('Tags: ')) {
          tags = this.parseTags(meta.slice(6).trim());
        } else if (meta.startsWith('Updated: ')) {
          const dateStr = meta.slice(9).trim();
          const ts = Date.parse(dateStr);
          if (!isNaN(ts)) {
            updatedAt = ts;
          } else {
            warnings.push(`${filename}: Entry "${title}" has an unparseable Updated date "${dateStr}". Using current time.`);
            updatedAt = Date.now();
          }
        } else if (meta.startsWith('Source: ')) {
          const raw = meta.slice(8).trim();
          sourceDocumentPath = raw === 'not recorded' || raw === 'null'
            ? null
            : raw.replace(/^`|`$/g, '');
        }
        continue;
      }

      // Blockquote content lines ("> ...")
      if (line.startsWith('> ')) {
        inRelationships = false;
        inContent = true;
        contentLines.push(line.slice(2));
        continue;
      }

      // Plain blockquote line ("> " with nothing after — represents empty line in content)
      if (line === '>') {
        if (inContent) {
          contentLines.push('');
        }
        continue;
      }

      // Empty lines are valid separators
      if (line.trim() === '') {
        // Don't extend relationship block past a blank line
        if (inRelationships && contentLines.length > 0) {
          inRelationships = false;
        }
      }
    }

    // Validate required fields
    if (!id) {
      warnings.push(`${filename}: Entry "${title}" is missing required field "ID". Skipping.`);
      return null;
    }

    const rawContent = contentLines.join('\n').trim();
    if (!rawContent) {
      warnings.push(`${filename}: Entry "${title}" (${id}) has no parseable content. Skipping.`);
      return null;
    }

    // Apply secret redaction on title and content (D3 — SecretScanner must be used)
    const safeTitle = SecretScanner.redact(title);
    const safeContent = SecretScanner.redact(rawContent);

    return {
      id,
      title: safeTitle,
      content: safeContent,
      category: category ?? 'note',
      tags,
      updatedAt: updatedAt ?? Date.now(),
      sourceDocumentPath,
      relationships
    };
  }

  /**
   * Parse the tags string produced by MarkdownExportFormatter.formatTags().
   * Handles "`tag1`, `tag2`" and "none".
   */
  private parseTags(raw: string): string[] {
    if (!raw || raw === 'none') {
      return [];
    }
    return raw
      .split(',')
      .map((t) => t.trim().replace(/^`|`$/g, ''))
      .filter((t) => t.length > 0);
  }
}
