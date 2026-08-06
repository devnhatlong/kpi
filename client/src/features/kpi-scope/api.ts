import { api, unwrapData } from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  KpiScopeConfigResponse,
  SaveKpiScopeConfigInput,
} from "./types";

export const kpiScopeKeys = {
  config: ["kpi-scope-config"] as const,
};

export function fetchKpiScopeConfig() {
  return unwrapData(
    api.get<ApiResponse<KpiScopeConfigResponse>>("/kpi-scope-config"),
  );
}

export async function saveKpiScopeConfig(input: SaveKpiScopeConfigInput) {
  await api.put("/kpi-scope-config", input);
}

export function resetKpiScopeConfig() {
  return unwrapData(
    api.post<ApiResponse<KpiScopeConfigResponse>>(
      "/kpi-scope-config/reset",
      {},
    ),
  );
}
