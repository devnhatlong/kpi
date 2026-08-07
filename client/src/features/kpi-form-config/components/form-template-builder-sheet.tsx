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
  SelectItem,
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
  createDefaultTemplateDraft,
  entityId,
  FORM_COLUMN_DATA_TYPE_LABEL,
  FORM_COLUMN_SEMANTIC_LABEL,
  FORM_COLUMN_SEMANTICS,
  localId,
  missingScoringSemantics,
  SEMANTIC_DATA_TYPE,
  type FormColumnDataType,
  type FormColumnSemantic,
  type FormHeaderGroup,
  type FormTemplate,
  type FormTemplateColumn,
} from "@/features/kpi-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NO_GROUP = "__none__";

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
    } else {
      // Bảng trắng: tự dựng cột từ đầu. Ngược lại điền sẵn bộ cột mặc định.
      const draft = startBlank
        ? { headerGroups: [], columns: [] }
        : createDefaultTemplateDraft();
      setName("");
      setDescription("");
      setSortOrder("0");
      setIsActive(true);
      setAxisIds([]);
      setHeaderGroups(draft.headerGroups);
      setColumns(draft.columns);
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

  /** Semantic đã dùng ở cột khác - chặn gán trùng ngay trên UI. */
  const usedSemantics = useMemo(() => {
    const map = new Map<FormColumnSemantic, string>();
    for (const column of columns) {
      if (column.semanticKey === "custom") continue;
      if (!map.has(column.semanticKey)) map.set(column.semanticKey, column.id);
    }
    return map;
  }, [columns]);

  const missingScoring = missingScoringSemantics(
    new Set(usedSemantics.keys()),
  );

  const patchColumn = (id: string, patch: Partial<FormTemplateColumn>) => {
    setColumns((prev) =>
      prev.map((column) =>
        column.id === id ? { ...column, ...patch } : column,
      ),
    );
  };

  const changeSemantic = (
    column: FormTemplateColumn,
    semanticKey: FormColumnSemantic,
  ) => {
    const owner = usedSemantics.get(semanticKey);
    if (semanticKey !== "custom" && owner && owner !== column.id) {
      toast.error("Ý nghĩa này đã gán cho cột khác.");
      return;
    }
    // Giữ kiểu dữ liệu admin đã chọn nếu ý nghĩa mới vẫn cho phép.
    const allowed = allowedDataTypes(semanticKey);
    patchColumn(column.id, {
      semanticKey,
      // Khoá lưu dữ liệu bám theo ý nghĩa; cột tự do sinh khoá riêng.
      key: semanticKey === "custom" ? localId("field") : semanticKey,
      dataType: allowed.includes(column.dataType)
        ? column.dataType
        : (SEMANTIC_DATA_TYPE[semanticKey] ?? allowed[0] ?? "text"),
      title: column.title || FORM_COLUMN_SEMANTIC_LABEL[semanticKey],
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
    if (!usedSemantics.has("task_title")) {
      toast.error('Mẫu bảng phải có một cột mang ý nghĩa "Nhiệm vụ".');
      return;
    }

    const sortOrderNum = Number(sortOrder);
    if (!Number.isFinite(sortOrderNum) || sortOrderNum < 0) {
      toast.error("Thứ tự hiển thị không hợp lệ.");
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      columns: columns.map((column) => ({
        ...column,
        title: column.title.trim(),
        width: Number.isFinite(column.width) ? column.width : 160,
      })),
      headerGroups,
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

            {columns.length && missingScoring.length ? (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                Thiếu cột chấm điểm:{" "}
                {missingScoring
                  .map((item) => FORM_COLUMN_SEMANTIC_LABEL[item])
                  .join(", ")}
                . Báo cáo theo mẫu này sẽ không có dữ liệu đó khi duyệt và thống
                kê.
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[1100px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Thứ tự</TableHead>
                    <TableHead className="min-w-[200px]">Tiêu đề cột</TableHead>
                    <TableHead className="w-[190px]">Ý nghĩa</TableHead>
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
                                {FORM_COLUMN_SEMANTICS.map((semantic) => {
                                  const owner = usedSemantics.get(semantic);
                                  return (
                                    <SelectItem
                                      key={semantic}
                                      value={semantic}
                                      disabled={
                                        semantic !== "custom" &&
                                        !!owner &&
                                        owner !== column.id
                                      }
                                    >
                                      {FORM_COLUMN_SEMANTIC_LABEL[semantic]}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={column.dataType}
                              disabled={dataTypeOptions.length === 1}
                              onValueChange={(value) =>
                                patchColumn(column.id, {
                                  dataType: value as FormColumnDataType,
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
                                    {"— ".repeat(group.depth)}
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
