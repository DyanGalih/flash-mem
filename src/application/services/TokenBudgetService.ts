export class TokenBudgetService {
  public estimateTokens(text: string): number {
    // Rough estimate: 1 token ~= 4 characters in English text
    return Math.ceil(text.length / 4);
  }

  public checkBudget(currentTokens: number, maxBudget: number): boolean {
    return currentTokens <= maxBudget;
  }
}
