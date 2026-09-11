"use client";

import { useMemo, useState } from "react";
import { Loader2, Save, ShieldCheck, X } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/common/searchable-select";
import { ScopePicker } from "@/features/mission-form-config/components/report-builder/scope-picker";
import { fetchRoles, fetchUsers } from "@/features/organization/api";
import {
  fetchTeamReportAdjustmentAccessRule,
  saveTeamReportAdjustmentAccessRule,
} from "@/features/team-report/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm } from "@/lib/server-time";

type Draft = {
  roleCodes: string[];
  userIds: string[];
  departmentIds: string[];
  includeDescendants: boolean;
};

const fingerprint = (draft: Draft) =>
  JSON.stringify([
    [...draft.roleCodes].sort(),
    [...draft.userIds].sort(),
    [...draft.departmentIds].sort(),
    draft.includeDescendants,
  ]);

/**
 * Ai được NHẬP bảng điểm cộng / trừ / xếp loại - quản trị đặt ngay tại trình
 * dựng bảng, vì đây là luật của riêng bảng này chứ không phải một mã quyền.
 *
 * Ba cách khoanh, dùng cùng lúc, khớp một trong ba là đủ: vai trò, tài khoản
 * đích danh, đơn vị / khối (kèm cấp dưới). Chưa đặt gì thì rơi về luật mặc
 * định - ai có quyền nhập báo cáo ngày thì nhập được.
 */
export function AdjustmentAccessCard() {
  const rule = useSWR(
    ["team-report", "adjustment-access-rule"],
    fetchTeamReportAdjustmentAccessRule,
    { revalidateOnFocus: false },
  );
  const roles = useSWR("roles-all", fetchRoles, { revalidateOnFocus: false });
  const users = useSWR("users-all", fetchUsers, { revalidateOnFocus: false });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedFp, setSavedFp] = useState("");
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* Nạp bản nháp ngay trong render lúc luật về, không qua effect. */
  const stamp = rule.data ? String(rule.data.updatedAt ?? "init") : null;
  if (rule.data && stamp !== loadedAt) {
    const next: Draft = {
      roleCodes: rule.data.roleCodes,
      userIds: rule.data.userIds,
      departmentIds: rule.data.departmentIds,
      includeDescendants: rule.data.includeDescendants,
    };
    setLoadedAt(stamp);
    setDraft(next);
    setSavedFp(fingerprint(next));
  }

  const roleOptions = useMemo(
    () => (roles.data ?? []).filter((role) => role.isActive),
    [roles.data],
  );
  const userById = useMemo(
    () =>
      new Map(
        (users.data ?? []).map((account) => [
          account._id ?? account.id,
          account,
        ]),
      ),
    [users.data],
  );
  const userOptions = useMemo(
    () =>
      (users.data ?? [])
        .filter((account) => account.isActive)
        .map((account) => {
          const department =
            typeof account.departmentId === "object" && account.departmentId
              ? account.departmentId.name
              : "";
          return {
            value: account._id ?? account.id,
            label: `${account.fullName?.trim() || account.username} · ${account.username}${department ? ` · ${department}` : ""}`,
          };
        }),
    [users.data],
  );

  const dirty = !!draft && fingerprint(draft) !== savedFp;
  const empty =
    !!draft &&
    !draft.roleCodes.length &&
    !draft.userIds.length &&
    !draft.departmentIds.length;

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await saveTeamReportAdjustmentAccessRule(draft);
      await rule.mutate(saved, { revalidate: false });
      setSavedFp(fingerprint(draft));
      toast.success("Đã lưu quyền nhập bảng.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được quyền nhập."));
    } finally {
      setSaving(false);
    }
  };

  const patch = (next: Partial<Draft>) =>
    setDraft((prev) => (prev ? { ...prev, ...next } : prev));

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4 text-primary" />
            Ai được nhập bảng này
          </h3>
          <p className="text-xs text-muted-foreground">
            Khớp <strong>một trong ba</strong> là được nhập: giữ vai trò đã
            chọn, là tài khoản được chỉ định, hoặc thuộc đơn vị / khối đã chọn.
            Quản trị hệ thống luôn vào được.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {rule.data ? (
            <Badge
              variant="outline"
              className={
                rule.data.configured
                  ? "font-normal"
                  : "border-amber-300 bg-amber-50 font-normal text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
              }
            >
              {rule.data.configured
                ? `Đã đặt luật riêng${rule.data.updatedByName ? ` · ${rule.data.updatedByName}` : ""}${rule.data.updatedAt ? ` · ${formatServerHm(rule.data.updatedAt)}` : ""}`
                : "Chưa đặt - đang dùng luật mặc định"}
            </Badge>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={saving || !dirty || !draft}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {dirty ? "Lưu quyền" : "Đã lưu"}
          </Button>
        </div>
      </div>

      {!draft ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Đang tải luật...
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            {/* ------------------------------------------------ vai trò */}
            <div className="space-y-2">
              <Label>Theo vai trò</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {roleOptions.map((role) => (
                  <label
                    key={role.code}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm"
                  >
                    <Checkbox
                      checked={draft.roleCodes.includes(role.code)}
                      onCheckedChange={(checked) =>
                        patch({
                          roleCodes:
                            checked === true
                              ? [...new Set([...draft.roleCodes, role.code])]
                              : draft.roleCodes.filter(
                                  (code) => code !== role.code,
                                ),
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{role.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {role.code}
                    </span>
                  </label>
                ))}
                {!roleOptions.length ? (
                  <p className="text-xs text-muted-foreground">
                    Đang tải vai trò...
                  </p>
                ) : null}
              </div>
            </div>

            {/* ----------------------------------------------- tài khoản */}
            <div className="space-y-2">
              <Label>Theo tài khoản (chỉ định đích danh)</Label>
              <SearchableSelect
                value=""
                onValueChange={(id) => {
                  if (!id) return;
                  patch({ userIds: [...new Set([...draft.userIds, id])] });
                }}
                options={userOptions.filter(
                  (option) => !draft.userIds.includes(option.value),
                )}
                placeholder="Thêm tài khoản..."
                searchPlaceholder="Gõ tên hoặc tên đăng nhập..."
                className="w-full"
              />
              {draft.userIds.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {draft.userIds.map((id) => {
                    const account = userById.get(id);
                    return (
                      <li key={id}>
                        <Badge
                          variant="secondary"
                          className="gap-1 font-normal"
                        >
                          {account
                            ? account.fullName?.trim() || account.username
                            : id}
                          <button
                            type="button"
                            aria-label="Bỏ tài khoản"
                            onClick={() =>
                              patch({
                                userIds: draft.userIds.filter(
                                  (item) => item !== id,
                                ),
                              })
                            }
                            className="cursor-pointer rounded-sm hover:text-destructive"
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Chưa chỉ định tài khoản nào.
                </p>
              )}
            </div>
          </div>

          {/* ------------------------------------------- đơn vị / khối */}
          <div className="space-y-2">
            <Label>Theo đơn vị / khối</Label>
            <ScopePicker
              treeOnly
              labels={{
                departments: "Đơn vị / khối được nhập",
                descendants: "Cả cấp dưới của đơn vị đã chọn",
                descendantsHint:
                  "Tick một Khối hoặc Phòng là mọi đơn vị bên trong đều được nhập. Tắt khi chỉ muốn đúng đơn vị đã chọn.",
              }}
              value={{
                scopeType: "by_department",
                levelIds: [],
                departmentIds: draft.departmentIds,
                includeDescendants: draft.includeDescendants,
              }}
              onChange={(scope) =>
                patch({
                  departmentIds: scope.departmentIds,
                  includeDescendants: scope.includeDescendants,
                })
              }
            />
          </div>
        </div>
      )}

      {draft && empty ? (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          Chưa chọn gì cả → luật mặc định: tài khoản có quyền nhập báo cáo ngày
          (thường là đội trưởng) nhập được.
        </p>
      ) : null}
    </section>
  );
}
