"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  Plus,
  Trash2,
} from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  axisKeys,
  createFormTemplate,
  fetchAxesAll,
  updateFormTemplate,
} from "@/features/kpi-form-config/api";
import {
  addHeaderGroupToTree,
  buildHeaderRows,
  flattenHeaderGroups,
  pruneColumnHeaderPaths,
  removeHeaderGroupFromTree,
  updateHeaderGroupTree,
} from "@/features/kpi-form-config/form-template-utils";
import {
  allowedDataTypes,
  CATALOG_LABEL,
  catalogOfSemantic,
  createDefaultTemplateDraft,
  EMPTY_FORM_TEMPLATE_FOOTER,
  entityId,
  FORM_COLUMN_DATA_TYPE_LABEL,
  FORM_COLUMN_SEMANTIC_LABEL,
  FORM_FOOTER_MODE_LABEL,
  FORM_FOOTER_MODES,
  FORMULA_VALUE_SOURCE_HINT,
  footerMode,
  formulaColumns,
  formulaRoleLabel,
  formulaValueSource,
  kindOfSemantic,
  localId,
  plainNumberColumns,
  qualityLevelColumns,
  scoreGroupColumns,
  SEMANTIC_DATA_TYPE,
  SEMANTIC_KIND_HINT,
  SEMANTIC_KIND_LABEL,
  semanticsByKind,
  type FormColumnAutoValue,
  type FormColumnDataType,
  type FormColumnSemantic,
  type FormFooterMode,
  type FormHeaderGroup,
  type FormTemplate,
  type FormTemplateColumn,
  type FormTemplateFooter,
} from "@/features/kpi-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NO_GROUP = "__none__";
const NO_RANGE = "__norange__";
const NO_COLUMN = "__nocolumn__";
const MANUAL_VALUE = "__manual__";
const AUTO_PERCENT = "percent_of";

/**
 * Cột chất lượng gợi ý sẵn khi bật tự tính: ưu tiên cột nằm cùng nhóm header.
 *
 * Nhóm header CHỈ dùng để đoán mặc định lúc cấu hình, người dựng mẫu sửa lại
 * được. Lúc chạy thì luôn đọc khoá cột đã lưu, không suy lại theo nhóm - đổi
 * bố cục bảng không được phép đổi phép tính.
 */
function suggestPercentColumn(
  column: FormTemplateColumn,
  candidates: FormTemplateColumn[],
): FormTemplateColumn | undefined {
  const path = column.headerPath.join(">");
  return (
    candidates.find((item) => item.headerPath.join(">") === path) ??
    candidates[0]
  );
}

/** Tên cột kèm chú thích cột đó góp con số nào, cho dropdown công thức. */
function formulaColumnLabel(column: FormTemplateColumn): string {
  const source = formulaValueSource(column);
  const title = column.title || column.key;
  if (!source || source === "number") return title;
  return `${title} - ${FORMULA_VALUE_SOURCE_HINT[source]}`;
}

/**
 * Công thức viết ra chữ để admin đối chiếu với văn bản quy định trước khi lưu -
 * đọc "[(B/A)+(C/A)] / 2" nhanh hơn là suy từ hai ô dropdown.
 */
function formulaPreview(
  footer: FormTemplateFooter,
  columns: FormTemplateColumn[],
): string {
  const columnOf = (key: string) => columns.find((column) => column.key === key);
  const describe = (key: string) => {
    const column = columnOf(key);
    if (!column) return key;
    const source = formulaValueSource(column);
    const title = column.title || column.key;
    return source && source !== "number"
      ? `${title} (${FORMULA_VALUE_SOURCE_HINT[source]})`
      : title;
  };

  if (footerMode(footer) === "sum") {
    if (!footer.ratioColumnKeys.length) {
      return "Chọn ít nhất một cột điểm để cộng.";
    }
    return [
      `Điểm quy đổi = ${footer.ratioColumnKeys.map(describe).join(" + ")}`,
      "",
      "(cộng TỔNG của cả cột qua mọi nhiệm vụ của trục,",
      "rồi chặn ở điểm tối đa của trục)",
    ].join("\n");
  }

  if (!footer.baseColumnKey || !footer.ratioColumnKeys.length) {
    return "Chọn đủ cột mẫu số và ít nhất một cột tử số để xem công thức.";
  }

  const ratios = footer.ratioColumnKeys.map(
    (_, index) => `${formulaRoleLabel(index)}/A`,
  );
  const score =
    ratios.length === 1 ? ratios[0] : `[${ratios.join("+")}] / ${ratios.length}`;

  const lines = [
    `Tổng điểm trục = ${score}`,
    `Điểm quy đổi   = (${score}) × điểm tối đa của trục`,
    "",
    `A = ${describe(footer.baseColumnKey)}`,
    ...footer.ratioColumnKeys.map(
      (key, index) => `${formulaRoleLabel(index)} = ${describe(key)}`,
    ),
    "",
    "(A, B, C… là TỔNG của cả cột, không phải giá trị từng dòng)",
  ];

  // Chia phần trăm cho điểm là ra số hàng chục rồi nhân tiếp điểm tối đa -
  // điểm quy đổi sẽ vượt xa trần của trục. Cảnh báo ngay khi chọn, đừng để
  // phát hiện lúc bảng đã hiện số sai.
  const baseSource = columnOf(footer.baseColumnKey)
    ? formulaValueSource(columnOf(footer.baseColumnKey)!)
    : null;
  const mixedUnit =
    baseSource !== "quality_percent" &&
    footer.ratioColumnKeys.some((key) => {
      const column = columnOf(key);
      return column ? formulaValueSource(column) === "quality_percent" : false;
    });
  if (mixedUnit) {
    lines.push(
      "",
      "CẢNH BÁO: mẫu số là điểm còn tử số là phần trăm - tỉ lệ sẽ",
      "không nằm trong khoảng 0-1 và điểm quy đổi sẽ vượt trần trục.",
    );
  }

  return lines.join("\n");
}

type FormTemplateBuilderSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: FormTemplate | null;
  /** Tạo mới từ bảng trắng thay vì điền sẵn bộ cột mặc định. */
  startBlank?: boolean;
  onSuccess: () => void;
};

function newColumn(): FormTemplateColumn {
  return {
    id: localId("col"),
    key: localId("field"),
    title: "",
    headerPath: [],
    width: 160,
    visible: true,
    dataType: "text",
    semanticKey: "custom",
    required: false,
    rangeFromColumnKey: null,
    autoValue: null,
  };
}

export function FormTemplateBuilderSheet({
  open,
  onOpenChange,
  edit,
  startBlank = false,
  onSuccess,
}: FormTemplateBuilderSheetProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [axisIds, setAxisIds] = useState<string[]>([]);
  const [headerGroups, setHeaderGroups] = useState<FormHeaderGroup[]>([]);
  const [columns, setColumns] = useState<FormTemplateColumn[]>([]);
  const [footer, setFooter] = useState<FormTemplateFooter>(
    EMPTY_FORM_TEMPLATE_FOOTER,
  );
  const [saving, setSaving] = useState(false);

  const { data: axes = [] } = useSWR(open ? axisKeys.all : null, fetchAxesAll);

  useEffect(() => {
    if (!open) return;
    if (edit) {
      setName(edit.name);
      setDescription(edit.description ?? "");
      setSortOrder(String(edit.sortOrder ?? 0));
      setIsActive(edit.isActive);
      setAxisIds((edit.axisIds ?? []).map((axis) => entityId(axis)));
      setHeaderGroups(edit.headerGroups ?? []);
      setColumns(edit.columns ?? []);
      setFooter(edit.footer ?? EMPTY_FORM_TEMPLATE_FOOTER);
    } else {
      // Bảng trắng: tự dựng cột từ đầu. Ngược lại điền sẵn bộ cột mặc định.
      const draft = startBlank
        ? {
          headerGroups: [],
          columns: [],
          footer: EMPTY_FORM_TEMPLATE_FOOTER,
        }
        : createDefaultTemplateDraft();
      setName("");
      setDescription("");
      setSortOrder("0");
      setIsActive(true);
      setAxisIds([]);
      setHeaderGroups(draft.headerGroups);
      setColumns(draft.columns);
      setFooter(draft.footer);
    }
  }, [open, edit, startBlank]);

  const flatGroups = useMemo(
    () => flattenHeaderGroups(headerGroups),
    [headerGroups],
  );
  const preview = useMemo(
    () => buildHeaderRows(columns, headerGroups),
    [columns, headerGroups],
  );

  /** Cột Nhóm điểm trong mẫu - nguồn giới hạn cho các cột điểm. */
  const scoreColumns = useMemo(() => scoreGroupColumns(columns), [columns]);

  /** Hai nguồn của cột tự tính: phần trăm lấy ở đâu, điểm gốc lấy ở đâu. */
  const qualityColumns = useMemo(() => qualityLevelColumns(columns), [columns]);
  const baseColumns = useMemo(() => plainNumberColumns(columns), [columns]);

  /**
   * Cột sau khi bỏ cấu hình tự tính đã trỏ vào cột bị xoá hoặc đổi khỏi kiểu số.
   * Lọc lúc dựng payload chứ không sửa thẳng state - cùng lý do với liveFooter.
   */
  const liveColumns = useMemo<FormTemplateColumn[]>(() => {
    const qualityKeys = new Set(qualityColumns.map((column) => column.key));
    const baseKeys = new Set(baseColumns.map((column) => column.key));
    return columns.map((column) => {
      const auto = column.autoValue;
      if (!auto) return column;
      const usable =
        column.dataType === "number" &&
        qualityKeys.has(auto.percentColumnKey) &&
        baseKeys.has(auto.baseColumnKey) &&
        auto.baseColumnKey !== column.key;
      return usable ? column : { ...column, autoValue: null };
    });
  }, [columns, qualityColumns, baseColumns]);

  /** Cột gán được vào công thức - chỉ cột kiểu số mới cộng và chia được. */
  const numericColumns = useMemo(() => formulaColumns(columns), [columns]);
  const numericKeys = useMemo(
    () => new Set(numericColumns.map((column) => column.key)),
    [numericColumns],
  );

  /**
   * Công thức sau khi bỏ khoá trỏ vào cột đã xoá hoặc đã đổi khỏi kiểu số.
   * Lọc lúc dựng chứ không sửa thẳng state: sửa state trong effect sẽ đạp lên
   * đúng công thức vừa nạp từ mẫu đang mở, vì lượt chạy đầu cột còn rỗng.
   */
  const liveFooter = useMemo<FormTemplateFooter>(
    () => ({
      enabled: footer.enabled,
      mode: footerMode(footer),
      baseColumnKey:
        footer.baseColumnKey && numericKeys.has(footer.baseColumnKey)
          ? footer.baseColumnKey
          : null,
      ratioColumnKeys: footer.ratioColumnKeys.filter((key) =>
        numericKeys.has(key),
      ),
    }),
    [footer, numericKeys],
  );

  /** Mẫu cũ chưa khai kiểu tính thì vẫn là công thức tỉ lệ. */
  const mode = footerMode(footer);

  const patchFooter = (patch: Partial<FormTemplateFooter>) => {
    setFooter((prev) => ({ ...prev, ...patch }));
  };

  const setRatioColumn = (index: number, key: string) => {
    setFooter((prev) => {
      const next = [...prev.ratioColumnKeys];
      next[index] = key;
      return { ...prev, ratioColumnKeys: next };
    });
  };

  const removeRatioColumn = (index: number) => {
    setFooter((prev) => ({
      ...prev,
      ratioColumnKeys: prev.ratioColumnKeys.filter((_, i) => i !== index),
    }));
  };

  const patchColumn = (id: string, patch: Partial<FormTemplateColumn>) => {
    setColumns((prev) =>
      prev.map((column) =>
        column.id === id ? { ...column, ...patch } : column,
      ),
    );
  };

  /**
   * Khoá cột phải là duy nhất trong mẫu (server chặn trùng khoá).
   * Ánh xạ dùng được ở nhiều cột, nên cột thứ hai trở đi phải thêm hậu tố.
   */
  const uniqueColumnKey = (base: string, ownColumnId: string) => {
    const taken = new Set(
      columns.filter((c) => c.id !== ownColumnId).map((c) => c.key),
    );
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  };

  const changeSemantic = (
    column: FormTemplateColumn,
    semanticKey: FormColumnSemantic,
  ) => {
    // Giữ kiểu dữ liệu admin đã chọn nếu ánh xạ mới vẫn cho phép.
    const allowed = allowedDataTypes(semanticKey);
    patchColumn(column.id, {
      semanticKey,
      // Cột tự do sinh khoá riêng; cột có ánh xạ lấy tên ánh xạ làm khoá.
      key:
        semanticKey === "custom"
          ? localId("field")
          : uniqueColumnKey(semanticKey, column.id),
      dataType: allowed.includes(column.dataType)
        ? column.dataType
        : (SEMANTIC_DATA_TYPE[semanticKey] ?? allowed[0] ?? "text"),
      // Cột tự do không có tên gợi ý - lấy nhãn "Không ánh xạ" làm tiêu đề thì vô nghĩa.
      title:
        semanticKey === "custom"
          ? column.title
          : column.title || FORM_COLUMN_SEMANTIC_LABEL[semanticKey],
    });
  };

  const moveColumn = (index: number, delta: number) => {
    setColumns((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item!);
      return next;
    });
  };

  const addGroup = (parentId: string | null) => {
    const node: FormHeaderGroup = {
      id: localId("grp"),
      name: "Nhóm mới",
      children: [],
    };
    setHeaderGroups((prev) => addHeaderGroupToTree(prev, parentId, node));
  };

  const removeGroup = (id: string) => {
    setHeaderGroups((prev) => {
      const next = removeHeaderGroupFromTree(prev, id);
      setColumns((cols) => pruneColumnHeaderPaths(cols, next));
      return next;
    });
  };

  const toggleAxis = (axisId: string, checked: boolean) => {
    setAxisIds((prev) =>
      checked ? [...prev, axisId] : prev.filter((item) => item !== axisId),
    );
  };

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên mẫu bảng.");
      return;
    }
    if (!columns.length) {
      toast.error("Mẫu bảng phải có ít nhất một cột.");
      return;
    }
    const untitled = columns.find((column) => !column.title.trim());
    if (untitled) {
      toast.error("Còn cột chưa đặt tiêu đề.");
      return;
    }

    const sortOrderNum = Number(sortOrder);
    if (!Number.isFinite(sortOrderNum) || sortOrderNum < 0) {
      toast.error("Thứ tự hiển thị không hợp lệ.");
      return;
    }

    if (liveFooter.enabled) {
      const liveMode = footerMode(liveFooter);
      if (liveMode === "ratio" && !liveFooter.baseColumnKey) {
        toast.error("Công thức điểm: chưa chọn cột mẫu số (điểm chuẩn).");
        return;
      }
      if (!liveFooter.ratioColumnKeys.length) {
        toast.error(
          liveMode === "sum"
            ? "Công thức điểm: cần ít nhất một cột điểm để cộng."
            : "Công thức điểm: cần ít nhất một cột tử số.",
        );
        return;
      }
      if (
        liveMode === "ratio" &&
        liveFooter.baseColumnKey &&
        liveFooter.ratioColumnKeys.includes(liveFooter.baseColumnKey)
      ) {
        toast.error(
          "Công thức điểm: cột mẫu số không được dùng lại làm cột tử số.",
        );
        return;
      }
      if (
        new Set(liveFooter.ratioColumnKeys).size !==
        liveFooter.ratioColumnKeys.length
      ) {
        toast.error("Công thức điểm: một cột tử số bị chọn hai lần.");
        return;
      }
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      columns: liveColumns.map((column) => ({
        ...column,
        title: column.title.trim(),
        width: Number.isFinite(column.width) ? column.width : 160,
      })),
      headerGroups,
      footer: liveFooter,
      axisIds,
      sortOrder: sortOrderNum,
      isActive,
    };

    setSaving(true);
    try {
      if (edit) {
        await updateFormTemplate(entityId(edit), payload);
        toast.success("Đã cập nhật mẫu bảng.");
      } else {
        await createFormTemplate(payload);
        toast.success("Đã tạo mẫu bảng.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được mẫu bảng."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden sm:max-w-[96vw]"
      >
        <SheetHeader className="border-b pb-4 text-left">
          <SheetTitle>
            {edit ? `Sửa mẫu bảng · ${edit.code}` : "Tạo mẫu bảng KPI"}
          </SheetTitle>
          <SheetDescription>
            Dựng header bảng rồi gán cho trục. Khi nhập nhiệm vụ, chọn trục nào
            sẽ hiện đúng header của mẫu đó.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4">
          <section className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">
                Tên mẫu bảng <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Mẫu bảng trục nghiệp vụ"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-sort">Thứ tự hiển thị</Label>
              <Input
                id="tpl-sort"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="tpl-desc">Mô tả (tuỳ chọn)</Label>
              <Textarea
                id="tpl-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex h-9 items-center justify-between rounded-lg border px-3">
              <Label htmlFor="tpl-active">Đang hoạt động</Label>
              <Switch
                id="tpl-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">Áp dụng cho trục</h3>
              <p className="text-xs text-muted-foreground">
                Một trục chỉ thuộc đúng một mẫu đang hoạt động. Trục không chọn
                mẫu nào sẽ dùng bảng mặc định.
              </p>
            </div>
            {axes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có trục nào. Tạo trục trước ở mục Trục.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {axes.map((axis) => {
                  const id = entityId(axis);
                  return (
                    <label
                      key={id}
                      className="flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm"
                    >
                      <Checkbox
                        checked={axisIds.includes(id)}
                        onCheckedChange={(checked) =>
                          toggleAxis(id, checked === true)
                        }
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{axis.name}</span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {axis.code}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Nhóm header (gộp ô)</h3>
                <p className="text-xs text-muted-foreground">
                  Tạo nhóm để gộp nhiều cột chung một tiêu đề, lồng được nhiều
                  tầng. Gán cột vào nhóm ở bảng bên dưới.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addGroup(null)}
              >
                <Plus className="h-4 w-4" />
                Thêm nhóm
              </Button>
            </div>

            {flatGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có nhóm nào - mọi cột đứng riêng một tầng header.
              </p>
            ) : (
              <div className="space-y-2">
                {flatGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-2"
                    style={{ paddingLeft: group.depth * 24 }}
                  >
                    {group.depth > 0 ? (
                      <CornerDownRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : null}
                    <Input
                      value={group.name}
                      onChange={(e) =>
                        setHeaderGroups((prev) =>
                          updateHeaderGroupTree(prev, group.id, {
                            name: e.target.value,
                          }),
                        )
                      }
                      className="h-8 max-w-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => addGroup(group.id)}
                    >
                      <Plus className="h-4 w-4" />
                      Nhóm con
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => removeGroup(group.id)}
                      aria-label="Xoá nhóm"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Cột của bảng</h3>
                <p className="text-xs text-muted-foreground">
                  Thứ tự cột ở đây là thứ tự hiển thị. Cột cùng nhóm nên xếp
                  liền nhau để gộp header đúng.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setColumns((prev) => [...prev, newColumn()])}
              >
                <Plus className="h-4 w-4" />
                Thêm cột
              </Button>
            </div>


            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Thứ tự</TableHead>
                    <TableHead className="min-w-[200px]">Tiêu đề cột</TableHead>
                    <TableHead className="w-[220px]">Ánh xạ dữ liệu</TableHead>
                    <TableHead className="w-[150px]">Kiểu dữ liệu</TableHead>
                    <TableHead className="w-[190px]">Nhóm header</TableHead>
                    <TableHead className="w-[90px]">Rộng</TableHead>
                    <TableHead className="w-[70px]">Hiện</TableHead>
                    <TableHead className="w-[80px]">Bắt buộc</TableHead>
                    <TableHead className="w-14" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {columns.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="h-20 text-center text-muted-foreground"
                      >
                        Chưa có cột nào.
                      </TableCell>
                    </TableRow>
                  ) : (
                    columns.map((column, index) => {
                      const dataTypeOptions = allowedDataTypes(
                        column.semanticKey,
                      );
                      const groupValue = column.headerPath?.length
                        ? column.headerPath[column.headerPath.length - 1]!
                        : NO_GROUP;
                      return (
                        <TableRow key={column.id}>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <span className="w-5 text-xs text-muted-foreground tabular-nums">
                                {index + 1}
                              </span>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                disabled={index === 0}
                                onClick={() => moveColumn(index, -1)}
                                aria-label="Lên"
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                disabled={index === columns.length - 1}
                                onClick={() => moveColumn(index, 1)}
                                aria-label="Xuống"
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              value={column.title}
                              onChange={(e) =>
                                patchColumn(column.id, { title: e.target.value })
                              }
                              placeholder="Tiêu đề hiển thị"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={column.semanticKey}
                              onValueChange={(value) =>
                                changeSemantic(
                                  column,
                                  value as FormColumnSemantic,
                                )
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {/* Gom theo kiểu ánh xạ để người cấu hình thấy
                                    ngay cột sẽ thành ô nhập, dropdown hay tự điền. */}
                                {semanticsByKind().map((group) => (
                                  <SelectGroup key={group.kind}>
                                    <SelectLabel>
                                      {SEMANTIC_KIND_LABEL[group.kind]}
                                    </SelectLabel>
                                    {group.items.map((semantic) => (
                                      <SelectItem key={semantic} value={semantic}>
                                        {FORM_COLUMN_SEMANTIC_LABEL[semantic]}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {SEMANTIC_KIND_HINT[
                                kindOfSemantic(column.semanticKey)
                              ]}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={column.dataType}
                              disabled={dataTypeOptions.length === 1}
                              onValueChange={(value) =>
                                patchColumn(column.id, {
                                  dataType: value as FormColumnDataType,
                                  // Chỉ cột số mới giới hạn theo nhóm điểm và
                                  // tự tính được.
                                  ...(value === "number"
                                    ? {}
                                    : {
                                      rangeFromColumnKey: null,
                                      autoValue: null,
                                    }),
                                })
                              }
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {dataTypeOptions.map((type) => (
                                  <SelectItem key={type} value={type}>
                                    {FORM_COLUMN_DATA_TYPE_LABEL[type]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {/* Nói rõ cột lấy giá trị ở danh mục nào, để người
                                cấu hình biết lúc nhập sẽ ra dropdown gì. */}
                            {catalogOfSemantic(column.semanticKey) ? (
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                Nguồn:{" "}
                                {
                                  CATALOG_LABEL[
                                  catalogOfSemantic(column.semanticKey)!
                                  ]
                                }
                              </p>
                            ) : null}

                            {/* Cột điểm ăn theo dải của nhóm điểm nào - phải
                                chỉ đích danh vì mẫu có thể có nhiều cột nhóm điểm. */}
                            {column.dataType === "number" &&
                              scoreColumns.length > 0 ? (
                              <Select
                                value={column.rangeFromColumnKey || NO_RANGE}
                                onValueChange={(value) =>
                                  patchColumn(column.id, {
                                    rangeFromColumnKey:
                                      value === NO_RANGE ? null : value,
                                  })
                                }
                              >
                                <SelectTrigger className="mt-1 h-7 text-[11px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NO_RANGE}>
                                    Không giới hạn điểm
                                  </SelectItem>
                                  {scoreColumns.map((item) => (
                                    <SelectItem key={item.key} value={item.key}>
                                      Theo &quot;{item.title}&quot;
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : null}

                            {/* Ô tự tính: trỏ đích danh cột phần trăm và cột
                                điểm gốc. Không suy theo nhóm header - nhóm chỉ
                                dùng để đoán giá trị mặc định bên dưới. */}
                            {column.dataType === "number" &&
                              qualityColumns.length > 0 &&
                              baseColumns.some(
                                (item) => item.key !== column.key,
                              ) ? (
                              <div className="mt-1 space-y-1">
                                <Select
                                  value={
                                    column.autoValue ? AUTO_PERCENT : MANUAL_VALUE
                                  }
                                  onValueChange={(value) => {
                                    if (value === MANUAL_VALUE) {
                                      patchColumn(column.id, { autoValue: null });
                                      return;
                                    }
                                    const percent = suggestPercentColumn(
                                      column,
                                      qualityColumns,
                                    );
                                    const base = baseColumns.find(
                                      (item) => item.key !== column.key,
                                    );
                                    if (!percent || !base) return;
                                    patchColumn(column.id, {
                                      autoValue: {
                                        kind: "percent_of",
                                        percentColumnKey: percent.key,
                                        baseColumnKey: base.key,
                                      },
                                    });
                                  }}
                                >
                                  <SelectTrigger className="h-7 text-[11px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value={MANUAL_VALUE}>
                                      Người nhập tự gõ
                                    </SelectItem>
                                    <SelectItem value={AUTO_PERCENT}>
                                      Tự tính = % × điểm
                                    </SelectItem>
                                  </SelectContent>
                                </Select>

                                {column.autoValue ? (
                                  <>
                                    <Select
                                      value={column.autoValue.percentColumnKey}
                                      onValueChange={(value) =>
                                        patchColumn(column.id, {
                                          autoValue: {
                                            ...(column.autoValue as FormColumnAutoValue),
                                            percentColumnKey: value,
                                          },
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {qualityColumns.map((item) => (
                                          <SelectItem
                                            key={item.key}
                                            value={item.key}
                                          >
                                            % từ &quot;{item.title}&quot;
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Select
                                      value={column.autoValue.baseColumnKey}
                                      onValueChange={(value) =>
                                        patchColumn(column.id, {
                                          autoValue: {
                                            ...(column.autoValue as FormColumnAutoValue),
                                            baseColumnKey: value,
                                          },
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-[11px]">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {baseColumns
                                          .filter(
                                            (item) => item.key !== column.key,
                                          )
                                          .map((item) => (
                                            <SelectItem
                                              key={item.key}
                                              value={item.key}
                                            >
                                              × &quot;{item.title}&quot;
                                            </SelectItem>
                                          ))}
                                      </SelectContent>
                                    </Select>
                                  </>
                                ) : null}
                              </div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={groupValue}
                              onValueChange={(value) => {
                                const found = flatGroups.find(
                                  (item) => item.id === value,
                                );
                                patchColumn(column.id, {
                                  headerPath: found ? found.path : [],
                                });
                              }}
                            >
                              <SelectTrigger className="h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_GROUP}>
                                  (Không gộp)
                                </SelectItem>
                                {flatGroups.map((group) => (
                                  <SelectItem key={group.id} value={group.id}>
                                    {"- ".repeat(group.depth)}
                                    {group.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-8"
                              type="number"
                              min={40}
                              value={column.width}
                              onChange={(e) =>
                                patchColumn(column.id, {
                                  width: Number(e.target.value),
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={column.visible}
                              onCheckedChange={(checked) =>
                                patchColumn(column.id, {
                                  visible: checked === true,
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Checkbox
                              checked={column.required}
                              onCheckedChange={(checked) =>
                                patchColumn(column.id, {
                                  required: checked === true,
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                setColumns((prev) =>
                                  prev.filter((item) => item.id !== column.id),
                                )
                              }
                              aria-label="Xoá cột"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">
                  Công thức ba dòng cuối bảng
                </h3>
                <p className="text-xs text-muted-foreground">
                  Bảng của mỗi trục sẽ có thêm dòng &quot;Tổng từng cột&quot;,
                  &quot;Tổng điểm trục&quot; và &quot;Điểm quy đổi&quot;. Điểm
                  tối đa để nhân ra điểm quy đổi đặt ở từng trục, mục Trục.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="tpl-footer-on" className="text-sm">
                  Bật
                </Label>
                <Switch
                  id="tpl-footer-on"
                  checked={footer.enabled}
                  onCheckedChange={(enabled) => patchFooter({ enabled })}
                />
              </div>
            </div>

            {!footer.enabled ? null : numericColumns.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                Mẫu chưa có cột nào quy ra số được. Công thức nhận cột kiểu Số,
                cột Nhóm điểm (lấy điểm tối đa của nhóm) và cột Chất lượng thực
                hiện (lấy phần trăm của mức).
              </p>
            ) : (
              <div className="space-y-4">
                {/*
                  Kiểu tính phải chọn TRƯỚC: chọn cộng dồn thì chẳng còn mẫu số
                  nào để khai, hỏi tiếp cột mẫu số chỉ tổ gây hiểu nhầm.
                */}
                <div className="grid gap-2 sm:max-w-md">
                  <Label>Cách tính điểm trục</Label>
                  <Select
                    value={mode}
                    onValueChange={(value) =>
                      patchFooter({ mode: value as FormFooterMode })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORM_FOOTER_MODES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {FORM_FOOTER_MODE_LABEL[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {mode === "sum"
                      ? "Cộng thẳng điểm các cột đã khai rồi chặn ở điểm tối đa của trục. Dùng cho trục chấm theo mục Đạt / Không đạt, mỗi mục một điểm chuẩn riêng."
                      : "Chia tổng tử số cho tổng mẫu số rồi nhân điểm tối đa của trục. Dùng cho trục chấm theo tỉ lệ hoàn thành."}
                  </p>
                </div>

                {mode === "sum" ? null : (
                <div className="grid gap-2 sm:max-w-md">
                  <Label>
                    Cột mẫu số (A) <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={liveFooter.baseColumnKey ?? NO_COLUMN}
                    onValueChange={(value) =>
                      patchFooter({
                        baseColumnKey: value === NO_COLUMN ? null : value,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn cột" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_COLUMN}>Chưa chọn</SelectItem>
                      {numericColumns.map((column) => (
                        <SelectItem key={column.id} value={column.key}>
                          {formulaColumnLabel(column)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Thường là cột Điểm chuẩn - mọi tỉ lệ đều chia cho tổng cột
                    này. Cột Điểm chuẩn gán Nhóm điểm thì lấy điểm tối đa của
                    nhóm được chọn ở từng dòng.
                  </p>
                </div>
                )}

                <div className="space-y-2">
                  <Label>
                    {mode === "sum" ? "Các cột điểm đem cộng" : "Các cột tử số"}{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  {footer.ratioColumnKeys.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Chưa có cột tử số nào.
                    </p>
                  ) : null}
                  {footer.ratioColumnKeys.map((key, index) => (
                    <div
                      key={`ratio-${index}`}
                      className="flex items-center gap-2 sm:max-w-md"
                    >
                      <Badge variant="outline" className="w-8 justify-center">
                        {formulaRoleLabel(index)}
                      </Badge>
                      <Select
                        value={numericKeys.has(key) ? key : NO_COLUMN}
                        onValueChange={(value) =>
                          setRatioColumn(index, value === NO_COLUMN ? "" : value)
                        }
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Chọn cột" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_COLUMN}>Chưa chọn</SelectItem>
                          {numericColumns.map((column) => (
                            <SelectItem key={column.id} value={column.key}>
                              {formulaColumnLabel(column)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeRatioColumn(index)}
                        aria-label={`Bỏ cột tử số ${formulaRoleLabel(index)}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      patchFooter({
                        ratioColumnKeys: [...footer.ratioColumnKeys, ""],
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                    Thêm cột tử số
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Tử số phải cùng đơn vị với mẫu số thì tỉ lệ mới nằm trong
                    khoảng 0-1. Mẫu số là điểm mà tử số lấy cột phần trăm thì tỉ
                    lệ sẽ vọt lên hàng chục - xem khung công thức bên dưới để
                    kiểm tra bằng số thật.
                  </p>
                </div>

                <div className="whitespace-pre-line rounded-md bg-muted p-3 font-mono text-xs">
                  {formulaPreview(liveFooter, columns)}
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">Xem trước header</h3>
            {preview ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    {preview.rows.map((row, rowIdx) => (
                      <tr key={`row-${rowIdx}`}>
                        {row.map((cell) => (
                          <th
                            key={cell.key}
                            colSpan={cell.colSpan}
                            rowSpan={cell.rowSpan}
                            style={{ minWidth: cell.minWidth }}
                            className={cn(
                              "border bg-muted/50 px-2 py-1.5 text-center align-middle text-xs font-medium",
                            )}
                          >
                            {cell.label}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Chưa có cột nào đang hiển thị.
              </p>
            )}
          </section>
        </div>

        <SheetFooter className="flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="font-normal">
              {columns.filter((item) => item.visible).length} cột hiển thị
            </Badge>
            <Badge variant="outline" className="font-normal">
              {axisIds.length} trục áp dụng
            </Badge>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Hủy
            </Button>
            <Button type="button" onClick={submit} disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu mẫu bảng"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
