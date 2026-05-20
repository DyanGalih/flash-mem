import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { PathSanitizer } from '../../src/infrastructure/safety/PathSanitizer';

describe('PathSanitizer', () => {
  const mockRoot = path.resolve('/mock/project/root');

  describe('resolveRoot', () => {
    it('should resolve relative paths to absolute paths', () => {
      const resolved = PathSanitizer.resolveRoot('my-project');
      expect(path.isAbsolute(resolved)).toBe(true);
    });
  });

  describe('isWithinRoot', () => {
    it('should return true for paths inside root', () => {
      const subFolder = path.resolve(mockRoot, 'subfolder');
      const file = path.resolve(mockRoot, '.flash-mem/index.json');
      expect(PathSanitizer.isWithinRoot(mockRoot, subFolder)).toBe(true);
      expect(PathSanitizer.isWithinRoot(mockRoot, file)).toBe(true);
    });

    it('should return false for paths escaping the root', () => {
      const parentFolder = path.resolve(mockRoot, '../escaped');
      const outsideSystem = path.resolve('/etc/passwd');
      expect(PathSanitizer.isWithinRoot(mockRoot, parentFolder)).toBe(false);
      expect(PathSanitizer.isWithinRoot(mockRoot, outsideSystem)).toBe(false);
    });
  });

  describe('sanitizeSubPath', () => {
    it('should return absolute path for valid sub-paths', () => {
      const validSubPath = '.flash-mem/exports';
      const expected = path.resolve(mockRoot, validSubPath);
      expect(PathSanitizer.sanitizeSubPath(mockRoot, validSubPath)).toBe(expected);
    });

    it('should throw an error if sub-path escapes the root', () => {
      expect(() => {
        PathSanitizer.sanitizeSubPath(mockRoot, '../../escaped');
      }).toThrow('Directory traversal detected');
    });
  });
});
