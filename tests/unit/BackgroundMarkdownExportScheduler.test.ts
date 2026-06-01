import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundMarkdownExportScheduler, resolveBackgroundMarkdownExportDelayMs } from '../../src/application/services/BackgroundMarkdownExportScheduler';

describe('BackgroundMarkdownExportScheduler', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    vi.useFakeTimers();
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-mem-export-scheduler-'));
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.removeSync(workspaceRoot);
  });

  it('debounces repeated export requests before launching the worker', () => {
    const launcher = { launch: vi.fn() };
    const scheduler = new BackgroundMarkdownExportScheduler(launcher, 100);

    scheduler.schedule(workspaceRoot);
    scheduler.schedule(workspaceRoot);
    scheduler.schedule(workspaceRoot);

    vi.advanceTimersByTime(99);
    expect(launcher.launch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(launcher.launch).toHaveBeenCalledTimes(1);
    expect(launcher.launch).toHaveBeenCalledWith(path.resolve(workspaceRoot));
  });

  it('resolves the debounce delay from the environment with a safe default', () => {
    expect(resolveBackgroundMarkdownExportDelayMs({})).toBe(100);
    expect(resolveBackgroundMarkdownExportDelayMs({ FLASH_MEM_BACKGROUND_EXPORT_DELAY_MS: '250' })).toBe(250);
    expect(resolveBackgroundMarkdownExportDelayMs({ FLASH_MEM_BACKGROUND_EXPORT_DELAY_MS: '-1' })).toBe(100);
    expect(resolveBackgroundMarkdownExportDelayMs({ FLASH_MEM_BACKGROUND_EXPORT_DELAY_MS: 'not-a-number' })).toBe(100);
  });
});