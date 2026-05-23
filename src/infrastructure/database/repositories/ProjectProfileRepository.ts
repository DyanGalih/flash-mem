import * as fs from 'fs/promises';
import * as path from 'path';
import { ProjectProfile, ProjectProfileSchema } from '../../../domain/entities/ProjectProfile';

export class ProjectProfileRepository {
  private readonly defaultProfilePath = '.flash-mem/project-profile.json';

  constructor(private readonly workspaceRoot: string) {}

  public async readProfile(): Promise<ProjectProfile | null> {
    const fullPath = path.resolve(this.workspaceRoot, this.defaultProfilePath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const data = JSON.parse(content);
      return ProjectProfileSchema.parse(data);
    } catch (e) {
      return null;
    }
  }

  public async writeProfile(profile: ProjectProfile): Promise<void> {
    const fullPath = path.resolve(this.workspaceRoot, this.defaultProfilePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, JSON.stringify(profile, null, 2), 'utf-8');
  }
}
