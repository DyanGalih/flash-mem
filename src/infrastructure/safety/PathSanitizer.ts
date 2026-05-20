import * as path from 'path';

export class PathSanitizer {
  /**
   * Resolves a target path to an absolute path.
   * @param targetPath The input path (relative or absolute)
   */
  public static resolveRoot(targetPath: string): string {
    return path.resolve(targetPath);
  }

  /**
   * Validates if a file path is strictly located within the resolved target root directory.
   * Prevents directory traversal attacks (CWE-22).
   * @param resolvedRoot The absolute target project root path
   * @param filePath The file or folder path to check
   */
  public static isWithinRoot(resolvedRoot: string, filePath: string): boolean {
    const absoluteFilePath = path.resolve(filePath);
    const relative = path.relative(resolvedRoot, absoluteFilePath);

    // If the path goes outside the root, the relative path will start with '..'
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  /**
   * Sanitizes and verifies a sub-path within the resolved project root.
   * Throws an error if a directory traversal is detected.
   * @param resolvedRoot The absolute target project root path
   * @param subPath The sub-path to sanitize
   */
  public static sanitizeSubPath(resolvedRoot: string, subPath: string): string {
    const absolutePath = path.resolve(resolvedRoot, subPath);
    if (!this.isWithinRoot(resolvedRoot, absolutePath) && absolutePath !== resolvedRoot) {
      throw new Error(`Directory traversal detected: Path "${subPath}" escapes the workspace root "${resolvedRoot}"`);
    }
    return absolutePath;
  }
}
