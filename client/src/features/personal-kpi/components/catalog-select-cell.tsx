"use client";

import useSWR from "swr";

import { SearchableSelect } from "@/components/common/searchable-select";
import {
  fetchQualityLevelsAll,
  fetchScoreGroupsAll,
  qualityLevelKeys,
  scoreGroupKeys,
} from "@/features/kpi-form-config/api";
import {
  CATALOG_LABEL,
  entityId,
  type ColumnCatalog,
} from "@/features/kpi-form-config/types";
import { cn } from "@/lib/utils";

type CatalogSelectCellProps = {
  catalog: ColumnCatalog;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  /** Ghi đè kích thước ô - màn nhập cần ô gọn hơn ô trong bảng. */
  triggerClassName?: string;
};

/**
 * Ô của cột lấy giá trị từ danh mục.
 * Dùng SWR với khoá cố định nên nhiều dòng cùng loại cột chỉ gọi API một lần.
 */
export function CatalogSelectCell({
  catalog,
  value,
  onValueChange,
  disabled = false,
  triggerClassName,
}: CatalogSelectCellProps) {
  const isScoreGroup = catalog === "score_group";

  const { data: scoreGroups } = useSWR(
    isScoreGroup ? scoreGroupKeys.all : null,
    fetchScoreGroupsAll,
  );
  const { data: qualityLevels } = useSWR(
    catalog === "quality_level" ? qualityLevelKeys.all : null,
    fetchQualityLevelsAll,
  );

  const options = isScoreGroup
    ? (scoreGroups ?? []).map((item) => ({
        value: entityId(item),
        label: item.name,
        keywords: `${item.code} ${item.minScore}-${item.maxScore}`,
      }))
    : (qualityLevels ?? []).map((item) => ({
        value: entityId(item),
        label: item.name,
        keywords: `${item.code} ${item.percent}`,
      }));

  return (
    <SearchableSelect
      value={value}
      onValueChange={onValueChange}
      options={options}
      disabled={disabled}
      placeholder={CATALOG_LABEL[catalog]}
      searchPlaceholder={`Tìm ${CATALOG_LABEL[catalog].toLowerCase()}...`}
      emptyText="Danh mục chưa có giá trị nào."
      triggerClassName={cn("h-8 w-full text-xs font-normal", triggerClassName)}
    />
  );
}
