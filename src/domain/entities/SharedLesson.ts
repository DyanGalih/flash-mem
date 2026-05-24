import { z } from 'zod';

export const SharedLessonSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  lesson: z.string().min(1),
  framework: z.string().nullable(),
  language: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type SharedLesson = z.infer<typeof SharedLessonSchema>;
