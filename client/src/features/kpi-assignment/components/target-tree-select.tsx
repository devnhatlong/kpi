"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronsUpDown,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  AssignmentTargetDepartment,
  AssignmentTargetSelection,
  AssignmentTargets,
} from "@/features/kpi-assignment/types";
import { countSelectedTargets } from "@/features/kpi-assignment/types";
import { cn } from "@/lib/utils";

type TargetTreeSelectProps = {
  value: AssignmentTargetSelection;
  onChange: (value: AssignmentTargetSelection) => void;
  targets?: AssignmentTargets;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

type TreeNode = AssignmentTargetDepartment & { children: TreeNode[] };

function buildTree(items: AssignmentTargetDepartment[]): TreeNode[] {
  const byId = new Map<string, TreeNode>(
    items.map((item) => [item._id, { ...item, children: [] }]),
  );
  const roots: TreeNode[] = [];
  for (const item of items) {
    const node = byId.get(item._id)!;
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    // Cha không nằm trong danh sách trả về -> node này là gốc của cây hiển thị.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

/** Id các node khớp từ khoá, kèm toàn bộ tổ tiên để cây không bị đứt nhánh. */
function matchingIds(nodes: TreeNode[], keyword: string): Set<string> | null {
  const key = normalize(keyword);
  if (!key) return null;
  const keep = new Set<string>();

  const walk = (node: TreeNode, ancestors: string[]): boolean => {
    const self =
      normalize(node.name).includes(key) || normalize(node.code).includes(key);
    let anyChild = false;
    for (const child of node.children) {
      if (walk(child, [...ancestors, node._id])) anyChild = true;
    }
    if (self || anyChild) {
      keep.add(node._id);
      for (const id of ancestors) keep.add(id);
      return true;
    }
    return false;
  };

  for (const node of nodes) walk(node, []);
  return keep;
}

function collectIds(nodes: TreeNode[], into: Set<string> = new Set()) {
  for (const node of nodes) {
    into.add(node._id);
    collectIds(node.children, into);
  }
  return into;
}

export function TargetTreeSelect({
  value,
  onChange,
  targets,
  disabled,
  className,
  placeholder = "Chọn nơi nhận",
}: TargetTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const departments = useMemo(() => targets?.departments ?? [], [targets]);
  const users = useMemo(() => targets?.users ?? [], [targets]);
  const scope = targets?.scope;
  const tree = useMemo(() => buildTree(departments), [departments]);
  const visible = useMemo(() => matchingIds(tree, keyword), [tree, keyword]);

  // Mở sẵn tới tầng có đơn vị giao được, để không phải bung tay từng nhánh.
  useEffect(() => {
    if (!tree.length) return;
    const openTo = new Set<string>();
    const walk = (node: TreeNode, ancestors: string[]): boolean => {
      const childHit = node.children
        .map((child) => walk(child, [...ancestors, node._id]))
        .some(Boolean);
      if (node.canReceive || childHit) {
        for (const id of ancestors) openTo.add(id);
        if (childHit) openTo.add(node._id);
        return true;
      }
      return false;
    };
    for (const node of tree) walk(node, []);
    setExpanded((prev) => (prev.size ? prev : openTo));
  }, [tree]);

  const total = countSelectedTargets(value);

  const label = useMemo(() => {
    if (!total) return placeholder;
    const parts: string[] = [];
    if (value.departmentIds.length) {
      parts.push(`${value.departmentIds.length} đơn vị`);
    }
    if (value.userIds.length) parts.push(`${value.userIds.length} cán bộ`);
    return parts.join(" · ");
  }, [value, total, placeholder]);

  const toggle = (bucket: keyof AssignmentTargetSelection, id: string) => {
    const list = value[bucket];
    onChange({
      ...value,
      [bucket]: list.includes(id)
        ? list.filter((item) => item !== id)
        : [...list, id],
    });
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearAll = () => onChange({ departmentIds: [], userIds: [] });

  /** Các đơn vị nhận được nằm trong một nhánh - dùng cho nút "chọn hết". */
  const receivableIn = (node: TreeNode, into: string[] = []) => {
    for (const child of node.children) {
      if (child.canReceive) into.push(child._id);
      receivableIn(child, into);
    }
    return into;
  };

  const selectBranch = (node: TreeNode) => {
    const ids = receivableIn(node);
    if (!ids.length) return;
    const missing = ids.filter((id) => !value.departmentIds.includes(id));
    onChange({
      ...value,
      departmentIds: missing.length
        ? [...value.departmentIds, ...missing]
        : value.departmentIds.filter((id) => !ids.includes(id)),
    });
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (visible && !visible.has(node._id)) return null;
    const isOpen = expanded.has(node._id) || !!visible;
    const checked = value.departmentIds.includes(node._id);
    const branchIds = receivableIn(node);
    const branchSelected =
      branchIds.length > 0 &&
      branchIds.every((id) => value.departmentIds.includes(id));

    return (
      <div key={node._id}>
        <div
          className="flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-accent/60"
          style={{ paddingLeft: depth * 16 + 4 }}
        >
          {node.children.length ? (
            <button
              type="button"
              onClick={() => toggleExpanded(node._id)}
              className="flex size-4 shrink-0 items-center justify-center rounded border text-muted-foreground hover:bg-background"
              aria-label={isOpen ? "Thu gọn" : "Mở rộng"}
            >
              {isOpen ? (
                <Minus className="size-3" />
              ) : (
                <Plus className="size-3" />
              )}
            </button>
          ) : (
            <span className="size-4 shrink-0" />
          )}

          {node.isUnit ? (
            <Checkbox
              checked={checked}
              disabled={!node.canReceive}
              onCheckedChange={() => toggle("departmentIds", node._id)}
              aria-label={`Giao cho ${node.name}`}
            />
          ) : (
            // Cấp gom nhóm -> chỉ để xem, không nhận việc.
            <span
              className="size-4 shrink-0"
              title={`${node.levelName || "Cấp này"} chỉ gom nhóm, không nhận KPI`}
            />
          )}

          <Badge
            variant="secondary"
            className={cn(
              "shrink-0 px-1.5 py-0 font-mono text-[10px]",
              !node.isUnit && "opacity-60",
            )}
          >
            {node.code}
          </Badge>
          <span
            className={cn(
              "truncate text-sm",
              !node.isUnit && "font-medium text-muted-foreground",
              node.isUnit && !node.canReceive && "text-muted-foreground",
            )}
            title={node.name}
          >
            {node.name}
          </span>

          {/* Chỉ nút gom nhóm mới cần chọn hộ - đơn vị nhận được thì tích thẳng. */}
          {!node.isUnit && branchIds.length ? (
            <button
              type="button"
              onClick={() => selectBranch(node)}
              className={cn(
                "ml-auto shrink-0 rounded border px-1.5 py-0.5 text-[11px] transition-colors",
                branchSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-background",
              )}
              title="Tích hết các đơn vị nhận được trong nhánh này"
            >
              {branchSelected ? "bỏ hết" : `chọn hết ${branchIds.length}`}
            </button>
          ) : null}
        </div>

        {isOpen && node.children.length ? (
          <div>{node.children.map((child) => renderNode(child, depth + 1))}</div>
        ) : null}
      </div>
    );
  };

  const visibleUsers = useMemo(() => {
    const key = normalize(keyword);
    if (!key) return users;
    return users.filter(
      (item) =>
        normalize(item.fullName ?? "").includes(key) ||
        normalize(item.username).includes(key),
    );
  }, [users, keyword]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "h-8 w-full justify-between bg-background px-2 font-normal",
            !total && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <span className="flex shrink-0 items-center gap-1">
            {total ? (
              <span
                role="button"
                tabIndex={0}
                aria-label="Bỏ chọn tất cả"
                className="rounded p-0.5 opacity-60 hover:bg-muted hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.stopPropagation();
                  clearAll();
                }}
              >
                <X className="size-3.5" />
              </span>
            ) : null}
            <ChevronsUpDown className="size-3.5 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="z-[130] w-[440px] p-0" align="start">
        {scope ? (
          <div className="space-y-0.5 border-b bg-muted/40 px-3 py-2">
            <p className="text-xs">
              Bạn đang giao từ{" "}
              <span className="font-medium">{scope.departmentName}</span>
              {scope.levelName ? (
                <span className="text-muted-foreground">
                  {" "}
                  · cấp {scope.levelName}
                </span>
              ) : null}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {scope.isEnabled
                ? `Giao được cho ${scope.directChildCount} nơi nhận${
                    scope.canAssignToUsers ? ", kể cả cán bộ" : ""
                  }.`
                : "Vai trò của bạn chưa được cấp quyền giao KPI."}
            </p>
          </div>
        ) : null}

        <div className="space-y-2 border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8"
              placeholder="Tìm đơn vị, cán bộ..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setExpanded(collectIds(tree))}
            >
              <Maximize2 className="size-3.5" />
              Mở rộng
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setExpanded(new Set())}
            >
              <Minimize2 className="size-3.5" />
              Thu gọn
            </Button>
            {total ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-2 text-xs text-destructive"
                onClick={clearAll}
              >
                Bỏ chọn ({total})
              </Button>
            ) : null}
          </div>
        </div>

        <ScrollArea className="h-[340px]">
          <div className="p-2">
            {tree.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                Không có đơn vị cấp dưới nào.
              </p>
            ) : (
              tree.map((node) => renderNode(node, 0))
            )}

            {visibleUsers.length ? (
              <div className="mt-3 space-y-1 border-t pt-2">
                <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                  Cán bộ
                </p>
                {visibleUsers.map((item) => (
                  <label
                    key={item._id}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-accent/60",
                      !item.canReceive && "opacity-50",
                    )}
                  >
                    <Checkbox
                      checked={value.userIds.includes(item._id)}
                      disabled={!item.canReceive}
                      onCheckedChange={() => toggle("userIds", item._id)}
                    />
                    <UserRound className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {item.fullName || item.username}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </ScrollArea>

        <p className="border-t px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          Tích đơn vị nào thì <b>đơn vị đó</b> nhận, quản trị đơn vị tiếp nhận
          rồi tự ban tiếp xuống. Dòng không có ô tích thuộc cấp gom nhóm - đổi ở
          Tổ chức › Cấp đơn vị. Dòng mờ là nơi chưa tới lượt giao ở cấp của bạn.
        </p>
      </PopoverContent>
    </Popover>
  );
}
