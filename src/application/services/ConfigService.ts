import * as fs from 'fs-extra';
import * as path from 'path';
import { Config, ConfigSchema, DEFAULT_CONFIG } from '../../domain/entities/Config';
import { IConfigService } from '../../domain/repositories/interfaces';
import { PathSanitizer } from '../../infrastructure/safety/PathSanitizer';

export class ConfigService implements IConfigService {
  private configPath: string;

  constructor(workspaceRoot: string) {
    this.configPath = PathSanitizer.sanitizeSubPath(
      PathSanitizer.resolveRoot(workspaceRoot),
      '.flash-mem/config.json'
    );
  }

  public getConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(content);
        return ConfigSchema.parse({ ...DEFAULT_CONFIG, ...parsed });
      }
    } catch {
      // If config file is invalid or missing, return defaults
    }
    return DEFAULT_CONFIG;
  }

  public setConfig(config: Partial<Config>): Config {
    const current = this.getConfig();
    const merged = ConfigSchema.parse({ ...current, ...config });
    
    fs.ensureDirSync(path.dirname(this.configPath));
    fs.writeFileSync(this.configPath, JSON.stringify(merged, null, 2), 'utf-8');
    
    return merged;
  }

  public resetConfig(): Config {
    fs.ensureDirSync(path.dirname(this.configPath));
    fs.writeFileSync(this.configPath, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    return DEFAULT_CONFIG;
  }
}