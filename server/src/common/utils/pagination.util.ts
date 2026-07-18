export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PaginatedResponse<T> = {
  success: true;
  message: string;
  data: T[];
  meta: PaginationMeta;
};

export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const safeLimit = Math.max(1, limit);
  const safePage = Math.max(1, page);
  return {
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  message = 'Lấy dữ liệu thành công.',
): PaginatedResponse<T> {
  return {
    success: true,
    message,
    data,
    meta: buildPaginationMeta(total, page, limit),
  };
}
