import { createHash } from 'node:crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createId, now } from '../../infrastructure/database/helpers';
import { ProjectProfile } from '../../domain/entities/ProjectProfile';
import { SharedLesson } from '../../domain/entities/SharedLesson';
import { SharedLessonRecord, SharedLessonRepository } from '../../infrastructure/database/repositories/SharedLessonRepository';
import { ProjectProfileRepository } from '../../infrastructure/database/repositories/ProjectProfileRepository';

export interface SharedLessonSyncResult {
  markdown: string;
  reviewMarkdown: string;
  filePath: string;
  reviewFilePath: string;
  lessons: SharedLessonRecord[];
  sourceCount: number;
  filters: {
    framework: string | null;
    language: string | null;
  };
}

export class SharedLessonService {
  constructor(
    private readonly repository?: SharedLessonRepository,
    private readonly profileRepositoryFactory: (workspaceRoot: string) => ProjectProfileRepository = (workspaceRoot) => new ProjectProfileRepository(workspaceRoot)
  ) {}

  public async getLessonsByFramework(framework: string): Promise<SharedLesson[]> {
    if (!this.repository) {
      return [];
    }

    const lessons = await this.repository.getLessonsByFramework(framework);
    return lessons;
  }

  public async promoteLesson(topic: string, lesson: string, framework?: string, language?: string, workspaceRoot?: string): Promise<SharedLesson> {
    return this.promoteLessonInternal(createId(), topic, lesson, framework, language, workspaceRoot);
  }

  public async promoteLessonWithId(
    id: string,
    topic: string,
    lesson: string,
    framework?: string,
    language?: string,
    workspaceRoot?: string
  ): Promise<SharedLesson> {
    return this.promoteLessonInternal(id.trim(), topic, lesson, framework, language, workspaceRoot);
  }

  public async syncSharedLessons(workspaceRoot: string, options: { framework?: string; language?: string; limit?: number } = {}): Promise<SharedLessonSyncResult> {
    const root = path.resolve(workspaceRoot);
    const profile = await this.readProfile(root);
    const framework = (options.framework ?? profile?.framework ?? '').trim() || null;
    const language = (options.language ?? profile?.language ?? '').trim() || null;
    const limit = options.limit ?? 10;
    const lessons = this.repository
      ? await this.repository.listMatchingLessons({
        framework,
        language,
        limit
      })
      : [];

    const markdown = this.renderSharedLessonsMarkdown(root, profile, lessons, { framework, language });
    const filePath = path.join(root, 'SHARED_LESSONS.md');
    const reviewFilePath = path.join(root, 'docs', 'memory', 'SHARED_LESSONS.md');
    const reviewMarkdown = this.renderSharedLessonsReviewMarkdown(root, profile, lessons, { framework, language });

    fs.writeFileSync(filePath, markdown, 'utf-8');
    fs.ensureDirSync(path.dirname(reviewFilePath));
    fs.writeFileSync(reviewFilePath, reviewMarkdown, 'utf-8');

    return {
      markdown,
      reviewMarkdown,
      filePath,
      reviewFilePath,
      lessons,
      sourceCount: lessons.length,
      filters: {
        framework,
        language
      }
    };
  }

  public async readProfile(workspaceRoot: string): Promise<ProjectProfile | null> {
    return this.profileRepositoryFactory(workspaceRoot).readProfile();
  }

  private renderSharedLessonsMarkdown(
    workspaceRoot: string,
    profile: ProjectProfile | null,
    lessons: SharedLessonRecord[],
    filters: { framework: string | null; language: string | null }
  ): string {
    const lines: string[] = [
      '# Shared Lessons',
      '',
      `- Workspace: \`${workspaceRoot}\``,
      `- Framework: ${filters.framework ?? 'any'}`,
      `- Language: ${filters.language ?? 'any'}`,
      `- Lessons: ${lessons.length}`,
      profile ? `- Profile eligible: ${profile.sharedMemoryEligible ? 'yes' : 'no'}` : '- Profile: not configured',
      ''
    ];

    if (lessons.length === 0) {
      lines.push('No shared lessons matched the current filters.', '');
      return lines.join('\n');
    }

    for (const item of lessons) {
      lines.push(
        `## ${item.topic}`,
        `- Lesson: ${item.lesson}`,
        `- Framework: ${item.framework ?? 'n/a'}`,
        `- Language: ${item.language ?? 'n/a'}`,
        `- Created: ${item.createdAt}`,
        ''
      );
    }

    return lines.join('\n');
  }

  private renderSharedLessonsReviewMarkdown(
    workspaceRoot: string,
    profile: ProjectProfile | null,
    lessons: SharedLessonRecord[],
    filters: { framework: string | null; language: string | null }
  ): string {
    const lines: string[] = [
      '# Shared Lessons Review Buffer',
      '',
      `- Workspace: \`${workspaceRoot}\``,
      `- Review context: framework=${filters.framework ?? 'any'}, language=${filters.language ?? 'any'}, lessons=${lessons.length}`,
      profile ? `- Shared memory eligible: ${profile.sharedMemoryEligible ? 'yes' : 'no'}` : '- Shared memory eligible: unknown',
      '',
      '## Review Guidance',
      '- This file is temporary review space, not durable memory.',
      '- Copy useful items into durable memory with `add_memory` or `update_memory`.',
      '- Delete this file after review or after merging its useful lessons.',
      '',
      '## Lessons To Review',
      ''
    ];

    if (lessons.length === 0) {
      lines.push('No shared lessons matched the current filters.', '');
      return lines.join('\n');
    }

    for (const item of lessons) {
      lines.push(
        `### ${item.topic}`,
        `- Lesson: ${item.lesson}`,
        `- Framework: ${item.framework ?? 'n/a'}`,
        `- Language: ${item.language ?? 'n/a'}`,
        `- Created: ${item.createdAt}`,
        `- Updated: ${new Date(item.updatedAt).toISOString()}`,
        ''
      );
    }

    lines.push(
      '## Next Step',
      '- Review the lessons above, promote durable items into memory, and remove this temporary buffer when done.',
      ''
    );

    return lines.join('\n');
  }

  private async promoteLessonInternal(
    id: string,
    topic: string,
    lesson: string,
    framework?: string,
    language?: string,
    workspaceRoot?: string
  ): Promise<SharedLesson> {
    const entry: SharedLesson = {
      id,
      topic: topic.trim(),
      lesson: lesson.trim(),
      framework: framework?.trim() ? framework.trim() : null,
      language: language?.trim() ? language.trim() : null,
      createdAt: new Date(now()).toISOString()
    };

    if (this.repository) {
      const sourceProjectHash = this.hashProjectRoot(workspaceRoot ?? topic);
      await this.repository.saveLesson(entry, sourceProjectHash);
    }

    return entry;
  }

  private hashProjectRoot(value: string): string {
    return createHash('sha256').update(path.resolve(value)).digest('hex');
  }
}
