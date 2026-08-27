export const SCORE_GROUP_SCALE_MIN = 0;
export const SCORE_GROUP_SCALE_MAX = 100;

export function formatScoreGroupRange(
  minScore: number,
  maxScore: number,
  maxInclusive: boolean,
): string {
  return `${minScore} → ${maxInclusive ? maxScore : `dưới ${maxScore}`}`;
}

/** Cùng luật với server - dùng khi kiểm điểm max khai tay có nằm trong dải. */
export function isScoreInGroupRange(
  score: number,
  minScore: number,
  maxScore: number,
  maxInclusive: boolean,
): boolean {
  if (score < minScore) return false;
  return maxInclusive ? score <= maxScore : score < maxScore;
}
