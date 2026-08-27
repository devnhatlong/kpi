"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { buildHeaderRows } from "@/features/mission-form-config/form-template-utils";
import {
  catalogOfSemantic,
  criterionScoreError,
  type FormHeaderGroup,
  type FormTemplateColumn,
} from "@/features/mission-form-config/types";
import { AutoGrowTextarea } from "@/features/personal-mission/components/auto-grow-textarea";
import { CatalogSelectCell } from "@/features/personal-mission/components/catalog-select-cell";
import { cn } from "@/lib/utils";

/** Chữ hiện ra cho một ô - ô tích thành Có / Không. */
function cellText(
  column: FormTemplateColumn,
  value: string | number | boolean | undefined,
): string {
  if (column.dataType === "boolean") return value === true ? "Có" : "";
  return String(value ?? "").trim();
}

/**
 * Số cán bộ tự chấm, bày ngay dưới ô chỉ huy đang sửa - chỉ hiện khi hai số
 * KHÁC nhau. Hiện cả khi giống nhau thì sáu dòng đầy chữ thừa và mắt không còn
 * bắt được chỗ nào thật sự bị sửa.
 */
function SelfHint({
  column,
  row,
  self,
}: {
  column: FormTemplateColumn;
  row: CriteriaRow;
  self?: Record<string, string | number | boolean>;
}) {
  if (!self) return null;
  const mine = cellText(column, self[column.key]);
  if (!mine || mine === cellText(column, row.fieldValues[column.key])) {
    return null;
  }
  return (
    <p className="mt-0.5 text-center text-[11px] text-muted-foreground">
      Tự chấm: {mine}
    </p>
  );
}

/** Một dòng của bảng A: tiêu chí (bất biến) + giá trị các ô theo khoá cột. */
export type CriteriaRow = {
  criterionId: string;
  criterionName: string;
  /** Ghi chú admin khai sẵn ở danh mục - cột `criterion_note` đọc nó. */
  criterionNote: string;
  maxScore: number;
  fieldValues: Record<string, string | number | boolean>;
  catalogValues: Record<string, { id: string; name: string }>;
};

export type CriteriaRowPatch = Partial<
  Pick<CriteriaRow, "fieldValues" | "catalogValues">
>;

/** Kiểu ô ngày giờ dùng đúng input gốc của trình duyệt. */
const DATE_INPUT_TYPE: Partial<Record<FormTemplateColumn["dataType"], string>> =
  {
    date: "date",
    time: "time",
    datetime: "datetime-local",
  };

/**
 * Trần điểm của một ô: cột số khai `rangeFromColumnKey` trỏ vào cột Điểm tối đa
 * (tiêu chí) thì lấy điểm tối đa của CHÍNH dòng đó. Không trỏ thì không chặn.
 */
function capOf(
  column: FormTemplateColumn,
  columns: FormTemplateColumn[],
  row: CriteriaRow,
): number | null {
  if (column.dataType !== "number" || !column.rangeFromColumnKey) return null;
  const source = columns.find((item) => item.key === column.rangeFromColumnKey);
  return source?.semanticKey === "criterion_max_score" ? row.maxScore : null;
}

type CriteriaTableProps = {
  /** Bộ cột của mẫu `forCriteria` - đã lọc `visible` hay chưa đều được. */
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  rows: CriteriaRow[];
  disabled?: boolean;
  /**
   * Số cán bộ tự chấm: `criterionId` -> khoá cột -> giá trị.
   *
   * Chỉ truyền ở màn chỉ huy chấm lại: ô nào lệch thì bày số cũ ngay dưới ô
   * đang sửa, khỏi phải mở hai bảng cạnh nhau mới biết mình vừa hạ điểm gì.
   */
  selfValues?: Record<string, Record<string, string | number | boolean>>;
  onChange: (criterionId: string, patch: CriteriaRowPatch) => void;
};

/**
 * Bảng khối A, dựng HOÀN TOÀN theo mẫu `forCriteria`.
 *
 * Dòng là 6 tiêu chí của danh mục - cố định, không thêm bớt được. Cột thì do
 * mẫu quyết định: thứ tự, nhãn, kiểu dữ liệu, ẩn/hiện, độ rộng, nhóm header gộp
 * ô đều đọc từ mẫu. Ô có ánh xạ tiêu chí (`criterion`, `criterion_note`,
 * `criterion_max_score`, `stt`) là ô chỉ đọc - giá trị lấy từ danh mục, người
 * chấm không gõ lại.
 */
export function CriteriaTable({
  columns,
  headerGroups,
  rows,
  disabled = false,
  selfValues,
  onChange,
}: CriteriaTableProps) {
  const visible = columns.filter((column) => column.visible);
  const header = buildHeaderRows(columns, headerGroups);

  if (!visible.length || !header) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Mẫu của khối A chưa có cột nào đang hiển thị - cấu hình ở mục Mẫu báo
        cáo nhiệm vụ.
      </p>
    );
  }

  const setField = (
    row: CriteriaRow,
    key: string,
    value: string | number | boolean,
  ) =>
    onChange(row.criterionId, {
      fieldValues: { ...row.fieldValues, [key]: value },
    });

  /*
    Mọi ô tích của một dòng là MỘT nhóm loại trừ: "Đảm bảo" và "Không đảm bảo"
    là hai nửa của cùng một kết luận, tích cả hai thì dòng đó không đọc ra được
    gì. Tích ô đang tích thì bỏ tích - quay về "chưa đánh giá", vì bảng cho phép
    để trống cả hai.

    Gom theo KIỂU CỘT chứ không theo tên: bảng A do admin thiết kế, không có
    semanticKey nào đánh dấu cặp này. Nếu sau này khối A cần một ô tích độc lập
    (kiểu "có minh chứng") thì phải sửa đúng chỗ này.
  */
  const flagKeys = columns
    .filter((column) => column.dataType === "boolean")
    .map((column) => column.key);

  const setFlag = (row: CriteriaRow, key: string, checked: boolean) => {
    const fieldValues = { ...row.fieldValues };
    for (const other of flagKeys) delete fieldValues[other];
    if (checked) fieldValues[key] = true;
    onChange(row.criterionId, { fieldValues });
  };

  const renderCell = (
    column: FormTemplateColumn,
    row: CriteriaRow,
    index: number,
  ) => {
    switch (column.semanticKey) {
      case "stt":
        return (
          <span className="text-muted-foreground tabular-nums">
            {index + 1}
          </span>
        );
      // Ba ô dưới đọc thẳng từ danh mục tiêu chí - đây là phần admin khai sẵn,
      // người chấm chỉ nhìn.
      case "criterion":
        return <span>{row.criterionName}</span>;
      case "criterion_note":
        return (
          <span className="text-xs text-muted-foreground">
            {row.criterionNote}
          </span>
        );
      case "criterion_max_score":
        return <span className="tabular-nums">{row.maxScore}</span>;
      default:
        break;
    }

    const catalog = catalogOfSemantic(column.semanticKey);
    if (catalog) {
      return (
        <CatalogSelectCell
          catalog={catalog}
          value={row.catalogValues[column.key]?.id ?? ""}
          disabled={disabled}
          onValueChange={() => {}}
          onPick={(id, name) =>
            onChange(row.criterionId, {
              catalogValues: {
                ...row.catalogValues,
                [column.key]: { id, name },
              },
            })
          }
        />
      );
    }

    if (column.dataType === "boolean") {
      return (
        <Checkbox
          checked={row.fieldValues[column.key] === true}
          disabled={disabled}
          aria-label={column.title}
          onCheckedChange={(checked) =>
            setFlag(row, column.key, checked === true)
          }
        />
      );
    }

    if (column.dataType === "file") {
      // Bảng A chưa có đường đính kèm tệp - nói thẳng thay vì bày một ô chết.
      return (
        <span className="text-xs text-muted-foreground">
          Chưa hỗ trợ tệp ở khối A
        </span>
      );
    }

    const raw = String(row.fieldValues[column.key] ?? "");

    if (column.dataType === "number") {
      const cap = capOf(column, columns, row);
      const problem = cap === null ? null : criterionScoreError(raw, cap);
      return (
        <>
          <Input
            className={cn(
              "h-8 text-center tabular-nums",
              problem && "border-destructive focus-visible:ring-destructive",
            )}
            inputMode="decimal"
            aria-invalid={!!problem}
            title={problem ?? undefined}
            disabled={disabled}
            value={raw}
            onChange={(e) => setField(row, column.key, e.target.value)}
            placeholder="-"
          />
          {problem ? (
            <p className="mt-0.5 text-center text-[11px] text-destructive">
              {problem}
            </p>
          ) : null}
        </>
      );
    }

    // Cột chữ cho nở nhiều dòng, y như ô "Nhiệm vụ" của thẻ nhập: ghi chú tồn
    // tại - hạn chế thường dài, ô một dòng thì gõ tới đâu chữ trôi tới đó.
    // Ngày / giờ luôn ngắn nên vẫn để một dòng.
    if (column.dataType === "text") {
      return (
        <AutoGrowTextarea
          value={raw}
          disabled={disabled}
          onChange={(e) => setField(row, column.key, e.target.value)}
          placeholder={column.title}
        />
      );
    }

    return (
      <Input
        className="h-8"
        type={DATE_INPUT_TYPE[column.dataType] ?? "text"}
        disabled={disabled}
        value={raw}
        onChange={(e) => setField(row, column.key, e.target.value)}
        placeholder={column.title}
      />
    );
  };

  /** Tổng từng cột số - đúng dòng "Tổng điểm" cuối bảng của bản in. */
  const columnTotal = (column: FormTemplateColumn): number | null => {
    if (column.dataType !== "number") return null;
    if (column.semanticKey === "criterion_max_score") {
      return rows.reduce((sum, row) => sum + row.maxScore, 0);
    }
    return rows.reduce((sum, row) => {
      const text = String(row.fieldValues[column.key] ?? "").trim();
      const value = Number(text.replace(",", "."));
      return sum + (text && Number.isFinite(value) ? value : 0);
    }, 0);
  };

  const hasTotals = visible.some((column) => column.dataType === "number");

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          {header.rows.map((headerRow, rowIdx) => (
            <tr key={`head-${rowIdx}`}>
              {headerRow.map((cell) => (
                <th
                  key={cell.key}
                  colSpan={cell.colSpan}
                  rowSpan={cell.rowSpan}
                  style={{ minWidth: cell.minWidth }}
                  className="border-b border-r bg-muted/60 px-2 py-2 text-center align-middle text-xs font-semibold last:border-r-0"
                >
                  {cell.label}
                  {cell.required ? (
                    <span className="text-destructive"> *</span>
                  ) : null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.criterionId} className="border-b last:border-b-0">
              {visible.map((column) => (
                <td
                  key={column.id}
                  style={{ minWidth: column.width }}
                  className="border-r px-2 py-1.5 align-top last:border-r-0"
                >
                  {renderCell(column, row, index)}
                  <SelfHint
                    column={column}
                    row={row}
                    self={selfValues?.[row.criterionId]}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hasTotals ? (
          <tfoot>
            <tr className="bg-muted/40 font-semibold">
              {visible.map((column, index) => {
                const total = columnTotal(column);
                return (
                  <td
                    key={column.id}
                    className="border-r px-2 py-2 text-center tabular-nums last:border-r-0"
                  >
                    {index === 0 && total === null
                      ? "Tổng điểm"
                      : (total ?? "")}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
