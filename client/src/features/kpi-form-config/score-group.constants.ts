export const SCORE_GROUP_SCALE_MIN = 0;
export const SCORE_GROUP_SCALE_MAX = 100;

export function formatScoreGroupRange(
  minScore: number,
  maxScore: number,
  maxInclusive: boolean,
): string {
  return `${minScore} → ${maxInclusive ? maxScore : `dưới ${maxScore}`}`;
}
