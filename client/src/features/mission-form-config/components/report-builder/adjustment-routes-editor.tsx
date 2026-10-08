"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/common/searchable-select";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  RouteUnitsEditor,
  routeUnitsError,
} from "@/features/mission-form-config/components/report-builder/route-units-editor";
import { ScopePicker } from "@/features/mission-form-config/components/report-builder/scope-picker";
import {
  fetchDepartmentLevels,
  fetchRoles,
  fetchUsers,
} from "@/features/organization/api";
import {
  fetchTeamReportRoutes,
  saveTeamReportRoutes,
  type TeamReportAdjustmentRoute,
  type TeamReportAdjustmentScope,
  type TeamReportRouteKind,
} from "@/features/team-report/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const emptyScope = (): TeamReportAdjustmentScope => ({
  roleCodes: [],
  levelIds: [],
  departmentIds: [],
  includeDescendants: true,
  userIds: [],
  senderSuperiorOnly: false,
  senderSubordinatesOnly: false,
});

const newRoute = (index: number): TeamReportAdjustmentRoute => ({
  name: `Luồng ${index + 1}`,
  isActive: true,
  sender: emptyScope(),
  recipients: emptyScope(),
});

const fingerprint = (routes: TeamReportAdjustmentRoute[]) =>
  JSON.stringify(
    routes.map((route) => [
      route.name.trim(),
      route.isActive,
      route.unitMode ?? false,
      route.unitMode
        ? (route.units ?? []).map((unit) => `${unit.userId}:${unit.role}`)
        : [],
      scopeKey(route.sender),
      scopeKey(route.recipients),
    ]),
  );
const scopeKey = (scope: TeamReportAdjustmentScope) => [
  [...scope.roleCodes].sort(),
  [...scope.levelIds].sort(),
  [...scope.departmentIds].sort(),
  scope.includeDescendants,
  [...scope.userIds].sort(),
  scope.senderSuperiorOnly ?? false,
  scope.senderSubordinatesOnly ?? false,
];

const scopeEmpty = (scope: TeamReportAdjustmentScope) =>
  !scope.roleCodes.length &&
  !scope.levelIds.length &&
  !scope.departmentIds.length &&
  !scope.userIds.length;

/**
 * Nhiều LUỒNG TRÌNH: mỗi luồng "ai gửi → gửi cho ai", cả hai vế khoanh bằng
 * vai trò / cấp đơn vị / đơn vị / tài khoản. Xét từ trên xuống, khớp luồng
 * đầu tiên; không khớp luồng nào → cấp trên trực tiếp.
 */
const KIND_LABEL: Record<TeamReportRouteKind, string> = {
  ADJUSTMENT: "bảng điểm cộng, trừ & xếp loại",
  SUMMARY: "báo cáo tổng hợp",
};

export function AdjustmentRoutesEditor({
  kind = "ADJUSTMENT",
}: {
  kind?: TeamReportRouteKind;
}) {
  const stored = useSWR(
    ["team-report", "routes", kind],
    () => fetchTeamReportRoutes(kind),
    { revalidateOnFocus: false },
  );
  const roles = useSWR("roles-all", fetchRoles, { revalidateOnFocus: false });
  const levels = useSWR("department-levels-scope", fetchDepartmentLevels, {
    revalidateOnFocus: false,
  });
  const users = useSWR("users-all", fetchUsers, { revalidateOnFocus: false });

  const [draft, setDraft] = useState<TeamReportAdjustmentRoute[] | null>(null);
  const [savedFp, setSavedFp] = useState("");
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [saving, setSaving] = useState(false);

  /* Nạp bản nháp ngay trong render lúc dữ liệu về, không qua effect. */
  const stamp = stored.data
    ? `${kind}:${stored.data.map((route) => route.updatedAt ?? "").join("|") || "init"}`
    : null;
  if (stored.data && stamp !== loadedAt) {
    setLoadedAt(stamp);
    const loaded = stored.data.map((route) => ({
      ...route,
      unitMode: (route.units?.length ?? 0) > 0,
    }));
    setDraft(loaded);
    setSavedFp(fingerprint(loaded));
    setSelected(0);
  }

  const roleOptions = useMemo(
    () => (roles.data ?? []).filter((role) => role.isActive),
    [roles.data],
  );
  const levelOptions = useMemo(
    () =>
      (levels.data ?? [])
        .filter((level) => level.isActive)
        .sort((a, b) => a.rank - b.rank),
    [levels.data],
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
  const current = draft?.[selected] ?? null;

  const patchRoute = (patch: Partial<TeamReportAdjustmentRoute>) =>
    setDraft((prev) =>
      prev
        ? prev.map((route, index) =>
            index === selected ? { ...route, ...patch } : route,
          )
        : prev,
    );
  const patchScope = (
    side: "sender" | "recipients",
    patch: Partial<TeamReportAdjustmentScope>,
  ) =>
    current ? patchRoute({ [side]: { ...current[side], ...patch } }) : null;

  const move = (from: number, to: number) => {
    if (!draft || to < 0 || to >= draft.length) return;
    const next = [...draft];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setDraft(next);
    setSelected(to);
  };

  const save = async () => {
    if (!draft) return;
    for (const route of draft) {
      if (route.unitMode) {
        const error = routeUnitsError(route.units ?? [], userById);
        if (error) {
          toast.error(`Luồng "${route.name}": bảng nơi nhận ${error}.`);
          return;
        }
      } else if (scopeEmpty(route.recipients)) {
        toast.error(`Luồng "${route.name}" chưa chọn gửi cho ai.`);
        return;
      }
    }
    const noSender = draft.find((route) => scopeEmpty(route.sender));
    if (noSender) {
      toast.error(`Luồng "${noSender.name}" chưa chọn ai gửi.`);
      return;
    }
    setSaving(true);
    try {
      const saved = (await saveTeamReportRoutes(kind, draft)).map((route) => ({
        ...route,
        unitMode: (route.units?.length ?? 0) > 0,
      }));
      await stored.mutate(saved, { revalidate: false });
      setDraft(saved);
      setSavedFp(fingerprint(saved));
      toast.success("Đã lưu luồng trình.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được luồng trình."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Send className="size-4 text-primary" />
            Các luồng trình - {KIND_LABEL[kind]}
          </h3>
          <p className="text-xs text-muted-foreground">
            Mỗi luồng: <strong>ai gửi</strong> → <strong>gửi cho ai</strong>.
            Xét từ trên xuống, khớp luồng đầu tiên. Không khớp luồng nào → trình
            lên cấp trên trực tiếp có quyền duyệt (đội → phòng, xã).
          </p>
        </div>
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
          {dirty ? "Lưu luồng" : "Đã lưu"}
        </Button>
      </div>

      {!draft ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Đang tải...
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* ------------------------------------------- danh sách luồng */}
          <div className="space-y-2">
            {draft.length === 0 ? (
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Chưa có luồng nào → mọi người trình lên cấp trên trực tiếp.
              </p>
            ) : null}
            {draft.map((route, index) => (
              <button
                key={route._id ?? `new-${index}`}
                type="button"
                onClick={() => setSelected(index)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-left text-sm",
                  index === selected
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/60",
                  !route.isActive && "opacity-60",
                )}
              >
                <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">
                  {index + 1}.
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {route.name || "(chưa đặt tên)"}
                </span>
                {!route.isActive ? (
                  <Badge variant="outline" className="font-normal">
                    Tắt
                  </Badge>
                ) : null}
              </button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full bg-background"
              onClick={() => {
                setDraft([...draft, newRoute(draft.length)]);
                setSelected(draft.length);
              }}
            >
              <Plus className="size-4" />
              Thêm luồng
            </Button>
          </div>

          {/* --------------------------------------------- luồng đang chọn */}
          {current ? (
            <div className="space-y-4 rounded-lg border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="route-name">Tên luồng</Label>
                  <Input
                    id="route-name"
                    value={current.name}
                    onChange={(e) => patchRoute({ name: e.target.value })}
                    placeholder="Ví dụ: Phòng / xã gửi về PV01"
                  />
                </div>
                <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm">
                  <Switch
                    checked={current.isActive}
                    onCheckedChange={(checked) =>
                      patchRoute({ isActive: checked })
                    }
                  />
                  Đang dùng
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="bg-background"
                  disabled={selected === 0}
                  onClick={() => move(selected, selected - 1)}
                  aria-label="Lên"
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="bg-background"
                  disabled={selected >= draft.length - 1}
                  onClick={() => move(selected, selected + 1)}
                  aria-label="Xuống"
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    const next = draft.filter((_, index) => index !== selected);
                    setDraft(next);
                    setSelected(Math.max(0, selected - 1));
                  }}
                >
                  <Trash2 className="size-4" />
                  Xoá
                </Button>
              </div>

              <ScopeEditor
                title="1. Ai gửi"
                hint="Đích danh thì khớp ngay; còn lại phải đúng MỌI vế đã tick (vai trò ∩ cấp ∩ đơn vị). Bỏ trống = chưa chọn ai - luồng không áp cho ai cả."
                scope={current.sender}
                onChange={(patch) => patchScope("sender", patch)}
                roleOptions={roleOptions}
                levelOptions={levelOptions}
                userOptions={userOptions}
                userById={userById}
                deptLabels={{
                  departments: "Đơn vị / khối gửi",
                  descendants: "Cả cấp dưới của đơn vị đã chọn",
                  descendantsHint:
                    "Bật thì người ở các đơn vị con cũng đi theo luồng này.",
                }}
              />
              {/* Hai loại báo cáo dùng chung cách xác định nơi nhận. */}
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-semibold">2. Gửi cho ai</h4>
                    <p className="text-xs text-muted-foreground">
                      {current.unitMode
                        ? "Bản đi đúng tới các tài khoản dưới đây - người trình không chọn, không đổi được."
                        : "Người trình tự chọn MỘT người trong danh sách lọc dưới đây."}
                    </p>
                  </div>
                  <SegmentedTabs
                    ariaLabel="Cách xác định nơi nhận"
                    value={current.unitMode ? "UNITS" : "PICK"}
                    onChange={(next) =>
                      patchRoute({ unitMode: next === "UNITS" })
                    }
                    items={[
                      { value: "UNITS" as const, label: "Nơi nhận cố định" },
                      {
                        value: "PICK" as const,
                        label: "Người trình tự chọn",
                      },
                    ]}
                  />
                </div>
                {current.unitMode ? (
                  <RouteUnitsEditor
                    units={current.units ?? []}
                    onChange={(units) => patchRoute({ units })}
                    accounts={users.data ?? []}
                  />
                ) : (
                  <RecipientScopeEditor
                    scope={current.recipients}
                    onChange={(patch) => patchScope("recipients", patch)}
                    roleOptions={roleOptions}
                    levelOptions={levelOptions}
                    userOptions={userOptions}
                    userById={userById}
                    title="Lọc người được chọn"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Bấm &quot;Thêm luồng&quot; để bắt đầu.
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Vế "gửi cho ai" kiểu lọc người - dùng cho bảng điểm cộng / trừ và cho luồng tổng hợp để người trình tự chọn. */
function RecipientScopeEditor({
  title,
  ...props
}: Omit<
  Parameters<typeof ScopeEditor>[0],
  "recipients" | "hint" | "deptLabels" | "title"
> & { title: string }) {
  return (
    <ScopeEditor
      recipients
      title={title}
      hint="Danh sách hiện trong dropdown Trình lên. Đích danh luôn có; còn lại là người đúng MỌI vế đã tick. Phải chọn ít nhất một thứ."
      deptLabels={{
        departments: "Đơn vị / khối nhận",
        descendants: "Cả cấp dưới của đơn vị đã chọn",
        descendantsHint:
          "Bật thì người ở các đơn vị con cũng hiện trong danh sách nhận.",
      }}
      {...props}
    />
  );
}

type RoleOption = { code: string; name: string };
type LevelOption = { _id: string; code: string; name: string };
type UserOption = { value: string; label: string };

export function ScopeEditor({
  recipients = false,
  title,
  hint,
  scope,
  onChange,
  roleOptions,
  levelOptions,
  userOptions,
  userById,
  deptLabels,
}: {
  /** Vế người nhận - có thêm cờ "chỉ cấp trên trực thuộc của người gửi". */
  recipients?: boolean;
  title: string;
  hint: string;
  scope: TeamReportAdjustmentScope;
  onChange: (patch: Partial<TeamReportAdjustmentScope>) => void;
  roleOptions: RoleOption[];
  levelOptions: LevelOption[];
  userOptions: UserOption[];
  userById: Map<string, { fullName?: string; username: string }>;
  deptLabels: {
    departments: string;
    descendants: string;
    descendantsHint: string;
  };
}) {
  const toggle = (list: string[], item: string, on: boolean) =>
    on ? [...new Set([...list, item])] : list.filter((x) => x !== item);

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {recipients ? (
        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium">
              Chỉ cấp trên trực thuộc của người gửi
            </span>
            <span className="block text-xs text-muted-foreground">
              Thu danh sách về đơn vị cha gần nhất của người gửi: đội thấy đúng
              phòng mình, tổ thấy đúng xã mình. Kết hợp với vai trò đã tick (ví
              dụ Trưởng phòng, trưởng xã).
            </span>
          </span>
          <Switch
            checked={scope.senderSuperiorOnly ?? false}
            onCheckedChange={(checked) =>
              onChange({
                senderSuperiorOnly: checked,
                ...(checked ? { senderSubordinatesOnly: false } : {}),
              })
            }
          />
        </label>
      ) : null}
      {recipients ? (
        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-md border bg-muted/40 px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium">
              Chỉ đơn vị cấp dưới của người gửi
            </span>
            <span className="block text-xs text-muted-foreground">
              Phòng gửi về các đội của chính phòng đó, xã gửi về các tổ của
              mình. Kết hợp với vai trò đã tick (ví dụ Đội trưởng).
            </span>
          </span>
          <Switch
            checked={scope.senderSubordinatesOnly ?? false}
            onCheckedChange={(checked) =>
              onChange({
                senderSubordinatesOnly: checked,
                ...(checked ? { senderSuperiorOnly: false } : {}),
              })
            }
          />
        </label>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Vai trò</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {roleOptions.map((role) => (
                <label
                  key={role.code}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={scope.roleCodes.includes(role.code)}
                    onCheckedChange={(checked) =>
                      onChange({
                        roleCodes: toggle(
                          scope.roleCodes,
                          role.code,
                          checked === true,
                        ),
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{role.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {role.code}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cấp đơn vị</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {levelOptions.map((level) => (
                <label
                  key={level._id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                >
                  <Checkbox
                    checked={scope.levelIds.includes(level._id)}
                    onCheckedChange={(checked) =>
                      onChange({
                        levelIds: toggle(
                          scope.levelIds,
                          level._id,
                          checked === true,
                        ),
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{level.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {level.code}
                  </span>
                </label>
              ))}
              {!levelOptions.length ? (
                <p className="text-xs text-muted-foreground">
                  Chưa khai cấp đơn vị.
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Tài khoản (chỉ định đích danh)</Label>
            <SearchableSelect
              value=""
              onValueChange={(id) => {
                if (id) onChange({ userIds: toggle(scope.userIds, id, true) });
              }}
              options={userOptions.filter(
                (option) => !scope.userIds.includes(option.value),
              )}
              placeholder="Thêm tài khoản..."
              searchPlaceholder="Gõ tên hoặc tên đăng nhập..."
              className="w-full"
            />
            {scope.userIds.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {scope.userIds.map((id) => {
                  const account = userById.get(id);
                  return (
                    <li key={id}>
                      <Badge variant="secondary" className="gap-1 font-normal">
                        {account
                          ? account.fullName?.trim() || account.username
                          : id}
                        <button
                          type="button"
                          aria-label="Bỏ tài khoản"
                          onClick={() =>
                            onChange({
                              userIds: toggle(scope.userIds, id, false),
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
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Đơn vị / khối</Label>
          <ScopePicker
            treeOnly
            labels={deptLabels}
            value={{
              scopeType: "by_department",
              levelIds: [],
              departmentIds: scope.departmentIds,
              includeDescendants: scope.includeDescendants,
            }}
            onChange={(next) =>
              onChange({
                departmentIds: next.departmentIds,
                includeDescendants: next.includeDescendants,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
