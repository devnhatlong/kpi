"use client";

import { useMemo } from "react";

import { SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE_OPTIONS } from "@/lib/pagination";

type TablePaginationProps = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  disabled?: boolean;
};

export function TablePagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onLimitChange,
  disabled,
}: TablePaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const pageSizeOptions = useMemo(
    () => PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) })),
    [],
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Hiển thị {from}-{to} / {total}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">Mỗi trang</span>
          <SearchableSelect
            value={String(limit)}
            onValueChange={(value) => onLimitChange(Number(value))}
            options={pageSizeOptions}
            searchPlaceholder="Tìm..."
            disabled={disabled}
            triggerClassName="h-8 w-[88px] px-2"
          />
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Trước
          </Button>
          <span className="px-2 text-sm tabular-nums text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
