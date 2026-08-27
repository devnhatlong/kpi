import { api, unwrapData } from "@/lib/api-client";
import type { ApiResponse } from "@/features/auth/types";
import type {
  MissionScopeConfigResponse,
  SaveMissionScopeConfigInput,
} from "./types";

export const missionScopeKeys = {
  config: ["mission-scope-config"] as const,
};

export function fetchMissionScopeConfig() {
  return unwrapData(
    api.get<ApiResponse<MissionScopeConfigResponse>>("/mission-scope-config"),
  );
}

export async function saveMissionScopeConfig(
  input: SaveMissionScopeConfigInput,
) {
  await api.put("/mission-scope-config", input);
}

export function resetMissionScopeConfig() {
  return unwrapData(
    api.post<ApiResponse<MissionScopeConfigResponse>>(
      "/mission-scope-config/reset",
      {},
    ),
  );
}
