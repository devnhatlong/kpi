"use client";

import { useMemo } from "react";
import useSWR from "swr";

import {
  fetchScoreGroupsAll,
  scoreGroupKeys,
} from "@/features/kpi-form-config/api";
import { entityId, type ScoreGroup } from "@/features/kpi-form-config/types";

/**
 * Nhóm điểm tra theo id, để biết dải điểm hợp lệ của một cột.
 * SWR gộp theo khoá nên nhiều dòng / nhiều màn cùng dùng chỉ gọi API một lần.
 * Truyền `enabled = false` khi mẫu không có cột nào bị giới hạn, khỏi gọi thừa.
 */
export function useScoreGroupMap(enabled = true) {
  const { data } = useSWR(
    enabled ? scoreGroupKeys.all : null,
    fetchScoreGroupsAll,
  );

  return useMemo(
    () =>
      new Map<string, ScoreGroup>(
        (data ?? []).map((item) => [entityId(item), item]),
      ),
    [data],
  );
}
