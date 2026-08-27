"use client";

import { useMemo } from "react";
import useSWR from "swr";

import {
  fetchQualityLevelsAll,
  qualityLevelKeys,
} from "@/features/mission-form-config/api";
import {
  entityId,
  type QualityLevel,
} from "@/features/mission-form-config/types";

/**
 * Mức chất lượng tra theo id, để biết phần trăm của mức được chọn.
 * Cùng cách gộp khoá như useScoreGroupMap - nhiều dòng chỉ gọi API một lần.
 */
export function useQualityLevelMap(enabled = true) {
  const { data } = useSWR(
    enabled ? qualityLevelKeys.all : null,
    fetchQualityLevelsAll,
  );

  return useMemo(
    () =>
      new Map<string, QualityLevel>(
        (data ?? []).map((item) => [entityId(item), item]),
      ),
    [data],
  );
}
