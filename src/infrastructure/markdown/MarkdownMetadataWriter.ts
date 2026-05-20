export type FrontmatterValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

export type FrontmatterRecord = Record<string, FrontmatterValue>;

export class MarkdownMetadataWriter {
  public write(frontmatter: FrontmatterRecord): string {
    const lines = ['---'];

    for (const [key, value] of Object.entries(frontmatter)) {
      if (value === undefined) {
        continue;
      }
      lines.push(...this.formatEntry(key, value));
    }

    lines.push('---');
    return `${lines.join('\n')}\n`;
  }

  private formatEntry(key: string, value: FrontmatterValue): string[] {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return [`${key}: []`];
      }

      return [
        `${key}:`,
        ...value.map((item) => `  - ${this.formatScalar(item)}`)
      ];
    }

    return [`${key}: ${this.formatScalar(value)}`];
  }

  private formatScalar(value: string | number | boolean | null | undefined): string {
    if (value === null) {
      return 'null';
    }

    if (value === undefined) {
      return 'null';
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (value.includes('\n')) {
      const indented = value.split('\n').map((line) => `  ${line}`).join('\n');
      return `|\n${indented}`;
    }

    return JSON.stringify(value);
  }
}
