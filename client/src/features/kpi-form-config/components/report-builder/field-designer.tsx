"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ChevronRight,
  GripVertical,
  Hash,
  ListChecks,
  ListOrdered,
  ListTree,
  MousePointerClick,
  Paperclip,
  Percent,
  Plus,
  SlidersHorizontal,
  SquareCheck,
  StickyNote,
  Text,
  Trash2,
  Type,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldInspector } from "@/features/kpi-form-config/components/report-builder/field-inspector";
import {
  allowedDataTypes,
  columnFromPreset,
  FIELD_PRESET_GROUPS,
  FORM_COLUMN_DATA_TYPE_LABEL,
  FORM_COLUMN_SEMANTIC_LABEL,
  localId,
  SEMANTIC_DATA_TYPE,
  SEMANTIC_KIND_LABEL,
  type FieldPreset,
  type FormColumnSemantic,
  type FormHeaderGroup,
  type FormTemplateColumn,
} from "@/features/kpi-form-config/types";
import { cn } from "@/lib/utils";

/** Biểu tượng của từng mục thư viện trường - chỉ để nhận diện nhanh. */
const PRESET_ICON: Record<string, LucideIcon> = {
  short_text: Type,
  number: Hash,
  percent: Percent,
  date: CalendarDays,
  boolean: SquareCheck,
  file: Paperclip,
  work_content: ListTree,
  work_task: ListChecks,
  score_group: SlidersHorizontal,
  quality_level: Percent,
  criterion: ListChecks,
  work_content_note: StickyNote,
  criterion_note: StickyNote,
  stt: ListOrdered,
  criterion_max_score: Hash,
};

/** Thứ tự kéo thả trong danh sách - đánh số 01, 02… như trên bảng. */
function orderLabel(index: number): string {
  return String(index + 1).padStart(2, "0");
}

type DragItem =
  | { kind: "preset"; preset: FieldPreset }
  | { kind: "column"; id: string };

type FieldDesignerProps = {
  /** Nhãn khối đang thiết kế - "Trục 4 · Chỉ tiêu công tác hằng năm". */
  blockLabel: string;
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onColumnsChange: (columns: FormTemplateColumn[]) => void;
  onOpenRules: () => void;
  /** Điền sẵn bộ cột mặc định - chỉ hiện khi canvas còn trống. */
  onFillDefault: () => void;
};

/**
 * Canvas thiết kế bộ trường của một khối: thư viện trường bên trái, thứ tự cột
 * ở giữa, thuộc tính của trường đang chọn bên phải.
 *
 * Kéo thả dùng HTML5 drag-and-drop có sẵn của trình duyệt, không thêm thư viện:
 * máy đích cài offline nên mỗi dependency mới là một thứ phải mang theo.
 * Vẫn giữ nút lên/xuống cho bàn phím - kéo thả không dùng được bằng phím.
 */
export function FieldDesigner({
  blockLabel,
  columns,
  headerGroups,
  selectedId,
  onSelect,
  onColumnsChange,
  onOpenRules,
  onFillDefault,
}: FieldDesignerProps) {
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  /** Chỉ cho kéo khi đã bấm vào tay cầm - kéo trúng ô nhập thì mất chữ. */
  const [handleId, setHandleId] = useState<string | null>(null);

  const selected = useMemo(
    () => columns.find((column) => column.id === selectedId) ?? null,
    [columns, selectedId],
  );

  /**
   * Khoá cột phải là duy nhất trong mẫu (server chặn trùng khoá).
   * Một ánh xạ dùng được ở nhiều cột, nên cột thứ hai trở đi phải thêm hậu tố.
   */
  const uniqueKey = (base: string, ownId: string) => {
    const taken = new Set(
      columns.filter((item) => item.id !== ownId).map((item) => item.key),
    );
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  };

  const insertAt = (index: number, column: FormTemplateColumn) => {
    const next = [...columns];
    next.splice(index, 0, { ...column, key: uniqueKey(column.key, column.id) });
    onColumnsChange(next);
    onSelect(column.id);
  };

  const addPreset = (preset: FieldPreset) => {
    insertAt(columns.length, columnFromPreset(preset));
  };

  /**
   * `insertIndex` tính trên mảng CHƯA gỡ phần tử đang kéo - lùi một bậc khi kéo
   * xuống dưới, nếu không thì thả vào chính chỗ cũ lại nhảy thêm một ô.
   */
  const moveTo = (from: number, insertIndex: number) => {
    const next = [...columns];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(from < insertIndex ? insertIndex - 1 : insertIndex, 0, item);
    onColumnsChange(next);
  };

  const moveBy = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(target, 0, item);
    onColumnsChange(next);
  };

  const removeColumn = (id: string) => {
    onColumnsChange(columns.filter((column) => column.id !== id));
    if (selectedId === id) onSelect(null);
  };

  const patchColumn = (
    id: string,
    patch: Partial<FormTemplateColumn>,
  ) => {
    onColumnsChange(
      columns.map((column) =>
        column.id === id ? { ...column, ...patch } : column,
      ),
    );
  };

  const changeSemantic = (
    column: FormTemplateColumn,
    semanticKey: FormColumnSemantic,
  ) => {
    // Giữ kiểu dữ liệu đã chọn nếu ánh xạ mới vẫn cho phép.
    const allowed = allowedDataTypes(semanticKey);
    patchColumn(column.id, {
      semanticKey,
      // Cột tự do sinh khoá riêng; cột có ánh xạ lấy tên ánh xạ làm khoá.
      key:
        semanticKey === "custom"
          ? localId("field")
          : uniqueKey(semanticKey, column.id),
      dataType: allowed.includes(column.dataType)
        ? column.dataType
        : (SEMANTIC_DATA_TYPE[semanticKey] ?? allowed[0] ?? "text"),
      // Cột tự do không có tên gợi ý - lấy nhãn "Không ánh xạ" làm tiêu đề thì
      // vô nghĩa.
      title:
        semanticKey === "custom"
          ? column.title
          : column.title || FORM_COLUMN_SEMANTIC_LABEL[semanticKey],
    });
  };

  const endDrag = () => {
    setDrag(null);
    setOverIndex(null);
    setHandleId(null);
  };

  const dropAt = (index: number) => {
    if (!drag) return;
    if (drag.kind === "preset") {
      insertAt(index, columnFromPreset(drag.preset));
    } else {
      const from = columns.findIndex((column) => column.id === drag.id);
      if (from >= 0) moveTo(from, index);
    }
    endDrag();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[230px_minmax(0,1fr)_320px]">
      {/* THƯ VIỆN TRƯỜNG */}
      <aside className="space-y-3 rounded-xl border bg-card p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Thư viện trường
        </p>
        <div className="space-y-3">
          {FIELD_PRESET_GROUPS.map((group) => (
            <div key={group.kind} className="space-y-1">
              <p className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                {SEMANTIC_KIND_LABEL[group.kind]}
              </p>
              {group.items.map((preset) => {
                const Icon = PRESET_ICON[preset.id] ?? Text;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      // Firefox không khởi động thao tác kéo nếu dataTransfer
                      // rỗng - payload thật vẫn nằm ở state, đây chỉ là mồi.
                      e.dataTransfer.setData("text/plain", preset.id);
                      e.dataTransfer.effectAllowed = "copy";
                      setDrag({ kind: "preset", preset });
                    }}
                    onDragEnd={endDrag}
                    onClick={() => addPreset(preset)}
                    title={preset.hint}
                    className="group flex w-full cursor-grab items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-left text-sm transition-colors hover:border-border hover:bg-accent active:cursor-grabbing"
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {preset.label}
                    </span>
                    <Plus className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <p className="border-t pt-2 text-[11px] text-muted-foreground">
          Bấm để thêm vào cuối, hoặc kéo thả vào đúng vị trí muốn chèn.
        </p>
      </aside>

      {/* CANVAS THỨ TỰ CỘT */}
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <MousePointerClick className="size-3.5" />
            Kéo tay cầm để sắp xếp thứ tự hiển thị
          </span>
          <button
            type="button"
            onClick={onOpenRules}
            className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
          >
            Quy tắc tính điểm
            <ChevronRight className="size-3.5" />
          </button>
        </div>

        <div
          className="min-h-[220px] space-y-1.5 rounded-xl border border-dashed p-2"
          onDragOver={(e) => {
            e.preventDefault();
            // Rê ở khoảng trống dưới danh sách = chèn vào cuối.
            if (e.target === e.currentTarget) setOverIndex(columns.length);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dropAt(overIndex ?? columns.length);
          }}
        >
          {columns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Khối này chưa có trường nào. Bấm một mục ở thư viện bên trái, hoặc
                bắt đầu từ bộ cột dùng sẵn.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={onFillDefault}>
                <Plus className="size-4" />
                Điền bộ cột mặc định
              </Button>
            </div>
          ) : (
            columns.map((column, index) => {
              const active = column.id === selectedId;
              return (
                <div key={column.id}>
                  {overIndex === index && drag ? (
                    <div className="mx-1 mb-1.5 h-0.5 rounded-full bg-primary" />
                  ) : null}
                  <div
                    role="button"
                    tabIndex={0}
                    draggable={handleId === column.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", column.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDrag({ kind: "column", id: column.id });
                    }}
                    onDragEnd={endDrag}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOverIndex(index);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      dropAt(index);
                    }}
                    onClick={() => onSelect(column.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(column.id);
                      }
                    }}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg border bg-card px-2 py-2 text-sm transition-colors",
                      active
                        ? "border-primary/40 bg-primary/5 shadow-[inset_3px_0_0_0_var(--color-primary)]"
                        : "hover:border-border hover:bg-accent/40",
                    )}
                  >
                    <span
                      onMouseDown={() => setHandleId(column.id)}
                      onMouseUp={() => setHandleId(null)}
                      className="cursor-grab p-0.5 text-muted-foreground active:cursor-grabbing"
                      aria-hidden
                    >
                      <GripVertical className="size-4" />
                    </span>
                    <span className="w-6 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {orderLabel(index)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {column.title.trim() || (
                        <span className="text-muted-foreground">
                          (Chưa đặt nhãn)
                        </span>
                      )}
                    </span>
                    {!column.visible ? (
                      <Badge variant="outline" className="font-normal">
                        Ẩn
                      </Badge>
                    ) : null}
                    {column.required ? (
                      <span className="text-destructive" title="Bắt buộc nhập">
                        *
                      </span>
                    ) : null}
                    <Badge variant="secondary" className="shrink-0 font-normal">
                      {FORM_COLUMN_DATA_TYPE_LABEL[column.dataType]}
                    </Badge>
                    <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      {/* Kéo thả không dùng được bằng bàn phím - giữ hai nút này
                          để vẫn đổi được thứ tự. */}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBy(index, -1);
                        }}
                        aria-label={`Đưa "${column.title}" lên trên`}
                      >
                        <span aria-hidden>↑</span>
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        disabled={index === columns.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBy(index, 1);
                        }}
                        aria-label={`Đưa "${column.title}" xuống dưới`}
                      >
                        <span aria-hidden>↓</span>
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeColumn(column.id);
                        }}
                        aria-label={`Xoá trường "${column.title}"`}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          {overIndex === columns.length && drag && columns.length > 0 ? (
            <div className="mx-1 h-0.5 rounded-full bg-primary" />
          ) : null}
        </div>

        <p className="text-[11px] text-muted-foreground">
          Trường có vạch xanh bên trái là trường đang được chọn để cấu hình.
        </p>
      </div>

      {/* THUỘC TÍNH TRƯỜNG ĐANG CHỌN */}
      <aside className="rounded-xl border bg-card p-4 lg:col-span-2 xl:col-span-1">
        {selected ? (
          <FieldInspector
            key={selected.id}
            column={selected}
            columns={columns}
            headerGroups={headerGroups}
            onPatch={(patch) => patchColumn(selected.id, patch)}
            onChangeSemantic={(semanticKey) =>
              changeSemantic(selected, semanticKey)
            }
            onRemove={() => removeColumn(selected.id)}
          />
        ) : (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center">
            <SlidersHorizontal className="size-6 text-muted-foreground/50" />
            <p className="text-sm font-medium">Chưa chọn trường nào</p>
            <p className="text-xs text-muted-foreground">
              Bấm một trường ở danh sách giữa để sửa nhãn, ánh xạ dữ liệu và quy
              tắc của trường đó trong {blockLabel}.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
