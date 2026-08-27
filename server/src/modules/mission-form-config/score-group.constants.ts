export const SCORE_GROUP_SCALE_MIN = 0;
export const SCORE_GROUP_SCALE_MAX = 100;

export type SystemScoreGroupSeed = {
  code: string;
  name: string;
  description: string;
  minScore: number;
  maxScore: number;
  maxInclusive: boolean;
  sortOrder: number;
};

export const SYSTEM_SCORE_GROUP_SEEDS: SystemScoreGroupSeed[] = [
  {
    code: 'DG-0001',
    name: 'Nhóm 1',
    description: '0 đến dưới 50 điểm',
    minScore: 0,
    maxScore: 50,
    maxInclusive: false,
    sortOrder: 1,
  },
  {
    code: 'DG-0002',
    name: 'Nhóm 2',
    description: '50 đến dưới 70 điểm',
    minScore: 50,
    maxScore: 70,
    maxInclusive: false,
    sortOrder: 2,
  },
  {
    code: 'DG-0003',
    name: 'Nhóm 3',
    description: '70 đến 100 điểm',
    minScore: 70,
    maxScore: 100,
    maxInclusive: true,
    sortOrder: 3,
  },
];

export function formatScoreGroupRange(
  minScore: number,
  maxScore: number,
  maxInclusive: boolean,
): string {
  return `${minScore} → ${maxInclusive ? maxScore : `dưới ${maxScore}`}`;
}

export function isScoreInGroupRange(
  score: number,
  minScore: number,
  maxScore: number,
  maxInclusive: boolean,
): boolean {
  if (score < minScore) return false;
  return maxInclusive ? score <= maxScore : score < maxScore;
}

/**
 * Điểm chuẩn suy ra từ dải khi nhóm không khai `formulaScore`.
 *
 * Dải hở ("0 → dưới 50") thì trần thật là 49, phải lùi một điểm. Phép lùi này
 * giả định chấm theo điểm nguyên - đó chính là lý do nên khai `formulaScore`
 * tường minh thay vì để hệ thống đoán.
 */
export function derivedFormulaScore(
  maxScore: number,
  maxInclusive: boolean,
): number {
  return maxInclusive ? maxScore : maxScore - 1;
}

/** Điểm chuẩn của nhóm dùng cho công thức - khai tường minh thì lấy nguyên. */
export function scoreGroupFormulaScore(group: {
  maxScore: number;
  maxInclusive: boolean;
  formulaScore?: number | null;
}): number {
  return (
    group.formulaScore ??
    derivedFormulaScore(group.maxScore, group.maxInclusive)
  );
}
