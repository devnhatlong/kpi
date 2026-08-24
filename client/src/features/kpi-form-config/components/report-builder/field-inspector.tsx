"use client";

import { useMemo } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { flattenHeaderGroups } from "@/features/kpi-form-config/form-template-utils";
import {
  allowedDataTypes,
  CATALOG_LABEL,
  catalogOfSemantic,
  FORM_COLUMN_DATA_TYPE_LABEL,
  FORM_COLUMN_SEMANTIC_LABEL,
  kindOfSemantic,
  plainNumberColumns,
  qualityLevelColumns,
  rangeSourceColumns,
  SEMANTIC_KIND_HINT,
  SEMANTIC_KIND_LABEL,
  semanticsByKind,
  type FormColumnAutoValue,
  type FormColumnDataType,
  type FormColumnSemantic,
  type FormHeaderGroup,
  type FormTemplateColumn,
} from "@/features/kpi-form-config/types";

const NO_GROUP = "__none__";
const NO_RANGE = "__norange__";
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

type FieldInspectorProps = {
  column: FormTemplateColumn;
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  onPatch: (patch: Partial<FormTemplateColumn>) => void;
  onChangeSemantic: (semanticKey: FormColumnSemantic) => void;
  onRemove: () => void;
};

/**
 * Bảng thuộc tính của trường đang chọn trên canvas.
 *
 * Cùng bộ điều khiển như bản cũ dựng theo dòng bảng, chỉ khác chỗ đứng: mỗi lúc
 * chỉ cấu hình một trường nên có chỗ ghi rõ từng lựa chọn nghĩa là gì.
 */
export function FieldInspector({
  column,
  columns,
  headerGroups,
  onPatch,
  onChangeSemantic,
  onRemove,
}: FieldInspectorProps) {
  const flatGroups = useMemo(
    () => flattenHeaderGroups(headerGroups),
    [headerGroups],
  );
  const dataTypeOptions = allowedDataTypes(column.semanticKey);

  /** Cột làm trần điểm: Nhóm điểm (dải min-max) hoặc Điểm tối đa (tiêu chí). */
  const scoreColumns = useMemo(() => rangeSourceColumns(columns), [columns]);
  /** Hai nguồn của cột tự tính: phần trăm lấy ở đâu, điểm gốc lấy ở đâu. */
  const qualityColumns = useMemo(() => qualityLevelColumns(columns), [columns]);
  const baseColumns = useMemo(() => plainNumberColumns(columns), [columns]);
  const baseCandidates = baseColumns.filter((item) => item.key !== column.key);

  const groupValue = column.headerPath?.length
    ? column.headerPath[column.headerPath.length - 1]!
    : NO_GROUP;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h4 className="text-sm font-semibold">Thuộc tính trường</h4>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {column.key}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
          Xoá trường
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fi-title">
          Nhãn hiển thị <span className="text-destructive">*</span>
        </Label>
        <Input
          id="fi-title"
          value={column.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          placeholder="Tiêu đề cột trên bảng"
        />
      </div>

      <div className="space-y-2">
        <Label>Ánh xạ dữ liệu</Label>
        <Select
          value={column.semanticKey}
          onValueChange={(value) =>
            onChangeSemantic(value as FormColumnSemantic)
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* Gom theo kiểu ánh xạ để thấy ngay cột sẽ thành ô nhập, dropdown
                hay ô hệ thống tự điền. */}
            {semanticsByKind().map((group) => (
              <SelectGroup key={group.kind}>
                <SelectLabel>{SEMANTIC_KIND_LABEL[group.kind]}</SelectLabel>
                {group.items.map((semantic) => (
                  <SelectItem key={semantic} value={semantic}>
                    {FORM_COLUMN_SEMANTIC_LABEL[semantic]}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {SEMANTIC_KIND_HINT[kindOfSemantic(column.semanticKey)]}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Kiểu dữ liệu</Label>
          <Select
            value={column.dataType}
            disabled={dataTypeOptions.length === 1}
            onValueChange={(value) =>
              onPatch({
                dataType: value as FormColumnDataType,
                // Chỉ cột số mới giới hạn theo nhóm điểm và tự tính được.
                ...(value === "number"
                  ? {}
                  : { rangeFromColumnKey: null, autoValue: null }),
              })
            }
          >
            <SelectTrigger className="w-full">
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
          {catalogOfSemantic(column.semanticKey) ? (
            <p className="text-[11px] text-muted-foreground">
              Nguồn: {CATALOG_LABEL[catalogOfSemantic(column.semanticKey)!]}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="fi-width">Độ rộng cột (px)</Label>
          <Input
            id="fi-width"
            type="number"
            min={40}
            value={column.width}
            onChange={(e) => onPatch({ width: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Nhóm header (gộp ô)</Label>
        <Select
          value={groupValue}
          onValueChange={(value) => {
            const found = flatGroups.find((item) => item.id === value);
            onPatch({ headerPath: found ? found.path : [] });
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_GROUP}>(Không gộp)</SelectItem>
            {flatGroups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {"- ".repeat(group.depth)}
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {flatGroups.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Chưa có nhóm nào - tạo ở &quot;Xem cấu trúc trường&quot;.
          </p>
        ) : null}
      </div>

      {/* Cột điểm ăn theo trần của cột nào - phải chỉ đích danh vì mẫu có thể
          có nhiều cột nhóm điểm hoặc nhiều cột điểm tối đa. */}
      {column.dataType === "number" && scoreColumns.length > 0 ? (
        <div className="space-y-2">
          <Label>Giới hạn điểm</Label>
          <Select
            value={column.rangeFromColumnKey || NO_RANGE}
            onValueChange={(value) =>
              onPatch({
                rangeFromColumnKey: value === NO_RANGE ? null : value,
              })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_RANGE}>Không giới hạn điểm</SelectItem>
              {scoreColumns.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  Theo &quot;{item.title}&quot;
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {/* Ô tự tính: trỏ đích danh cột phần trăm và cột điểm gốc. Không suy theo
          nhóm header - nhóm chỉ dùng để đoán giá trị mặc định. */}
      {column.dataType === "number" &&
      qualityColumns.length > 0 &&
      baseCandidates.length > 0 ? (
        <div className="space-y-2 rounded-lg border p-3">
          <Label>Cách lấy giá trị</Label>
          <Select
            value={column.autoValue ? AUTO_PERCENT : MANUAL_VALUE}
            onValueChange={(value) => {
              if (value === MANUAL_VALUE) {
                onPatch({ autoValue: null });
                return;
              }
              const percent = suggestPercentColumn(column, qualityColumns);
              const base = baseCandidates[0];
              if (!percent || !base) return;
              onPatch({
                autoValue: {
                  kind: "percent_of",
                  percentColumnKey: percent.key,
                  baseColumnKey: base.key,
                },
              });
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={MANUAL_VALUE}>Người nhập tự gõ</SelectItem>
              <SelectItem value={AUTO_PERCENT}>Tự tính = % × điểm</SelectItem>
            </SelectContent>
          </Select>

          {column.autoValue ? (
            <div className="grid gap-2">
              <Select
                value={column.autoValue.percentColumnKey}
                onValueChange={(value) =>
                  onPatch({
                    autoValue: {
                      ...(column.autoValue as FormColumnAutoValue),
                      percentColumnKey: value,
                    },
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {qualityColumns.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      % từ &quot;{item.title}&quot;
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={column.autoValue.baseColumnKey}
                onValueChange={(value) =>
                  onPatch({
                    autoValue: {
                      ...(column.autoValue as FormColumnAutoValue),
                      baseColumnKey: value,
                    },
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {baseCandidates.map((item) => (
                    <SelectItem key={item.key} value={item.key}>
                      × &quot;{item.title}&quot;
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex h-10 items-center justify-between rounded-lg border px-3">
          <Label htmlFor="fi-visible" className="text-sm font-normal">
            Hiện trên bảng
          </Label>
          <Switch
            id="fi-visible"
            checked={column.visible}
            onCheckedChange={(checked) => onPatch({ visible: checked })}
          />
        </div>
        <div className="flex h-10 items-center justify-between rounded-lg border px-3">
          <Label htmlFor="fi-required" className="text-sm font-normal">
            Bắt buộc nhập
          </Label>
          <Switch
            id="fi-required"
            checked={column.required}
            onCheckedChange={(checked) => onPatch({ required: checked })}
          />
        </div>
      </div>
    </div>
  );
}
