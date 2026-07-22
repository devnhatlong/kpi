"use client";

import { useEffect, useRef, useState, type SetStateAction } from "react";
import useSWR from "swr";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCog,
  MoreHorizontal,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  activeBadgeClass,
  inactiveBadgeClass,
} from "@/features/organization/badge-styles";
import {
  entityId,
  type Role,
  type UserAccount,
} from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";
import {
  createKpiTemplate,
  deleteKpiTemplate,
  fetchKpiTemplates,
  kpiConfigKeys,
  updateKpiTemplate,
} from "../api";
import {
  createBlankTemplateDraft,
  toTemplateDraft,
  toTemplateInput,
  type TemplateDraft,
} from "../template-mappers";
import {
  isAutoIncrementColumn,
  type TemplateColumn,
  type TemplateColumnDataType,
  type TemplateHeaderGroup,
  type TemplateVisibilityScope,
  type WorkContent,
} from "../types";

const CALCULATED_INPUT = "CALCULATED";

type DataType = TemplateColumnDataType;

const dataTypeLabels: Record<DataType, string> = {
  text: "Văn bản",
  number: "Số",
  text_file: "Văn bản + upload file",
  auto_increment: "STT tự tăng",
};

function column(
  key: string,
  title: string,
  width: number,
  inputRoleCode: string,
  dataType: DataType,
): TemplateColumn {
  return {
    id: key,
    key,
    title,
    headerPath: [],
    width,
    visible: true,
    inputRoleCode,
    dataType,
  };
}

function newTemplateHeaderGroupId(prefix = "GROUP"): string {
  return `${prefix}_${Date.now().toString(36).toUpperCase()}_${Math.random()
    .toString(36)
    .slice(2, 5)
    .toUpperCase()}`;
}

function cloneTemplateHeaderGroups(groups: TemplateHeaderGroup[]): TemplateHeaderGroup[] {
  return groups.map((group) => ({
    ...group,
    children: cloneTemplateHeaderGroups(group.children),
  }));
}

function collectDescendantIds(group: TemplateHeaderGroup): string[] {
  return [group.id, ...group.children.flatMap(collectDescendantIds)];
}

function updateHeaderNode(
  groups: TemplateHeaderGroup[],
  id: string,
  updater: (node: TemplateHeaderGroup) => TemplateHeaderGroup,
): TemplateHeaderGroup[] {
  return groups.map((group) => {
    if (group.id === id) return updater(group);
    return {
      ...group,
      children: updateHeaderNode(group.children, id, updater),
    };
  });
}

function removeHeaderNode(
  groups: TemplateHeaderGroup[],
  id: string,
): { groups: TemplateHeaderGroup[]; removedIds: string[] } {
  const next: TemplateHeaderGroup[] = [];
  const removedIds: string[] = [];

  for (const group of groups) {
    if (group.id === id) {
      removedIds.push(...collectDescendantIds(group));
      continue;
    }
    const childResult = removeHeaderNode(group.children, id);
    removedIds.push(...childResult.removedIds);
    next.push({ ...group, children: childResult.groups });
  }

  return { groups: next, removedIds };
}

function headerPathLabel(groups: TemplateHeaderGroup[], path: string[]): string {
  if (!path.length) return "Không nhóm";
  const names: string[] = [];
  let current = groups;
  for (const id of path) {
    const node = current.find((item) => item.id === id);
    if (!node) break;
    names.push(node.name);
    current = node.children;
  }
  return names.length ? names.join(" → ") : "Không nhóm";
}

function resolvePathLabels(
  groups: TemplateHeaderGroup[],
  path: string[],
): string[] {
  const names: string[] = [];
  let current = groups;
  for (const id of path) {
    const node = current.find((item) => item.id === id);
    if (!node) break;
    names.push(node.name);
    current = node.children;
  }
  return names;
}

type HeaderPreviewCell = {
  key: string;
  label: string;
  colSpan: number;
  rowSpan: number;
  minWidth?: number;
};

function pathPrefixEqual(
  left: string[],
  right: string[],
  level: number,
): boolean {
  for (let index = 0; index <= level; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function buildHeaderPreviewRows(
  columns: TemplateColumn[],
  groups: TemplateHeaderGroup[],
): { rows: HeaderPreviewCell[][]; widths: number[] } | null {
  const visible = columns.filter((item) => item.visible);
  if (!visible.length) return null;

  const enriched = visible.map((item) => ({
    id: item.id,
    title: item.title.trim() || "(Chưa đặt nhãn)",
    width: item.width,
    pathLabels: resolvePathLabels(groups, item.headerPath),
  }));
  const maxDepth = Math.max(0, ...enriched.map((item) => item.pathLabels.length));
  const totalRows = maxDepth + 1;
  const occupied = Array.from({ length: totalRows }, () =>
    Array.from({ length: enriched.length }, () => false),
  );
  const rows: HeaderPreviewCell[][] = Array.from(
    { length: totalRows },
    () => [],
  );

  for (let level = 0; level < maxDepth; level += 1) {
    let index = 0;
    while (index < enriched.length) {
      if (occupied[level]![index]) {
        index += 1;
        continue;
      }

      const column = enriched[index]!;
      if (column.pathLabels.length <= level) {
        const rowSpan = totalRows - level;
        rows[level]!.push({
          key: `title-${column.id}-${level}`,
          label: column.title,
          colSpan: 1,
          rowSpan,
          minWidth: column.width,
        });
        for (let row = level; row < totalRows; row += 1) {
          occupied[row]![index] = true;
        }
        index += 1;
        continue;
      }

      let end = index + 1;
      while (
        end < enriched.length &&
        !occupied[level]![end] &&
        enriched[end]!.pathLabels.length > level &&
        pathPrefixEqual(
          column.pathLabels,
          enriched[end]!.pathLabels,
          level,
        )
      ) {
        end += 1;
      }

      const run = enriched.slice(index, end);
      rows[level]!.push({
        key: `group-${level}-${index}-${column.pathLabels[level]}`,
        label: column.pathLabels[level]!,
        colSpan: run.length,
        rowSpan: 1,
        minWidth: run.reduce((sum, item) => sum + item.width, 0),
      });
      for (let cursor = index; cursor < end; cursor += 1) {
        occupied[level]![cursor] = true;
      }
      index = end;
    }
  }

  const leafLevel = maxDepth;
  for (let index = 0; index < enriched.length; index += 1) {
    if (occupied[leafLevel]![index]) continue;
    const column = enriched[index]!;
    rows[leafLevel]!.push({
      key: `leaf-${column.id}`,
      label: column.title,
      colSpan: 1,
      rowSpan: 1,
      minWidth: column.width,
    });
    occupied[leafLevel]![index] = true;
  }

  return {
    rows,
    widths: enriched.map((item) => item.width),
  };
}

function HeaderPreviewTable({
  columns,
  groups,
}: {
  columns: TemplateColumn[];
  groups: TemplateHeaderGroup[];
}) {
  const preview = buildHeaderPreviewRows(columns, groups);

  if (!preview) {
    return (
      <div className="rounded-md border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
        Bật ít nhất một cột để xem trước header.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-background">
      <table className="w-max min-w-full border-collapse text-xs">
        <colgroup>
          {preview.widths.map((width, index) => (
            <col key={`col-${index}`} style={{ width }} />
          ))}
        </colgroup>
        <thead>
          {preview.rows.map((row, rowIndex) => (
            <tr key={`header-row-${rowIndex}`} className="bg-muted/40">
              {row.map((cell) => (
                <th
                  key={cell.key}
                  colSpan={cell.colSpan}
                  rowSpan={cell.rowSpan}
                  className="border px-2 py-2 text-center align-middle font-semibold leading-snug"
                  style={
                    cell.minWidth ? { minWidth: cell.minWidth } : undefined
                  }
                >
                  {cell.label}
                </th>
              ))}
            </tr>
          ))}
        </thead>
      </table>
    </div>
  );
}

function flattenHeaderOptions(
  groups: TemplateHeaderGroup[],
  ancestors: TemplateHeaderGroup[] = [],
): Array<{
  value: string;
  path: string[];
  label: string;
  depth: number;
}> {
  return groups.flatMap((group) => {
    const path = [...ancestors.map((item) => item.id), group.id];
    const label = [...ancestors.map((item) => item.name), group.name].join(
      " → ",
    );
    const option = {
      value: path.join("/"),
      path,
      label,
      depth: ancestors.length,
    };
    return [
      option,
      ...flattenHeaderOptions(group.children, [...ancestors, group]),
    ];
  });
}

function HeaderPathSelects({
  groups,
  path,
  onChange,
}: {
  groups: TemplateHeaderGroup[];
  path: string[];
  onChange: (path: string[]) => void;
}) {
  const options = flattenHeaderOptions(groups);
  const value = path.length ? path.join("/") : "__NONE__";

  return (
    <div className="space-y-1">
      <Select
        value={value}
        onValueChange={(selected) => {
          if (selected === "__NONE__") {
            onChange([]);
            return;
          }
          const option = options.find((item) => item.value === selected);
          onChange(option?.path ?? []);
        }}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Chọn nhóm header">
            {headerPathLabel(groups, path)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__NONE__">Không nhóm</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <span
                className="block truncate"
                style={{ paddingLeft: `${option.depth * 12}px` }}
              >
                {option.depth > 0 ? "↳ " : ""}
                {option.label.split(" → ").at(-1)}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="text-[10px] leading-snug text-muted-foreground">
        Chọn lớp gộp cuối cùng (vd: Kết quả KPI tiến độ). Tên cột cuối nhập ở
        Nhãn cột.
      </div>
    </div>
  );
}

function TemplateHeaderGroupNodeEditor({
  node,
  depth,
  onRename,
  onRemove,
  onAddChild,
}: {
  node: TemplateHeaderGroup;
  depth: number;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onAddChild: (parentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const childCount = node.children.length;

  return (
    <div className={depth === 0 ? "rounded-md border p-3" : "space-y-2"}>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={depth === 0 ? "h-9 w-7 shrink-0" : "h-8 w-7 shrink-0"}
          onClick={() => setExpanded((current) => !current)}
          aria-label={expanded ? "Thu gọn nhóm" : "Mở rộng nhóm"}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
        <Input
          className={depth === 0 ? undefined : "h-8"}
          value={node.name}
          onChange={(event) => onRename(node.id, event.target.value)}
        />
        {!expanded && childCount > 0 ? (
          <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
            {childCount}
          </Badge>
        ) : null}
        <Button
          size="icon"
          variant="ghost"
          className={depth === 0 ? undefined : "h-8 w-8"}
          onClick={() => onRemove(node.id)}
          aria-label="Xoá nhóm header"
        >
          <Trash2
            className={
              depth === 0
                ? "h-4 w-4 text-destructive"
                : "h-3.5 w-3.5 text-destructive"
            }
          />
        </Button>
      </div>
      {expanded ? (
        <div className="mt-2 space-y-2 border-l pl-4">
          {node.children.map((child) => (
            <TemplateHeaderGroupNodeEditor
              key={child.id}
              node={child}
              depth={depth + 1}
              onRename={onRename}
              onRemove={onRemove}
              onAddChild={onAddChild}
            />
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setExpanded(true);
              onAddChild(node.id);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm nhóm con
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function normalizeFieldKey(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return /^\d/.test(normalized) ? `field_${normalized}` : normalized;
}

function generateTemplateCode(): string {
  return `KPI_${Date.now().toString(36).toUpperCase()}`;
}

export function TemplateConfigView({
  contents,
  roles,
  users,
}: {
  contents: WorkContent[];
  roles: Role[];
  users: UserAccount[];
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateDialogMode, setTemplateDialogMode] = useState<
    "create" | "copy" | "edit" | null
  >(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateCode, setNewTemplateCode] = useState("");
  const [newTemplateVisibilityScope, setNewTemplateVisibilityScope] =
    useState<TemplateVisibilityScope>("ALL");
  const [newAssignedRoleIds, setNewAssignedRoleIds] = useState<string[]>([]);
  const [newAssignedUserIds, setNewAssignedUserIds] = useState<string[]>([]);
  const [newIsActive, setNewIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<TemplateDraft[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const templatesQuery = useSWR(kpiConfigKeys.templates, fetchKpiTemplates);
  const templatesHydratedRef = useRef(false);

  useEffect(() => {
    const data = templatesQuery.data;
    if (!data || templatesHydratedRef.current) return;
    setTemplates(data.map(toTemplateDraft));
    setSelectedTemplateId(data[0]?.id ?? "");
    templatesHydratedRef.current = true;
  }, [templatesQuery.data]);

  const activeTemplate = templates.find(
    (template) => template.id === selectedTemplateId,
  );
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  function setTemplateField<K extends keyof TemplateDraft>(
    key: K,
    action: SetStateAction<TemplateDraft[K]>,
  ) {
    setTemplates((current) =>
      current.map((template) => {
        if (template.id !== selectedTemplateId) return template;
        const value =
          typeof action === "function"
            ? (action as (current: TemplateDraft[K]) => TemplateDraft[K])(
                template[key],
              )
            : action;
        return { ...template, [key]: value };
      }),
    );
  }

  const columns = activeTemplate?.columns ?? [];
  const templateName = activeTemplate?.name ?? "";
  const templateCode = activeTemplate?.code ?? "";
  const includedContentIds = activeTemplate?.includedContentIds ?? [];
  const progressWeight = activeTemplate?.progressWeight ?? "50";
  const qualityWeight = activeTemplate?.qualityWeight ?? "50";
  const headerGroups = activeTemplate?.headerGroups ?? [];
  const setColumns = (action: SetStateAction<TemplateColumn[]>) =>
    setTemplateField("columns", action);
  const setIncludedContentIds = (action: SetStateAction<string[]>) =>
    setTemplateField("includedContentIds", action);
  const setProgressWeight = (action: SetStateAction<string>) =>
    setTemplateField("progressWeight", action);
  const setQualityWeight = (action: SetStateAction<string>) =>
    setTemplateField("qualityWeight", action);
  const setTemplateHeaderGroups = (action: SetStateAction<TemplateHeaderGroup[]>) =>
    setTemplateField("headerGroups", action);

  const totalWidth = columns
    .filter((item) => item.visible)
    .reduce((sum, item) => sum + item.width, 0);

  const updateColumn = (
    id: string,
    patch: Partial<Omit<TemplateColumn, "id">>,
  ) => {
    setColumns((current) => {
      if (patch.dataType === "auto_increment") {
        const hasOther = current.some(
          (item) => item.id !== id && isAutoIncrementColumn(item),
        );
        if (hasOther) {
          toast.error("Mỗi biểu mẫu chỉ được có một cột STT tự tăng.");
          return current;
        }
      }

      return current.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.dataType === "auto_increment") {
          next.inputRoleCode = CALCULATED_INPUT;
        }
        return next;
      });
    });
  };

  const moveColumn = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= columns.length) return;
    setColumns((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const addCustomColumn = () => {
    const suffix = Date.now().toString(36);
    const defaultRoleCode = roles[0]?.code ?? "";
    setColumns((current) => [
      ...current,
      column(
        `custom_${suffix}`,
        "Cột tùy chỉnh",
        140,
        defaultRoleCode,
        "text",
      ),
    ]);
  };

  const removeColumn = (item: TemplateColumn) => {
    setColumns((current) =>
      current.filter((columnItem) => columnItem.id !== item.id),
    );
  };

  const addTemplateHeaderGroup = () => {
    const name = newGroupName.trim();
    if (!name) {
      toast.error("Vui lòng nhập tên nhóm header.");
      return;
    }
    setTemplateHeaderGroups((current) => [
      ...current,
      { id: newTemplateHeaderGroupId(), name, children: [] },
    ]);
    setNewGroupName("");
  };

  const renameTemplateHeaderGroup = (groupId: string, name: string) => {
    setTemplateHeaderGroups((current) =>
      updateHeaderNode(current, groupId, (node) => ({ ...node, name })),
    );
  };

  const removeTemplateHeaderGroup = (groupId: string) => {
    const result = removeHeaderNode(headerGroups, groupId);
    setTemplateHeaderGroups(result.groups);
    setColumns((current) =>
      current.map((item) => {
        const cut = item.headerPath.findIndex((id) =>
          result.removedIds.includes(id),
        );
        if (cut === -1) return item;
        return { ...item, headerPath: item.headerPath.slice(0, cut) };
      }),
    );
  };

  const addHeaderChild = (parentId: string) => {
    setTemplateHeaderGroups((current) =>
      updateHeaderNode(current, parentId, (node) => ({
        ...node,
        children: [
          ...node.children,
          {
            id: newTemplateHeaderGroupId("SUB"),
            name: "Nhóm header con mới",
            children: [],
          },
        ],
      })),
    );
  };

  const openTemplateDialog = (
    mode: "create" | "copy" | "edit",
    template = activeTemplate,
  ) => {
    setTemplateDialogMode(mode);
    setNewTemplateName(
      mode === "copy" && template
        ? `${template.name} - Bản sao`
        : mode === "edit" && template
          ? template.name
          : "",
    );
    setNewTemplateCode(
      mode === "edit" && template
        ? template.code
        : generateTemplateCode(),
    );
    setNewTemplateVisibilityScope(template?.visibilityScope ?? "ALL");
    setNewAssignedRoleIds(template?.assignedRoleIds ?? []);
    setNewAssignedUserIds(template?.assignedUserIds ?? []);
    setNewIsActive(
      mode === "create" ? true : (template?.isActive ?? true),
    );
  };

  const submitTemplateDialog = async () => {
    const name = newTemplateName.trim();
    const code = newTemplateCode.trim().toUpperCase();
    if (!name) {
      toast.error("Vui lòng nhập tên biểu mẫu.");
      return;
    }
    if (!code) {
      toast.error("Vui lòng nhập mã biểu mẫu.");
      return;
    }
    if (newTemplateVisibilityScope === "ROLES" && !newAssignedRoleIds.length) {
      toast.error("Vui lòng chọn ít nhất một role.");
      return;
    }
    if (newTemplateVisibilityScope === "USERS" && !newAssignedUserIds.length) {
      toast.error("Vui lòng chọn ít nhất một tài khoản.");
      return;
    }

    setSaving(true);
    try {
      if (templateDialogMode === "edit") {
        if (!selectedTemplateId) return;
        const updated = await updateKpiTemplate(selectedTemplateId, {
          name,
          code,
          visibilityScope: newTemplateVisibilityScope,
          assignedRoleIds: newAssignedRoleIds,
          assignedUserIds: newAssignedUserIds,
          isActive: newIsActive,
        });
        setTemplates((current) =>
          current.map((template) =>
            template.id === selectedTemplateId
              ? toTemplateDraft(updated)
              : template,
          ),
        );
        toast.success("Đã cập nhật biểu mẫu.");
      } else {
        const draft =
          templateDialogMode === "copy" && activeTemplate
            ? {
                ...activeTemplate,
                id: "",
                name,
                code,
                columns: activeTemplate.columns.map((item) => ({
                  ...item,
                  headerPath: [...item.headerPath],
                })),
                headerGroups: cloneTemplateHeaderGroups(
                  activeTemplate.headerGroups,
                ),
                includedContentIds: [...activeTemplate.includedContentIds],
                visibilityScope: newTemplateVisibilityScope,
                assignedRoleIds: [...newAssignedRoleIds],
                assignedUserIds: [...newAssignedUserIds],
                isActive: newIsActive,
              }
            : {
                ...createBlankTemplateDraft(name, code),
                visibilityScope: newTemplateVisibilityScope,
                assignedRoleIds: [...newAssignedRoleIds],
                assignedUserIds: [...newAssignedUserIds],
                isActive: newIsActive,
              };
        const created = await createKpiTemplate(toTemplateInput(draft));
        const nextTemplate = toTemplateDraft(created);
        setTemplates((current) => [...current, nextTemplate]);
        setSelectedTemplateId(nextTemplate.id);
        toast.success(
          templateDialogMode === "copy"
            ? "Đã sao chép toàn bộ biểu mẫu."
            : "Đã tạo biểu mẫu mới.",
        );
      }

      await templatesQuery.mutate();
      setTemplateDialogMode(null);
      setNewTemplateName("");
      setNewTemplateCode("");
      setNewIsActive(true);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được biểu mẫu."));
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async () => {
    if (!selectedTemplateId) return;
    setSaving(true);
    try {
      await deleteKpiTemplate(selectedTemplateId);
      const remaining = templates.filter(
        (template) => template.id !== selectedTemplateId,
      );
      setTemplates(remaining);
      setSelectedTemplateId(remaining[0]?.id ?? "");
      setDeleteDialogOpen(false);
      await templatesQuery.mutate();
      toast.success("Đã xoá biểu mẫu.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được biểu mẫu."));
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!activeTemplate) return;
    if (!templateName.trim() || !templateCode.trim()) {
      toast.error("Vui lòng nhập tên và mã biểu mẫu.");
      return;
    }
    if (columns.length) {
      if (columns.some((item) => !item.title.trim())) {
        toast.error("Nhãn cột không được để trống.");
        return;
      }
      const keys = columns.map((item) => item.key.trim());
      if (keys.some((key) => !key)) {
        toast.error("Mã trường không được để trống.");
        return;
      }
      if (new Set(keys).size !== keys.length) {
        toast.error("Mã trường phải duy nhất trong biểu mẫu.");
        return;
      }
      if (columns.some((item) => !item.inputRoleCode && !isAutoIncrementColumn(item))) {
        toast.error("Mỗi cột phải chọn role nhập hoặc công thức tự động.");
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await updateKpiTemplate(
        selectedTemplateId,
        toTemplateInput(activeTemplate),
      );
      setTemplates((current) =>
        current.map((template) =>
          template.id === selectedTemplateId
            ? toTemplateDraft(updated)
            : template,
        ),
      );
      await templatesQuery.mutate();
      toast.success("Đã lưu cấu hình biểu mẫu.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được cấu hình biểu mẫu."));
    } finally {
      setSaving(false);
    }
  };

  const saveHeaderGroups = async () => {
    if (!activeTemplate || !selectedTemplateId) return;

    setSaving(true);
    try {
      const updated = await updateKpiTemplate(selectedTemplateId, {
        headerGroups: activeTemplate.headerGroups,
        columns: activeTemplate.columns,
      });
      setTemplates((current) =>
        current.map((template) =>
          template.id === selectedTemplateId
            ? toTemplateDraft(updated)
            : template,
        ),
      );
      await templatesQuery.mutate();
      setGroupDialogOpen(false);
      toast.success("Đã lưu nhóm header.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được nhóm header."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="grid min-h-0 flex-1 overflow-hidden rounded-lg border bg-card lg:grid-cols-[250px_1fr]">
        <aside className="min-h-0 overflow-y-auto border-b bg-muted/20 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-xs font-bold uppercase tracking-wide">
              Danh sách biểu mẫu
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2"
              onClick={() => openTemplateDialog("create")}
            >
              <Plus className="h-3.5 w-3.5" />
              Tạo
            </Button>
          </div>
          <div className="space-y-2 p-2">
            {templatesQuery.isLoading ? (
              <div className="p-3 text-sm text-muted-foreground">
                Đang tải biểu mẫu...
              </div>
            ) : templates.length ? (
              templates.map((template) => (
                <div
                  key={template.id}
                  className={`relative w-full rounded-md border text-left ${
                    template.id === selectedTemplateId
                      ? "border-primary/20 bg-primary/10"
                      : "bg-background"
                  }`}
                >
                  <button
                    type="button"
                    className="w-full p-3 pr-10 text-left"
                    onClick={() => setSelectedTemplateId(template.id)}
                  >
                    <div className="font-semibold">{template.name}</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge
                        variant="outline"
                        className={
                          template.isActive
                            ? activeBadgeClass
                            : inactiveBadgeClass
                        }
                      >
                        {template.isActive ? "Hoạt động" : "Ngưng"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="h-5 bg-amber-50 text-amber-700"
                      >
                        Bản nháp
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {template.columns.filter((item) => item.visible).length}/
                      {template.columns.length} cột đang bật
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {template.visibilityScope === "ALL"
                        ? "Tất cả người dùng"
                        : template.visibilityScope === "ROLES"
                          ? `${template.assignedRoleIds.length} role được xem`
                          : `${template.assignedUserIds.length} tài khoản được xem`}
                    </div>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="absolute right-1.5 top-1.5 h-7 w-7"
                        aria-label={`Thao tác với ${template.name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setSelectedTemplateId(template.id);
                          openTemplateDialog("edit", template);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          setSelectedTemplateId(template.id);
                          openTemplateDialog("copy", template);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        Sao chép
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => {
                          setSelectedTemplateId(template.id);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Xoá
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                Chưa có biểu mẫu
              </div>
            )}
          </div>
        </aside>

        {activeTemplate ? (
          <section className="min-h-0 min-w-0 overflow-y-auto">
            <div className="space-y-4 border-b bg-muted/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                    <FileCog className="h-4 w-4" />
                    Biểu mẫu
                  </div>
                  <h2 className="mt-1 text-xl font-semibold">{templateName}</h2>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Mã: {templateCode} · Tổng rộng {totalWidth}px ·{" "}
                    {activeTemplate?.isActive ? "Đang hoạt động" : "Đang ngưng"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => openTemplateDialog("edit")}
                  >
                    <Pencil className="h-4 w-4" />
                    Chỉnh sửa
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openTemplateDialog("copy")}
                  >
                    <Copy className="h-4 w-4" />
                    Sao chép biểu mẫu
                  </Button>
                  <Button onClick={saveDraft} disabled={saving || !activeTemplate}>
                    <Save className="h-4 w-4" />
                    {saving ? "Đang lưu..." : "Lưu cấu hình"}
                  </Button>
                </div>
              </div>
            </div>

            <Tabs defaultValue="columns" className="p-4">
              <TabsList className="h-auto flex-wrap">
                <TabsTrigger value="columns">Cột & header</TabsTrigger>
                <TabsTrigger value="contents">Nội dung công việc</TabsTrigger>
                <TabsTrigger value="formula">Công thức điểm</TabsTrigger>
              </TabsList>

              <TabsContent value="columns" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      Cột hiển thị trên bảng nhập liệu
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Biểu mẫu bắt đầu trống. Lớp header gộp chọn ở Nhóm header;
                      tên cột cuối cùng nhập ở Nhãn cột. Role nhập lấy từ danh
                      mục role để dùng chung nhiều đơn vị.
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setGroupDialogOpen(true)}
                    >
                      Quản lý nhóm header
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addCustomColumn}
                    >
                      <Plus className="h-4 w-4" />
                      Thêm cột
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-md border">
                  <div className="min-w-[1180px]">
                    <div className="grid grid-cols-[70px_1fr_210px_140px_90px_170px_90px] gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                      <span>Hiện</span>
                      <span>Nhãn và mã trường</span>
                      <span>Nhóm header</span>
                      <span>Kiểu dữ liệu</span>
                      <span>Rộng</span>
                      <span>Role nhập</span>
                      <span className="text-right">Thứ tự</span>
                    </div>
                    {!columns.length ? (
                      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Chưa có cột nào. Chọn “Thêm cột” để bắt đầu tạo biểu
                        mẫu.
                      </div>
                    ) : null}
                    {columns.map((item, index) => (
                      <div
                        key={item.id}
                        className="grid grid-cols-[70px_1fr_210px_140px_90px_170px_90px] items-start gap-2 border-b px-3 py-2 last:border-b-0"
                      >
                        <Switch
                          className="mt-1.5"
                          checked={item.visible}
                          onCheckedChange={(visible) =>
                            updateColumn(item.id, { visible })
                          }
                        />
                        <div className="space-y-1">
                          <Input
                            className="h-9"
                            value={item.title}
                            onChange={(event) =>
                              updateColumn(item.id, {
                                title: event.target.value,
                              })
                            }
                          />
                          <Input
                            className="h-9 font-mono text-xs"
                            value={item.key}
                            onChange={(event) =>
                              updateColumn(item.id, {
                                key: normalizeFieldKey(event.target.value),
                              })
                            }
                            aria-label="Mã trường"
                            placeholder="Mã trường, ví dụ: diem_tien_do"
                          />
                        </div>
                        <HeaderPathSelects
                          groups={headerGroups}
                          path={item.headerPath}
                          onChange={(headerPath) =>
                            updateColumn(item.id, { headerPath })
                          }
                        />
                        <Select
                          value={item.dataType}
                          onValueChange={(dataType) =>
                            updateColumn(item.id, {
                              dataType: dataType as DataType,
                            })
                          }
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(dataTypeLabels).map(
                              ([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                        <Input
                          className="h-9"
                          type="number"
                          min={1}
                          value={item.width}
                          onChange={(event) =>
                            updateColumn(item.id, {
                              width: Math.max(
                                1,
                                Number(event.target.value) || 1,
                              ),
                            })
                          }
                        />
                        <Select
                          value={item.inputRoleCode || "__NONE__"}
                          onValueChange={(inputRoleCode) =>
                            updateColumn(item.id, {
                              inputRoleCode:
                                inputRoleCode === "__NONE__"
                                  ? ""
                                  : inputRoleCode,
                            })
                          }
                          disabled={isAutoIncrementColumn(item)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue
                              placeholder={
                                isAutoIncrementColumn(item)
                                  ? "Tự động"
                                  : "Chọn role"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {isAutoIncrementColumn(item) ? (
                              <SelectItem value={CALCULATED_INPUT}>
                                Tự động theo thứ tự dòng
                              </SelectItem>
                            ) : (
                              <>
                                <SelectItem value="__NONE__">
                                  Chưa chọn role
                                </SelectItem>
                                {roles.map((role) => (
                                  <SelectItem key={role.code} value={role.code}>
                                    {role.name} ({role.code})
                                  </SelectItem>
                                ))}
                                <SelectItem value={CALCULATED_INPUT}>
                                  Công thức tự động
                                </SelectItem>
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <div className="flex justify-end gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-7"
                            onClick={() => moveColumn(index, -1)}
                            disabled={index === 0}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-7"
                            onClick={() => moveColumn(index, 1)}
                            disabled={index === columns.length - 1}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-9 w-7"
                            onClick={() => removeColumn(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Xem trước header
                  </div>
                  <div className="mb-3 text-xs text-muted-foreground">
                    Header sẽ hiển thị trên bảng nhập liệu theo cấu hình hiện
                    tại (nhiều lớp gộp + nhãn cột).
                  </div>
                  <HeaderPreviewTable
                    columns={columns}
                    groups={headerGroups}
                  />
                </div>
              </TabsContent>

              <TabsContent value="contents" className="space-y-3">
                <div>
                  <div className="font-semibold">
                    Nội dung dùng trong biểu mẫu
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Chọn những nội dung công việc sẽ xuất hiện khi giao KPI.
                  </div>
                </div>
                <div className="divide-y rounded-md border">
                  {contents.length ? (
                    contents.map((content) => {
                      const id = entityId(content);
                      const checked = includedContentIds.includes(id);
                      return (
                        <label
                          key={id}
                          className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5"
                        >
                          <div>
                            <div className="font-medium">{content.name}</div>
                            <code className="text-xs text-muted-foreground">
                              {content.code}
                            </code>
                          </div>
                          <Switch
                            checked={checked}
                            onCheckedChange={(nextChecked) =>
                              setIncludedContentIds((current) =>
                                nextChecked
                                  ? [...new Set([...current, id])]
                                  : current.filter((value) => value !== id),
                              )
                            }
                          />
                        </label>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Chưa có nội dung công việc.
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="formula" className="space-y-4">
                <div>
                  <div className="font-semibold">Công thức tính điểm</div>
                  <div className="text-xs text-muted-foreground">
                    Bản demo giới hạn công thức theo trọng số, không chạy biểu
                    thức tùy ý.
                  </div>
                </div>
                <div className="grid max-w-xl gap-4 rounded-md border p-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Trọng số tiến độ (B)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={progressWeight}
                        onChange={(event) =>
                          setProgressWeight(event.target.value)
                        }
                      />
                      <span className="absolute right-3 top-2 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Trọng số chất lượng (C)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={qualityWeight}
                        onChange={(event) =>
                          setQualityWeight(event.target.value)
                        }
                      />
                      <span className="absolute right-3 top-2 text-sm text-muted-foreground">
                        %
                      </span>
                    </div>
                  </div>
                  <div className="sm:col-span-2 rounded-md bg-muted p-3 font-mono text-xs">
                    Điểm = Điểm chuẩn × (B × {progressWeight}% + C ×{" "}
                    {qualityWeight}
                    %)
                  </div>
                  {Number(progressWeight) + Number(qualityWeight) !== 100 ? (
                    <div className="sm:col-span-2 text-sm text-destructive">
                      Tổng trọng số phải bằng 100%.
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </Tabs>
          </section>
        ) : (
          <section className="flex h-full items-center justify-center p-6">
            <div className="text-center">
              <FileCog className="mx-auto h-10 w-10 text-muted-foreground" />
              <div className="mt-3 font-semibold">Chưa có biểu mẫu</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Tạo biểu mẫu mới để bắt đầu cấu hình.
              </div>
              <Button
                className="mt-4"
                onClick={() => openTemplateDialog("create")}
              >
                <Plus className="h-4 w-4" />
                Tạo biểu mẫu
              </Button>
            </div>
          </section>
        )}
      </div>

      <Dialog
        open={templateDialogMode !== null}
        onOpenChange={(open) => {
          if (!open) setTemplateDialogMode(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {templateDialogMode === "copy"
                ? "Sao chép biểu mẫu"
                : templateDialogMode === "edit"
                  ? "Chỉnh sửa biểu mẫu"
                  : "Tạo biểu mẫu mới"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-template-name">Tên biểu mẫu</Label>
              <Input
                id="new-template-name"
                value={newTemplateName}
                onChange={(event) => setNewTemplateName(event.target.value)}
                placeholder="Nhập tên biểu mẫu"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitTemplateDialog();
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-template-code">Mã biểu mẫu</Label>
              <Input
                id="new-template-code"
                value={newTemplateCode}
                onChange={(event) =>
                  setNewTemplateCode(event.target.value.toUpperCase())
                }
                placeholder="KPI_DEFAULT"
                className="font-mono"
              />
            </div>

            <div className="space-y-2">
              <Label>Ai được xem biểu mẫu</Label>
              <Select
                value={newTemplateVisibilityScope}
                onValueChange={(value) =>
                  setNewTemplateVisibilityScope(value as TemplateVisibilityScope)
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả người dùng</SelectItem>
                  <SelectItem value="ROLES">Theo role</SelectItem>
                  <SelectItem value="USERS">Theo tài khoản</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium">Kích hoạt biểu mẫu</div>
                <div className="text-xs text-muted-foreground">
                  Tắt để ẩn biểu mẫu khỏi danh sách dùng khi giao KPI.
                </div>
              </div>
              <Switch
                checked={newIsActive}
                onCheckedChange={setNewIsActive}
                aria-label="Kích hoạt biểu mẫu"
              />
            </div>

            {newTemplateVisibilityScope === "ROLES" ? (
              <div className="space-y-2">
                <Label>Chọn role</Label>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                  {roles.length ? (
                    roles.map((role) => {
                      const roleId = entityId(role);
                      return (
                        <label
                          key={roleId}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={newAssignedRoleIds.includes(roleId)}
                            onCheckedChange={(checked) =>
                              setNewAssignedRoleIds((current) =>
                                checked
                                  ? [...current, roleId]
                                  : current.filter((id) => id !== roleId),
                              )
                            }
                          />
                          <span>{role.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({role.code})
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">
                      Chưa có role đang hoạt động.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {newTemplateVisibilityScope === "USERS" ? (
              <div className="space-y-2">
                <Label>Chọn tài khoản</Label>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
                  {users.length ? (
                    users.map((user) => {
                      const userId = entityId(user);
                      return (
                        <label
                          key={userId}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                        >
                          <Checkbox
                            checked={newAssignedUserIds.includes(userId)}
                            onCheckedChange={(checked) =>
                              setNewAssignedUserIds((current) =>
                                checked
                                  ? [...current, userId]
                                  : current.filter((id) => id !== userId),
                              )
                            }
                          />
                          <span>{user.fullName || user.username}</span>
                          <span className="text-xs text-muted-foreground">
                            ({user.username})
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="p-2 text-sm text-muted-foreground">
                      Chưa có tài khoản đang hoạt động.
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {templateDialogMode === "copy" ? (
              <div className="text-xs text-muted-foreground">
                Toàn bộ cột, nhóm header, nội dung công việc và công thức sẽ
                được sao chép sang biểu mẫu mới.
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTemplateDialogMode(null)}
            >
              Huỷ
            </Button>
            <Button onClick={submitTemplateDialog} disabled={saving}>
              {saving
                ? "Đang lưu..."
                : templateDialogMode === "copy"
                  ? "Sao chép"
                  : templateDialogMode === "edit"
                    ? "Lưu thay đổi"
                    : "Tạo biểu mẫu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xoá biểu mẫu?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            Biểu mẫu “{templateName}” và toàn bộ cấu hình cột sẽ bị xoá.
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Huỷ
            </Button>
            <Button variant="destructive" onClick={deleteTemplate} disabled={saving}>
              Xoá biểu mẫu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Quản lý danh mục nhóm header</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Chỉ tạo các lớp gộp header (vd: Điểm tự chấm → Kết quả KPI tiến
              độ). Tên cột cuối như “Thực tế hoàn thành %” nhập ở Nhãn cột, không
              cần tạo thành nhóm con.
            </div>

            {headerGroups.map((group) => (
              <TemplateHeaderGroupNodeEditor
                key={group.id}
                node={group}
                depth={0}
                onRename={renameTemplateHeaderGroup}
                onRemove={removeTemplateHeaderGroup}
                onAddChild={addHeaderChild}
              />
            ))}

            <div className="flex gap-2 rounded-md border border-dashed p-3">
              <Input
                value={newGroupName}
                onChange={(event) => setNewGroupName(event.target.value)}
                placeholder="Tên nhóm header mới"
                onKeyDown={(event) => {
                  if (event.key === "Enter") addTemplateHeaderGroup();
                }}
              />
              <Button onClick={addTemplateHeaderGroup}>
                <Plus className="h-4 w-4" />
                Thêm nhóm
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setGroupDialogOpen(false)}
              disabled={saving}
            >
              Huỷ
            </Button>
            <Button onClick={saveHeaderGroups} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu và đóng"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
