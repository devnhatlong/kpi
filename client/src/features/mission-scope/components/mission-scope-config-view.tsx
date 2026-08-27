"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, RotateCcw, Save, Shield, TriangleAlert, X } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchMissionScopeConfig,
  missionScopeKeys,
  resetMissionScopeConfig,
  saveMissionScopeConfig,
} from "@/features/mission-scope/api";
import {
  MISSION_SCOPE_GROUP_LABEL,
  ROLE_LEVEL_HINT,
  sameConfig,
  type MissionScope,
  type MissionScopeConfigItem,
  type MissionScopeGroup,
  type MissionScopeMeta,
} from "@/features/mission-scope/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type ViewMode = "MATRIX" | "ROLE";

export function MissionScopeConfigView() {
  const { data, isLoading, mutate } = useSWR(
    missionScopeKeys.config,
    fetchMissionScopeConfig,
  );

  const [items, setItems] = useState<MissionScopeConfigItem[]>([]);
  const [view, setView] = useState<ViewMode>("MATRIX");
  const [activeRole, setActiveRole] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setItems(data.items);
    setActiveRole((prev) => prev || (data.items[0]?.roleCode ?? ""));
  }, [data]);

  const scopeMeta = useMemo(() => data?.scopeMeta ?? [], [data]);
  const dirty = !!data && !sameConfig(items, data.items);

  const groups = useMemo(() => {
    const map = new Map<MissionScopeGroup, MissionScopeMeta[]>();
    for (const meta of scopeMeta) {
      const list = map.get(meta.group) ?? [];
      list.push(meta);
      map.set(meta.group, list);
    }
    return [...map.entries()];
  }, [scopeMeta]);

  const patch = (roleCode: string, next: Partial<MissionScopeConfigItem>) => {
    setItems((prev) =>
      prev.map((item) =>
        item.roleCode === roleCode ? { ...item, ...next } : item,
      ),
    );
  };

  const toggleScope = (roleCode: string, scope: MissionScope) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.roleCode !== roleCode) return item;
        const has = item.scopes.includes(scope);
        return {
          ...item,
          scopes: has
            ? item.scopes.filter((value) => value !== scope)
            : [...item.scopes, scope],
        };
      }),
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveMissionScopeConfig({
        items: items.map((item) => ({
          roleCode: item.roleCode,
          isEnabled: item.isEnabled,
          scopes: item.scopes,
          requireApproval: item.requireApproval,
          note: item.note,
        })),
      });
      toast.success("Đã lưu cấu hình phạm vi giao nhiệm vụ.");
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được cấu hình."));
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const fresh = await resetMissionScopeConfig();
      setItems(fresh.items);
      toast.success("Đã khôi phục cấu hình mặc định.");
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không khôi phục được."));
    } finally {
      setSaving(false);
    }
  };

  const current = items.find((item) => item.roleCode === activeRole);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Phân quyền giao nhiệm vụ theo phạm vi
          </h1>
          <p className="text-sm text-muted-foreground">
            Quy định vai trò nào được giao nhiệm vụ xuống phạm vi nào. Người
            giao chỉ thấy đúng nơi nhận thuộc phạm vi vai trò của mình.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as ViewMode)}
          >
            <TabsList>
              <TabsTrigger value="MATRIX">Ma trận</TabsTrigger>
              <TabsTrigger value="ROLE">Theo vai trò</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            className="bg-background"
            onClick={() => void reset()}
            disabled={saving || isLoading}
          >
            <RotateCcw className="h-4 w-4" />
            Mặc định
          </Button>
          <Button onClick={() => void save()} disabled={saving || !dirty}>
            <Save className="h-4 w-4" />
            {saving ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
        </div>
      </div>

      {dirty ? (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="size-4 shrink-0" />
          Có thay đổi chưa lưu.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Card
            key={item.roleCode}
            className={cn(!item.isEnabled && "opacity-70")}
          >
            <CardContent className="space-y-2 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Shield className="size-4 shrink-0 text-primary" />
                  <span className="truncate text-sm font-semibold">
                    {item.roleName}
                  </span>
                </div>
                <Switch
                  checked={item.isEnabled}
                  onCheckedChange={(checked) =>
                    patch(item.roleCode, { isEnabled: checked })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Cấp quản lý: {ROLE_LEVEL_HINT[item.roleCode] ?? "Tuỳ cấu hình"}
              </p>
              <div className="flex flex-wrap gap-1">
                {item.scopes.length === 0 || !item.isEnabled ? (
                  <Badge variant="outline" className="font-normal">
                    Không có phạm vi
                  </Badge>
                ) : (
                  item.scopes.map((scope) => (
                    <Badge
                      key={scope}
                      variant="secondary"
                      className="font-normal"
                    >
                      {scopeMeta.find((meta) => meta.key === scope)?.label ??
                        scope}
                    </Badge>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Đang tải...
          </CardContent>
        </Card>
      ) : view === "MATRIX" ? (
        <Card>
          <CardContent className="space-y-3 pt-4">
            <h2 className="text-sm font-semibold">Ma trận vai trò × phạm vi</h2>
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[280px]">
                      Phạm vi nhận nhiệm vụ
                    </TableHead>
                    {items.map((item) => (
                      <TableHead
                        key={item.roleCode}
                        className="min-w-[130px] text-center"
                      >
                        <div className="font-medium">{item.roleName}</div>
                        <div className="text-xs font-normal text-muted-foreground">
                          {ROLE_LEVEL_HINT[item.roleCode] ?? ""}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scopeMeta.map((meta) => (
                    <TableRow key={meta.key}>
                      <TableCell>
                        <div className="font-medium">{meta.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {meta.description}
                        </div>
                      </TableCell>
                      {items.map((item) => {
                        const on = item.scopes.includes(meta.key);
                        return (
                          <TableCell
                            key={item.roleCode}
                            className="text-center"
                          >
                            <button
                              type="button"
                              disabled={!item.isEnabled}
                              onClick={() =>
                                toggleScope(item.roleCode, meta.key)
                              }
                              className={cn(
                                "inline-flex h-8 w-full items-center justify-center rounded-md border transition-colors",
                                on
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "text-muted-foreground hover:bg-accent",
                                !item.isEnabled &&
                                  "cursor-not-allowed opacity-40",
                              )}
                              aria-label={`${item.roleName} - ${meta.label}`}
                            >
                              {on ? (
                                <Check className="size-4" />
                              ) : (
                                <X className="size-4" />
                              )}
                            </button>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              Bấm vào ô để bật/tắt quyền. Vai trò bị tắt công tắc sẽ không giao
              được nhiệm vụ cho bất kỳ phạm vi nào.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-5 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">
                Chi tiết vai trò: {current?.roleName ?? "-"}
              </h2>
              <Select value={activeRole} onValueChange={setActiveRole}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((item) => (
                    <SelectItem key={item.roleCode} value={item.roleCode}>
                      {item.roleName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {current ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <div className="space-y-0.5">
                      <Label>Được giao nhiệm vụ</Label>
                      <p className="text-xs text-muted-foreground">
                        Tắt là vai trò này không giao được cho ai
                      </p>
                    </div>
                    <Switch
                      checked={current.isEnabled}
                      onCheckedChange={(checked) =>
                        patch(current.roleCode, { isEnabled: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
                    <div className="space-y-0.5">
                      <Label>Cần cấp trên duyệt</Label>
                      <p className="text-xs text-muted-foreground">
                        Tắt là cấp dưới gửi kết quả lên xong tự hoàn thành
                      </p>
                    </div>
                    <Switch
                      checked={current.requireApproval}
                      onCheckedChange={(checked) =>
                        patch(current.roleCode, { requireApproval: checked })
                      }
                    />
                  </div>
                </div>

                {groups.map(([group, metas]) => (
                  <div key={group} className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      {MISSION_SCOPE_GROUP_LABEL[group]}
                    </p>
                    <div className="grid gap-3 lg:grid-cols-3">
                      {metas.map((meta) => {
                        const on = current.scopes.includes(meta.key);
                        return (
                          <div
                            key={meta.key}
                            className={cn(
                              "flex items-start justify-between gap-3 rounded-lg border p-3",
                              on && "border-primary/50 bg-primary/5",
                              !current.isEnabled && "opacity-50",
                            )}
                          >
                            <div className="min-w-0 space-y-0.5">
                              <p className="text-sm font-medium">
                                {meta.label}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {meta.description}
                              </p>
                            </div>
                            <Switch
                              checked={on}
                              disabled={!current.isEnabled}
                              onCheckedChange={() =>
                                toggleScope(current.roleCode, meta.key)
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                <div className="space-y-2">
                  <Label htmlFor="scope-note">Ghi chú nội bộ</Label>
                  <Textarea
                    id="scope-note"
                    rows={2}
                    value={current.note}
                    onChange={(e) =>
                      patch(current.roleCode, { note: e.target.value })
                    }
                    placeholder="Vì sao vai trò này có phạm vi như vậy..."
                  />
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
