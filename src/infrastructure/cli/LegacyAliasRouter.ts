// Mock definitions for CLI commands
export const registerNewCommands = (program: any) => {
  program.command('synthesize-memory').action(() => {});
  program.command('synthesize-docs').action(() => {});
  program.command('sync-shared').action(() => {});
  program.command('promote-lesson').action(() => {});
  program.command('token-report').action(() => {});
};

export class LegacyAliasRouter {
  public registerAliases(program: any): void {
    program.command('speckit_memory_search')
      .description('Legacy alias for synthesize-memory')
      .action((options: any) => {
        // Forward to synthesize-memory
      });
  }
}
