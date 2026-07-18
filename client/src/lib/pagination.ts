export const DEFAULT_PAGE_SIZE = 10;

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export function emptyPaginationMeta(limit = DEFAULT_PAGE_SIZE) {
  return {
    total: 0,
    page: 1,
    limit,
    totalPages: 1,
  };
}

/** STT trên UI theo trang hiện tại */
export function rowIndex(page: number, limit: number, index: number) {
  return (page - 1) * limit + index + 1;
}
