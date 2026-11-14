export function initialInterest(difficulty: string): number {
  return difficulty === "hard" ? -40 : difficulty === "medium" ? -20 : 0;
}
