"use client";

import { useMemo } from "react";

import {
  flattenHeaderGroups,
  type ResolvedTemplate,
} from "@/features/kpi-form-config/form-template-utils";
import {
  catalogOfSemantic,
  type FormTemplateColumn,
  type QualityLevel,
  type ScoreGroup,
} from "@/features/kpi-form-config/types";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { useScoreGroupMap } from "@/features/kpi-form-config/use-score-groups";
import {
  scoreColumns,
  type ScoreEntry,
} from "@/features/personal-kpi/task-summary";
import type { PersonalKpiItem } from "@/features/personal-kpi/types";

/**
 * Đối chiếu điểm cán bộ tự chấm với điểm chỉ huy chốt.
 *
 * Cùng một bộ quy tắc cho cả form chấm điểm lẫn form xem lại: cột nào vào bảng,
 * ô nào đọc ở đâu, số nào so với số nào. Tách ra đây để hai màn không bao giờ
 * nói hai con số khác nhau về cùng một nhiệm vụ.
 */

/** Danh mục cần để đọc ô: ô danh mục lưu id chứ không lưu chữ. */
export type CatalogMaps = {
  qualityLevelById: Map<string, QualityLevel>;
  scoreGroupById: Map<string, ScoreGroup>;
};

/**
 * Giá trị cán bộ tự chấm ở một ô.
 * Cột danh mục (nhóm điểm, mức chất lượng) giữ id ở catalogValues chứ không
 * nằm trong fieldValues - đọc nhầm chỗ là ô nào cũng ra rỗng.
 */
export function selfValue(
  item: PersonalKpiItem,
  column: FormTemplateColumn,
): string {
  if (catalogOfSemantic(column.semanticKey)) {
    return item.task.catalogValues?.[column.key] ?? "";
  }
  return item.task.fieldValues?.[column.key] ?? "";
}

/** Số chỉ huy chốt ở một ô; ô chỉ huy không đụng tới thì giữ số tự chấm. */
export function scoredValue(
  item: PersonalKpiItem,
  column: FormTemplateColumn,
): string {
  return (
    item.reviewValues?.[column.key] ||
    item.reviewCatalogValues?.[column.key] ||
    selfValue(item, column)
  );
}

/** Đổi giá trị thô thành chữ đọc được: ô danh mục thì tra tên trong danh mục. */
export function showValue(
  column: FormTemplateColumn,
  raw: string,
  maps: CatalogMaps,
): string {
  if (!raw.trim()) return "-";
  const catalog = catalogOfSemantic(column.semanticKey);
  if (catalog === "score_group") {
    return maps.scoreGroupById.get(raw)?.name ?? raw;
  }
  if (catalog === "quality_level") {
    return maps.qualityLevelById.get(raw)?.name ?? raw;
  }
  return raw;
}

/**
 * Con số của một ô, dùng chung cho mọi phép so sánh và tính trước.
 *
 * Ô danh mục lưu id nên phải tra danh mục; nhưng dữ liệu cũ có thể lưu thẳng
 * chữ ("100%") nên vẫn thử bóc số từ chữ trước khi chịu thua - thiếu nhánh này
 * là chỗ nào cũng im lặng trả null và giao diện không nói được gì.
 */
export function numberOfValue(
  column: FormTemplateColumn,
  raw: string,
  maps: CatalogMaps,
): number | null {
  const text = raw.trim();
  if (!text) return null;

  const catalog = catalogOfSemantic(column.semanticKey);
  if (catalog === "quality_level") {
    const level =
      maps.qualityLevelById.get(text) ??
      [...maps.qualityLevelById.values()].find((entry) => entry.name === text);
    if (level) return level.percent;
  }
  if (catalog === "score_group") {
    const group = maps.scoreGroupById.get(text);
    if (group) return group.maxScore;
  }

  const parsed = Number(text.replace("%", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Đơn vị đi kèm con số chênh lệch - ô mức chất lượng là phần trăm. */
export function gapSuffix(column: FormTemplateColumn): string {
  return catalogOfSemantic(column.semanticKey) === "quality_level" ? "%" : "";
}

function headerPathOf(column: FormTemplateColumn): string {
  return (column.headerPath ?? []).join("/");
}

/**
 * Cả nhóm hiện lên bảng, không chỉ cột nằm trong công thức: nhóm "KPI tiến
 * độ (B)" có cả ô phần trăm lẫn ô điểm tự chấm, thiếu một ô là không đối chiếu
 * được.
 */
export function groupColumnsOf(
  entry: ScoreEntry,
  templateColumns: FormTemplateColumn[],
): FormTemplateColumn[] {
  const path = headerPathOf(entry.score);
  const group = templateColumns.filter(
    (column) => column.visible && headerPathOf(column) === path,
  );
  return group.length ? group : [entry.score];
}

/** Một ô đã chấm: số tự chấm, số chốt và khoảng cách giữa hai số. */
export type ReviewScoreCell = {
  key: string;
  title: string;
  self: string;
  scored: string;
  /** Chỉ huy chốt trừ tự chấm; null = không so được (ô trống / không ra số). */
  gap: number | null;
  changed: boolean;
  suffix: string;
};

export type ReviewScoreGroup = {
  label: string;
  cells: ReviewScoreCell[];
};

export type ReviewScoreReport = {
  /** Nhiệm vụ đã đi qua tay chỉ huy chấm điểm chưa. */
  hasReview: boolean;
  groups: ReviewScoreGroup[];
  changedCount: number;
  /** Có ô nào bị chấm thấp hơn số cán bộ khai không. */
  lowered: boolean;
  byName?: string;
  at?: string;
  note?: string;
};

const EMPTY_REPORT: ReviewScoreReport = {
  hasReview: false,
  groups: [],
  changedCount: 0,
  lowered: false,
};

/**
 * Bảng đối chiếu điểm của một nhiệm vụ đã chốt.
 * Trả về nhóm rỗng khi mẫu chưa cấu hình công thức - lúc đó không có ô nào để
 * chấm nên cũng chẳng có gì để đối chiếu.
 */
export function useReviewScores(
  item: PersonalKpiItem | null,
  template: ResolvedTemplate | null,
): ReviewScoreReport {
  const hasReview =
    !!item &&
    (Object.keys(item.reviewValues ?? {}).length > 0 ||
      Object.keys(item.reviewCatalogValues ?? {}).length > 0 ||
      !!item.reviewScoredAt);

  const qualityLevelById = useQualityLevelMap();
  // Nhóm điểm chỉ cần khi thật sự có điểm để đọc - khỏi gọi API ở mọi lần mở.
  const scoreGroupById = useScoreGroupMap(hasReview);

  return useMemo(() => {
    if (!item || !hasReview) return EMPTY_REPORT;

    const columns = scoreColumns(template);
    if (!columns.entries.length) {
      return {
        ...EMPTY_REPORT,
        hasReview,
        byName: item.reviewScoredByName,
        at: item.reviewScoredAt,
        note: item.reviewNote,
      };
    }

    const maps: CatalogMaps = { qualityLevelById, scoreGroupById };
    const groupNameById = new Map(
      flattenHeaderGroups(template?.headerGroups ?? []).map((group) => [
        group.id,
        group.name,
      ]),
    );
    /** Tên nhóm header bọc cột điểm; cột đứng riêng thì lấy chính tên cột. */
    const groupLabel = (entry: ScoreEntry) => {
      const names = (entry.score.headerPath ?? [])
        .map((id) => groupNameById.get(id))
        .filter(Boolean);
      return names.length ? names.join(" · ") : entry.score.title;
    };

    const groups: ReviewScoreGroup[] = columns.entries.map((entry) => ({
      label: groupLabel(entry),
      cells: groupColumnsOf(entry, template?.columns ?? []).map((column) => {
        const selfRaw = selfValue(item, column);
        const scoredRaw = scoredValue(item, column);
        const selfNumber = numberOfValue(column, selfRaw, maps);
        const scoredNumber = numberOfValue(column, scoredRaw, maps);
        const gap =
          selfNumber === null || scoredNumber === null
            ? null
            : scoredNumber - selfNumber;
        return {
          key: column.key,
          title: column.title,
          self: showValue(column, selfRaw, maps),
          scored: showValue(column, scoredRaw, maps),
          gap: gap === 0 ? null : gap,
          changed: selfRaw.trim() !== scoredRaw.trim(),
          suffix: gapSuffix(column),
        };
      }),
    }));

    const cells = groups.flatMap((group) => group.cells);
    return {
      hasReview,
      groups,
      changedCount: cells.filter((cell) => cell.changed).length,
      lowered: cells.some((cell) => cell.gap !== null && cell.gap < 0),
      byName: item.reviewScoredByName,
      at: item.reviewScoredAt,
      note: item.reviewNote,
    };
  }, [hasReview, item, qualityLevelById, scoreGroupById, template]);
}
