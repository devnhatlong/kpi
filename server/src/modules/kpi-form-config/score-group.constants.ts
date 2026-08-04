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
