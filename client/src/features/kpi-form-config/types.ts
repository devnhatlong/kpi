export type ContentGroup = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
};

export type ContentGroupInput = {
  code?: string;
  name: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type ContentGroupRef = {
  _id: string;
  code: string;
  name: string;
};

export type WorkContent = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  contentGroupId: string | ContentGroupRef;
  sortOrder: number;
  isActive: boolean;
};

export type WorkContentInput = {
  code?: string;
  name: string;
  description?: string;
  contentGroupId: string;
  sortOrder?: number;
  isActive?: boolean;
};

export type ScoreGroup = {
  _id: string;
  id?: string;
  code: string;
  name: string;
  description?: string;
  minScore: number;
  maxScore: number;
  maxInclusive: boolean;
  sortOrder: number;
  isActive: boolean;
  isSystem?: boolean;
};

export type ScoreGroupInput = {
  code?: string;
  name: string;
  description?: string;
  minScore: number;
  maxScore: number;
  maxInclusive?: boolean;
  sortOrder?: number;
  isActive?: boolean;
};

export type ListQueryParams = {
  page?: number;
  limit?: number;
  q?: string;
  all?: boolean;
};

export type PaginatedResult<T> = {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};

export function entityId(
  value: { _id?: string; id?: string } | string,
): string {
  if (typeof value === "string") return value;
  return value._id ?? value.id ?? "";
}
