"use client";

import { useMemo } from "react";
import useSWR from "swr";

import {
  fetchFormTemplateByAxis,
  formTemplateKeys,
} from "@/features/mission-form-config/api";
import {
  resolveTemplate,
  visibleColumns,
} from "@/features/mission-form-config/form-template-utils";
import type {
  FormHeaderGroup,
  FormTemplateColumn,
} from "@/features/mission-form-config/types";

export type AxisTemplate = {
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  /** false = trục chưa gán mẫu bảng - không dựng bảng. */
  hasTemplate: boolean;
  /** Mã / tên mẫu đang áp dụng. */
  code: string;
  name: string;
  isLoading: boolean;
};

/**
 * Mẫu bảng đang áp dụng cho một trục.
 * Trục chưa gán mẫu thì không có bảng - super admin phải cấu hình trước.
 */
export function useAxisTemplate(axisId: string | undefined): AxisTemplate {
  const { data, isLoading } = useSWR(
    axisId ? formTemplateKeys.byAxis(axisId) : null,
    () => fetchFormTemplateByAxis(axisId!),
    { revalidateOnFocus: false },
  );

  return useMemo(() => {
    const resolved = resolveTemplate(data);
    return {
      columns: resolved ? visibleColumns(resolved.columns) : [],
      headerGroups: resolved?.headerGroups ?? [],
      hasTemplate: !!resolved,
      code: resolved?.code ?? "",
      name: resolved?.name ?? "",
      isLoading: !!axisId && isLoading,
    };
  }, [axisId, data, isLoading]);
}
