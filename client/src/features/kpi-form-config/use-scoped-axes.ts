"use client";

import { useMemo } from "react";
import useSWR from "swr";

import {
  axisKeys,
  fetchAxesAll,
  fetchMyReportScope,
  reportTemplateKeys,
} from "@/features/kpi-form-config/api";
import {
  entityId,
  type Axis,
  type ReportScopeSource,
} from "@/features/kpi-form-config/types";

export type ScopedAxes = {
  /** Trục của mẫu áp dụng cho đơn vị mình, theo đúng thứ tự khối trên báo cáo. */
  axes: Axis[];
  source: ReportScopeSource;
  /** Tên mẫu đang áp dụng; rỗng khi chưa mẫu nào phủ đơn vị. */
  templateName: string;
  includeCriteria: boolean;
  isLoading: boolean;
  error: unknown;
};

type UseScopedAxesOptions = {
  enabled?: boolean;
  /**
   * Trục phải có mặt dù nằm ngoài mẫu - dùng khi đang sửa một bản ghi cũ khai ở
   * trục đã bị loại khỏi mẫu. Bỏ trục đó khỏi dropdown thì người sửa không thấy
   * nhiệm vụ đang thuộc trục nào, và lưu lại là mất trục.
   */
  ensureAxisIds?: string[];
};

/**
 * Trục mà đơn vị của người đang đăng nhập được dùng, theo mẫu báo cáo áp dụng.
 *
 * Chưa mẫu nào phủ đơn vị thì server trả toàn bộ trục đang hoạt động kèm
 * `source = 'fallback'` - hệ thống có dữ liệu từ trước khi có mẫu báo cáo, khoá
 * màn nhập lại vì chưa ai kịp gán mẫu thì hại hơn là lợi. Màn nhập nên đọc cờ
 * này để nói rõ đang ở tình trạng nào.
 */
export function useScopedAxes(options: UseScopedAxesOptions = {}): ScopedAxes {
  const { enabled = true, ensureAxisIds } = options;

  const { data, isLoading, error } = useSWR(
    enabled ? reportTemplateKeys.mine() : null,
    () => fetchMyReportScope(),
    { revalidateOnFocus: false },
  );

  const scopedIds = useMemo(
    () => new Set((data?.axes ?? []).map(entityId)),
    [data],
  );
  const missing = useMemo(
    () => (ensureAxisIds ?? []).filter((id) => id && !scopedIds.has(id)),
    [ensureAxisIds, scopedIds],
  );

  // Chỉ gọi thêm khi thật sự thiếu - đa số lượt mở form không cần danh sách đủ.
  const { data: allAxes } = useSWR(
    enabled && data && missing.length ? axisKeys.all : null,
    fetchAxesAll,
    { revalidateOnFocus: false },
  );

  return useMemo(() => {
    const base = data?.axes ?? [];
    const extra = (allAxes ?? []).filter((axis) =>
      missing.includes(entityId(axis)),
    );
    return {
      axes: extra.length ? [...base, ...extra] : base,
      source: data?.source ?? "fallback",
      templateName: data?.template?.name ?? "",
      includeCriteria: data?.includeCriteria ?? true,
      isLoading: enabled && isLoading,
      error,
    };
  }, [data, allAxes, missing, enabled, isLoading, error]);
}
