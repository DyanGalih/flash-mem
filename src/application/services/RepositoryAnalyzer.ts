import * as fs from 'fs-extra';
import * as path from 'path';

export interface FrameworkInfo {
  name: string;
  language: string;
  sourceFiles: string[];
}

function detectFromManifest(root: string, manifest: string, name: string, language: string): FrameworkInfo | null {
  const manifestPath = path.join(root, manifest);
  if (!fs.existsSync(manifestPath)) return null;
  return {
    name,
    language,
    sourceFiles: [manifest],
  };
}

export function detectFrameworks(root: string): FrameworkInfo[] {
  const results: FrameworkInfo[] = [];

  const node = detectFromManifest(root, 'package.json', 'Node.js', 'JavaScript/TypeScript');
  if (node) results.push(node);

  const rust = detectFromManifest(root, 'Cargo.toml', 'Rust', 'Rust');
  if (rust) results.push(rust);

  const python = detectFromManifest(root, 'pyproject.toml', 'Python', 'Python');
  if (python) results.push(python);

  const go = detectFromManifest(root, 'go.mod', 'Go', 'Go');
  if (go) results.push(go);

  return results;
}

export function detectLanguages(root: string): string[] {
  const languages = new Set<string>();
  const frameworks = detectFrameworks(root);
  for (const fw of frameworks) {
    languages.add(fw.language);
  }
  return Array.from(languages);
}

export function detectSourceFiles(root: string, patterns: string[]): string[] {
  const files: string[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\./g, '\\.').replace(/\//g, '/'), 'i');
    try {
      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(root, entry.name);
        if (entry.isFile() && regex.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch {
      // skip
    }
  }
  return files;
}

export function discoverDocumentationFiles(root: string): { specs: string[]; governance: string[]; architecture: string[] } {
  const specs: string[] = [];
  const governance: string[] = [];
  const architecture: string[] = [];

  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const name = entry.name.toLowerCase();
      if (name.endsWith('.spec.md')) specs.push(entry.name);
      if (name.includes('govern') || name.includes('policy')) governance.push(entry.name);
      if (name.includes('architecture') || name.includes('adr')) architecture.push(entry.name);
    }
  } catch {
    // skip
  }

  return { specs, governance, architecture };
}