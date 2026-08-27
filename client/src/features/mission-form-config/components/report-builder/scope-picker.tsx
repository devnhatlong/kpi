"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Layers,
  Search,
} from "lucide-react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { ScopeDraft } from "@/features/mission-form-config/components/report-builder/report-scope";
import {
  REPORT_SCOPE_TYPE_HINT,
  REPORT_SCOPE_TYPE_LABEL,
  REPORT_SCOPE_TYPES,
  type ReportScopeType,
} from "@/features/mission-form-config/types";
import {
  fetchDepartmentLevels,
  fetchDepartments,
} from "@/features/organization/api";
import { entityId, type Department } from "@/features/organization/types";
import { cn } from "@/lib/utils";

const SCOPE_ICON: Record<ReportScopeType, typeof Layers> = {
  all: Building2,
  by_level: Layers,
  by_department: Building2,
};

type DeptNode = {
  id: string;
  name: string;
  code: string;
  children: DeptNode[];
};

/** `parentId` có thể là chuỗi, object đã populate, hoặc null ở nút gốc. */
function parentIdOf(department: Department): string | null {
  const parent = department.parentId;
  if (!parent) return null;
  return typeof parent === "string" ? parent : (parent._id ?? null);
}

/**
 * Dựng cây từ danh sách phẳng, giữ thứ tự `path` để anh em đứng đúng thứ tự
 * như bên màn Tổ chức. Nút có cha không nằm trong danh sách (đơn vị cha đã tắt)
 * được coi là gốc, để không có đơn vị nào biến mất khỏi cây.
 */
function buildTree(departments: Department[]): DeptNode[] {
  const sorted = [...departments].sort((a, b) => a.path.localeCompare(b.path));
  const nodes = new Map<string, DeptNode>();
  for (const department of sorted) {
    nodes.set(entityId(department), {
      id: entityId(department),
      name: department.name,
      code: department.code,
      children: [],
    });
  }

  const roots: DeptNode[] = [];
  for (const department of sorted) {
    const node = nodes.get(entityId(department))!;
    const parentId = parentIdOf(department);
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

type ScopePickerProps = {
  value: ScopeDraft;
  onChange: (scope: ScopeDraft) => void;
  /** Tắt khi hộp thoại đang đóng - khỏi gọi danh mục đơn vị mỗi lượt render. */
  enabled?: boolean;
};

/**
 * Chọn phạm vi đơn vị áp dụng mẫu: toàn hệ thống, theo cấp, hoặc chỉ định đơn vị.
 *
 * Cây đơn vị gấp/mở được vì danh sách của ngành dài hàng trăm dòng - mở phẳng
 * hết thì phải cuộn mãi mới tới đơn vị cần tick. Mặc định chỉ mở cấp gốc và các
 * nhánh đang có đơn vị được chọn; nhánh gấp lại vẫn hiện số đã chọn bên trong để
 * không giấu mất lựa chọn cũ.
 */
export function ScopePicker({
  value,
  onChange,
  enabled = true,
}: ScopePickerProps) {
  const [query, setQuery] = useState("");

  const { data: levels = [] } = useSWR(
    enabled && value.scopeType === "by_level"
      ? "department-levels-scope"
      : null,
    fetchDepartmentLevels,
    { revalidateOnFocus: false },
  );
  const { data: departments = [] } = useSWR(
    enabled && value.scopeType === "by_department" ? "departments-scope" : null,
    fetchDepartments,
    { revalidateOnFocus: false },
  );

  const tree = useMemo(() => buildTree(departments), [departments]);

  /** Tổ tiên của từng đơn vị - dùng để mở nhánh và đếm số đã chọn bên trong. */
  const ancestorsById = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const department of departments) {
      map.set(entityId(department), department.ancestors ?? []);
    }
    return map;
  }, [departments]);

  const selected = useMemo(
    () => new Set(value.departmentIds),
    [value.departmentIds],
  );

  /** Số đơn vị đã chọn nằm bên trong mỗi nhánh - hiện khi nhánh đang gấp. */
  const selectedInside = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of selected) {
      for (const ancestor of ancestorsById.get(id) ?? []) {
        counts.set(ancestor, (counts.get(ancestor) ?? 0) + 1);
      }
    }
    return counts;
  }, [selected, ancestorsById]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /*
    Chốt trạng thái gấp/mở ngay trong render lúc danh sách đơn vị về, không qua
    effect - effect chạy sau khi vẽ nên cây sẽ chớp một nhịp ở trạng thái sai.
    Chỉ bám theo danh sách đơn vị, không bám theo lựa chọn: tick thêm một đơn vị
    mà cây tự gấp lại là mất chỗ đang làm.
  */
  const [seededFor, setSeededFor] = useState<number | null>(null);
  if (departments.length && seededFor !== departments.length) {
    setSeededFor(departments.length);
    const initial = new Set(tree.map((node) => node.id));
    for (const id of selected) {
      for (const ancestor of ancestorsById.get(id) ?? []) initial.add(ancestor);
    }
    setExpanded(initial);
  }

  const needle = query.trim().toLowerCase();

  /** Đang tìm kiếm: chỉ hiện nhánh dẫn tới kết quả, và mở sẵn các nhánh đó. */
  const searchView = useMemo(() => {
    if (!needle) return null;
    const visible = new Set<string>();
    const open = new Set<string>();
    for (const department of departments) {
      const hit =
        department.name.toLowerCase().includes(needle) ||
        department.code.toLowerCase().includes(needle);
      if (!hit) continue;
      const id = entityId(department);
      visible.add(id);
      for (const ancestor of ancestorsById.get(id) ?? []) {
        visible.add(ancestor);
        open.add(ancestor);
      }
    }
    return { visible, open };
  }, [needle, departments, ancestorsById]);

  const toggleLevel = (id: string, on: boolean) =>
    onChange({
      ...value,
      levelIds: on
        ? [...new Set([...value.levelIds, id])]
        : value.levelIds.filter((item) => item !== id),
    });

  const toggleDepartment = (id: string, on: boolean) =>
    onChange({
      ...value,
      departmentIds: on
        ? [...new Set([...value.departmentIds, id])]
        : value.departmentIds.filter((item) => item !== id),
    });

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setAllExpanded = (open: boolean) =>
    setExpanded(open ? new Set(departments.map(entityId)) : new Set());

  const renderNode = (node: DeptNode, depth: number): React.ReactNode => {
    if (searchView && !searchView.visible.has(node.id)) return null;

    const hasChildren = node.children.length > 0;
    const isOpen = searchView
      ? searchView.open.has(node.id)
      : expanded.has(node.id);
    const inside = selectedInside.get(node.id) ?? 0;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 rounded-md py-1 pr-2 hover:bg-accent/50"
          style={{ paddingLeft: 4 + depth * 16 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent"
              aria-label={
                isOpen ? `Thu gọn ${node.name}` : `Mở rộng ${node.name}`
              }
              aria-expanded={isOpen}
            >
              {isOpen ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
            </button>
          ) : (
            <span className="size-5 shrink-0" aria-hidden />
          )}

          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-0.5 text-sm">
            <Checkbox
              checked={selected.has(node.id)}
              onCheckedChange={(checked) =>
                toggleDepartment(node.id, checked === true)
              }
            />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
          </label>

          {/* Nhánh gấp lại vẫn phải cho thấy bên trong đang chọn mấy đơn vị. */}
          {!isOpen && inside > 0 ? (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-[11px] font-medium text-primary">
              {inside}
            </span>
          ) : null}
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
            {node.code}
          </span>
        </div>

        {hasChildren && isOpen
          ? node.children.map((child) => renderNode(child, depth + 1))
          : null}
      </div>
    );
  };

  const renderedTree = tree
    .map((node) => renderNode(node, 0))
    .filter((node) => node !== null);

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid min-w-0 gap-2 sm:grid-cols-3">
        {REPORT_SCOPE_TYPES.map((type) => {
          const Icon = SCOPE_ICON[type];
          const active = value.scopeType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onChange({ ...value, scopeType: type })}
              className={cn(
                "flex min-w-0 flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "hover:border-border hover:bg-accent/40",
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {REPORT_SCOPE_TYPE_LABEL[type]}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {REPORT_SCOPE_TYPE_HINT[type]}
              </span>
            </button>
          );
        })}
      </div>

      {value.scopeType === "by_level" ? (
        <div className="min-w-0 space-y-2">
          <Label>Các cấp đơn vị áp dụng</Label>
          {levels.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              Chưa có cấp đơn vị nào. Khai ở mục Tổ chức › Cấp đơn vị.
            </p>
          ) : (
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              {levels.map((level) => {
                const id = entityId(level);
                return (
                  <label
                    key={id}
                    className="flex min-w-0 cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm"
                  >
                    <Checkbox
                      checked={value.levelIds.includes(id)}
                      onCheckedChange={(checked) =>
                        toggleLevel(id, checked === true)
                      }
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {level.name}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {level.code}
                        {level.isMissionUnit ? " · đơn vị nhận nhiệm vụ" : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {value.scopeType === "by_department" ? (
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Các đơn vị áp dụng</Label>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">
                Đã chọn {value.departmentIds.length}
              </span>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setAllExpanded(true)}
                disabled={!!searchView}
              >
                Mở tất cả
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setAllExpanded(false)}
                disabled={!!searchView}
              >
                Thu gọn
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Tìm đơn vị theo tên hoặc mã..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="max-h-64 min-w-0 overflow-y-auto rounded-lg border p-2">
            {departments.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Đang tải danh sách đơn vị...
              </p>
            ) : renderedTree.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Không có đơn vị nào khớp.
              </p>
            ) : (
              renderedTree
            )}
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="scope-descendants" className="text-sm">
                Cấp dưới dùng theo đơn vị cha
              </Label>
              <p className="text-xs text-muted-foreground">
                Tick một Phòng là mọi Đội trong Phòng đó dùng chung mẫu này. Tắt
                khi muốn mẫu chỉ áp đúng đơn vị đã chọn.
              </p>
            </div>
            <Switch
              id="scope-descendants"
              className="mt-0.5 shrink-0"
              checked={value.includeDescendants}
              onCheckedChange={(includeDescendants) =>
                onChange({ ...value, includeDescendants })
              }
            />
          </div>
        </div>
      ) : null}

      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        Một đơn vị khớp nhiều mẫu thì lấy mẫu hẹp nhất: đơn vị chỉ định &gt;
        theo cấp &gt; toàn hệ thống. Nhờ vậy một năm vẫn có mẫu chung cho cả
        ngành và vài mẫu riêng cho đơn vị đặc thù.
      </p>
    </div>
  );
}
