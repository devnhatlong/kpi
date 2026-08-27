"use client";

import useSWR from "swr";

import { SearchableSelect } from "@/components/common/searchable-select";
import {
  criterionKeys,
  fetchCriteriaAll,
  fetchQualityLevelsAll,
  fetchScoreGroupsAll,
  fetchWorkTasksAll,
  qualityLevelKeys,
  scoreGroupKeys,
  workTaskKeys,
} from "@/features/mission-form-config/api";
import {
  CATALOG_LABEL,
  entityId,
  type ColumnCatalog,
} from "@/features/mission-form-config/types";
import { cn } from "@/lib/utils";

type CatalogSelectCellProps = {
  catalog: ColumnCatalog;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  /**
   * Nội dung công việc của dòng đang nhập - danh mục Nhiệm vụ lọc theo nó.
   * Không truyền thì dropdown nhiệm vụ để trống: bày cả nghìn nhiệm vụ của mọi
   * nội dung ra cho người ta tự dò còn tệ hơn.
   */
  workContentId?: string;
  /**
   * Trả kèm NHÃN của mục vừa chọn. Dùng cho bảng cần chụp lại tên tại thời
   * điểm chọn (khối A), thay vì chỉ giữ id rồi tra lại danh mục về sau - danh
   * mục sửa tên là bản đã trình đổi theo.
   */
  onPick?: (value: string, label: string) => void;
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
  workContentId,
  onPick,
  triggerClassName,
}: CatalogSelectCellProps) {
  const isScoreGroup = catalog === "score_group";
  const isWorkTask = catalog === "work_task";
  const isCriterion = catalog === "criterion";

  const { data: scoreGroups } = useSWR(
    isScoreGroup ? scoreGroupKeys.all : null,
    fetchScoreGroupsAll,
  );
  const { data: qualityLevels } = useSWR(
    catalog === "quality_level" ? qualityLevelKeys.all : null,
    fetchQualityLevelsAll,
  );
  const { data: workTasks } = useSWR(
    isWorkTask && workContentId
      ? [...workTaskKeys.all, "by-content", workContentId]
      : null,
    () => fetchWorkTasksAll(workContentId),
  );
  const { data: criteria } = useSWR(
    isCriterion ? criterionKeys.all : null,
    fetchCriteriaAll,
  );

  /*
    Nhánh theo từng danh mục, KHÔNG để danh mục lạ rơi vào nhánh cuối: trước đây
    nhánh cuối mặc định là Chất lượng thực hiện, thêm danh mục mới vào là ô đó
    lặng lẽ bày sai danh sách. Danh mục chưa có nhánh thì trả rỗng.
  */
  const options = isWorkTask
    ? (workTasks ?? []).map((item) => ({
        value: entityId(item),
        label: item.name,
        keywords: item.code,
      }))
    : isScoreGroup
      ? (scoreGroups ?? []).map((item) => ({
          value: entityId(item),
          label: item.name,
          keywords: `${item.code} ${item.minScore}-${item.maxScore}`,
        }))
      : isCriterion
        ? (criteria ?? []).map((item) => ({
            value: entityId(item),
            label: item.name,
            keywords: `${item.code} ${item.maxScore}`,
          }))
        : catalog === "quality_level"
          ? (qualityLevels ?? []).map((item) => ({
              value: entityId(item),
              label: item.name,
              keywords: `${item.code} ${item.percent}`,
            }))
          : [];

  return (
    <SearchableSelect
      value={value}
      onValueChange={(next) => {
        onValueChange(next);
        onPick?.(
          next,
          options.find((option) => option.value === next)?.label ?? "",
        );
      }}
      options={options}
      disabled={disabled}
      placeholder={CATALOG_LABEL[catalog]}
      searchPlaceholder={`Tìm ${CATALOG_LABEL[catalog].toLowerCase()}...`}
      emptyText={
        isWorkTask
          ? "Nội dung công việc này chưa khai nhiệm vụ nào."
          : "Danh mục chưa có giá trị nào."
      }
      triggerClassName={cn("h-8 w-full text-xs font-normal", triggerClassName)}
    />
  );
}
