"use client";

import { useMemo } from "react";
import useSWR from "swr";

import {
  fetchFormTemplatesAll,
  formTemplateKeys,
} from "@/features/mission-form-config/api";
import {
  resolveTemplate,
  visibleColumns,
  type ResolvedTemplate,
} from "@/features/mission-form-config/form-template-utils";
import { entityId } from "@/features/mission-form-config/types";

export type AxisTemplates = {
  /** Mẫu bảng đang áp dụng cho từng trục; trục vắng mặt = chưa gán mẫu. */
  byAxis: Map<string, ResolvedTemplate>;
  isLoading: boolean;
};

/**
 * Mẫu bảng của mọi trục trong một lần gọi.
 *
 * Server không cho hai mẫu đang bật cùng gắn vào một trục (resolveAxisIds chặn
 * trùng), nên dựng map từ danh sách mẫu ra đúng thứ endpoint by-axis trả về mà
 * không phải gọi lẻ từng trục - màn nhập cần cột của nhiều trục cùng lúc để
 * kiểm tra trước khi lưu.
 */
export function useAxisTemplates(enabled = true): AxisTemplates {
  const { data, isLoading } = useSWR(
    enabled ? formTemplateKeys.all : null,
    fetchFormTemplatesAll,
    { revalidateOnFocus: false },
  );

  return useMemo(() => {
    const byAxis = new Map<string, ResolvedTemplate>();
    for (const template of data ?? []) {
      const resolved = resolveTemplate(template);
      if (!resolved) continue;
      const entry: ResolvedTemplate = {
        ...resolved,
        columns: visibleColumns(resolved.columns),
      };
      for (const axis of template.axisIds ?? []) {
        byAxis.set(entityId(axis), entry);
      }
    }
    return { byAxis, isLoading: enabled && isLoading };
  }, [data, enabled, isLoading]);
}
