"use client";

import { useMemo, useState } from "react";
import { CheckCheck, Info, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  flattenHeaderGroups,
  type ResolvedTemplate,
} from "@/features/kpi-form-config/form-template-utils";
import {
  catalogOfSemantic,
  computeAutoValue,
  type FormTemplateColumn,
} from "@/features/kpi-form-config/types";
import { useQualityLevelMap } from "@/features/kpi-form-config/use-quality-levels";
import { useScoreGroupMap } from "@/features/kpi-form-config/use-score-groups";
import { scorePersonalKpi } from "@/features/personal-kpi/api";
import { formatScoreNumber } from "@/features/personal-kpi/board-cell";
import { CatalogSelectCell } from "@/features/personal-kpi/components/catalog-select-cell";
import { DeltaTag } from "@/features/personal-kpi/components/score-delta-tag";
import {
  gapSuffix,
  groupColumnsOf,
  numberOfValue,
  selfValue,
  showValue,
  type CatalogMaps,
} from "@/features/personal-kpi/review-scores";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import {
  scoreColumns,
  type ScoreColumns,
  type ScoreEntry,
} from "@/features/personal-kpi/task-summary";
import type { PersonalKpiItem } from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * Nhận xét soạn sẵn. Câu đầu là mặc định điền vào ô - phần lớn nhiệm vụ được
 * chốt là đạt yêu cầu, để trống thì người duyệt hay bỏ qua luôn phần nhận xét.
 */
const NOTE_PRESETS = [
  "Nhiệm vụ hoàn thành đúng yêu cầu, đồng ý chốt điểm như trên.",
  "Hoàn thành nhưng còn chậm tiến độ, rút kinh nghiệm cho nhiệm vụ sau.",
  "Chất lượng sản phẩm chưa cao, cần bổ sung hoàn thiện ở nhiệm vụ tiếp theo.",
];

type ScoreFormProps = {
  item: PersonalKpiItem;
  columns: ScoreColumns;
  /** Mọi cột hiển thị của mẫu - cần để lấy đủ cột trong một nhóm. */
  templateColumns: FormTemplateColumn[];
  /** Tên nhóm header của từng cột - dòng tiêu đề gộp của bảng. */
  groupLabel: (entry: ScoreEntry) => string;
  progressPercent: number | null;
  onDone: () => void;
  onScored: () => void | Promise<void>;
};

function ScoreForm({
  item,
  columns,
  templateColumns,
  groupLabel,
  progressPercent,
  onDone,
  onScored,
}: ScoreFormProps) {
  const scoreGroupById = useScoreGroupMap();
  const qualityLevelById = useQualityLevelMap();
  const maps: CatalogMaps = { qualityLevelById, scoreGroupById };

  const entryColumns = (entry: ScoreEntry): FormTemplateColumn[] =>
    groupColumnsOf(entry, templateColumns);

  /** Ô chỉ huy gõ được: cột trong công thức, trừ cột hệ thống tự tính. */
  const isEditable = (entry: ScoreEntry, column: FormTemplateColumn) =>
    !column.autoValue &&
    (column.key === entry.score.key || column.key === entry.percent?.key);
  /**
   * Mở ra là đổ sẵn số cán bộ tự chấm: phần lớn trường hợp chỉ huy đồng ý, chỉ
   * sửa ô nào thấy chưa đúng. Bắt gõ lại từ đầu là mời người ta gõ bừa.
   */
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const entry of columns.entries) {
      for (const column of entryColumns(entry)) {
        seed[column.key] =
          item.reviewValues[column.key] ||
          item.reviewCatalogValues[column.key] ||
          selfValue(item, column);
      }
    }
    return seed;
  });
  const [note, setNote] = useState(item.reviewNote || NOTE_PRESETS[0]!);
  const [saving, setSaving] = useState(false);

  const show = (column: FormTemplateColumn, raw: string) =>
    showValue(column, raw, maps);
  const numberOf = (column: FormTemplateColumn, raw: string) =>
    numberOfValue(column, raw, maps);

  /**
   * Chênh lệch giữa số chỉ huy đang gõ và số cán bộ tự chấm.
   * null = không so được (một trong hai ô trống, hoặc không ra số).
   */
  const deltaOf = (column: FormTemplateColumn): number | null => {
    const self = numberOf(column, selfValue(item, column));
    const scored = numberOf(column, values[column.key] ?? "");
    if (self === null || scored === null || self === scored) return null;
    return scored - self;
  };

  /** Phần trăm của một ô, để tính trước giá trị cột tự tính. */
  const percentOf = (key: string): number | null => {
    const column = templateColumns.find((entry) => entry.key === key);
    if (!column) return null;
    return numberOf(column, values[key] ?? selfValue(item, column));
  };

  /**
   * Giá trị cột tự tính theo số chỉ huy đang gõ - hiện trước cho thấy điểm nhảy
   * theo phần trăm. Con số lưu lại vẫn do server tính.
   */
  const autoValueOf = (column: FormTemplateColumn): number | null => {
    const auto = column.autoValue;
    if (!auto) return null;
    const base = Number(
      (values[auto.baseColumnKey] ??
        item.task.fieldValues?.[auto.baseColumnKey] ??
        "").replace(",", "."),
    );
    return computeAutoValue(
      auto.kind,
      percentOf(auto.percentColumnKey),
      Number.isFinite(base) ? base : null,
    );
  };

  /** Cột tự tính cũng phải nói được nó tụt bao nhiêu so với số cán bộ khai. */
  const autoDeltaOf = (column: FormTemplateColumn): number | null => {
    const computed = autoValueOf(column);
    const self = numberOf(column, selfValue(item, column));
    if (computed === null || self === null || computed === self) return null;
    return computed - self;
  };

  const submit = async () => {
    setSaving(true);
    try {
      await scorePersonalKpi(item.id, { values, note });
      await onScored();
      toast.success("Đã chấm điểm và chốt hoàn thành.");
      onDone();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không chấm điểm được."));
    } finally {
      setSaving(false);
    }
  };

  /** Hai bảng dùng chung một khung tiêu đề, chỉ khác phần thân. */
  const headerRows = (scoreTitle: (column: FormTemplateColumn) => string) => (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        {columns.entries.map((entry) => (
          <TableHead
            key={entry.score.id}
            colSpan={entryColumns(entry).length}
            className="border-l text-center font-medium first:border-l-0"
          >
            {groupLabel(entry)}
          </TableHead>
        ))}
      </TableRow>
      <TableRow className="hover:bg-transparent">
        {columns.entries.flatMap((entry) =>
          entryColumns(entry).map((column, index) => (
            <TableHead
              key={column.id}
              className={cn(
                "text-center text-xs font-normal",
                index === 0 && "border-l first:border-l-0",
              )}
            >
              {scoreTitle(column)}
            </TableHead>
          )),
        )}
      </TableRow>
    </TableHeader>
  );

  return (
    <>
      <div className="max-h-[68vh] space-y-4 overflow-y-auto px-1">
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border p-3",
            kpiTone.info.soft,
          )}
        >
          <Info className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {item.workContentName}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.ownerName ? `${item.ownerName} · ` : ""}
              {item.axisName}
              {columns.base
                ? ` · ${columns.base.title}: ${show(columns.base, selfValue(item, columns.base))}`
                : ""}
              {progressPercent === null
                ? ""
                : ` · Kết quả thực hiện: ${progressPercent}%`}
            </p>
          </div>
        </div>

        {/* Bảng 1: số cán bộ khai, chỉ để đối chiếu. */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Cán bộ tự chấm</p>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              {headerRows((column) => column.title)}
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  {columns.entries.flatMap((entry) =>
                    entryColumns(entry).map((column, index) => (
                      <TableCell
                        key={column.id}
                        className={cn(
                          "text-center text-base font-semibold",
                          index === 0 && "border-l first:border-l-0",
                        )}
                      >
                        {show(column, selfValue(item, column))}
                      </TableCell>
                    )),
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Bảng 2: số chỉ huy chấm - đây mới là số vào công thức. */}
        <div className="space-y-1.5">
          {/* div chứ không phải p: Badge render ra div, đặt trong p là HTML
              sai và React báo lỗi hydrate. */}
          <div className="flex items-center gap-2 text-sm font-medium">
            Chỉ huy chấm
            <Badge
              variant="secondary"
              className={cn("font-normal", kpiTone.warning.soft)}
            >
              bắt buộc
            </Badge>
          </div>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              {headerRows((column) => column.title)}
              <TableBody>
                <TableRow className="hover:bg-transparent">
                  {columns.entries.flatMap((entry) =>
                    entryColumns(entry).map((column, index) => {
                      const editable = isEditable(entry, column);
                      const catalog = catalogOfSemantic(column.semanticKey);
                      return (
                        <TableCell
                          key={column.id}
                          className={cn(
                            "align-top",
                            index === 0 && "border-l first:border-l-0",
                          )}
                        >
                          {!editable ? (
                            // Cột tự tính / cột ngoài công thức: chỉ hiện, số
                            // do hệ thống tính lại theo phần trăm vừa chấm.
                            <p className="py-2 text-center text-base font-semibold">
                              {column.autoValue
                                ? (() => {
                                    const computed = autoValueOf(column);
                                    return computed === null
                                      ? "-"
                                      : formatScoreNumber(computed);
                                  })()
                                : show(column, selfValue(item, column))}
                            </p>
                          ) : catalog ? (
                            <CatalogSelectCell
                              catalog={catalog}
                              value={values[column.key] ?? ""}
                              onValueChange={(next) =>
                                setValues((prev) => ({
                                  ...prev,
                                  [column.key]: next,
                                }))
                              }
                              disabled={saving}
                              triggerClassName="h-9 text-sm"
                            />
                          ) : (
                            <Input
                              className="h-9"
                              value={values[column.key] ?? ""}
                              onChange={(e) =>
                                setValues((prev) => ({
                                  ...prev,
                                  [column.key]: e.target.value,
                                }))
                              }
                              disabled={saving}
                              inputMode="decimal"
                            />
                          )}
                          <p className="mt-1 text-center text-xs text-muted-foreground">
                            {column.autoValue ? (
                              <>
                                Tự chấm: {show(column, selfValue(item, column))}
                                <DeltaTag
                                  gap={autoDeltaOf(column)}
                                  suffix=""
                                />
                              </>
                            ) : (
                              <>
                                Tự chấm: {show(column, selfValue(item, column))}
                                {/* Chênh lệch so với số cán bộ khai - đỏ là
                                    đang hạ điểm, xanh là nâng. */}
                                <DeltaTag
                                  gap={deltaOf(column)}
                                  suffix={gapSuffix(column)}
                                />
                              </>
                            )}
                          </p>
                        </TableCell>
                      );
                    }),
                  )}
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {/*
            Không cộng B + C thành "điểm của nhiệm vụ": công thức lấy TỔNG CỘT
            qua mọi nhiệm vụ của trục rồi mới chia, nên một dòng lẻ không có
            điểm riêng.
          */}
          <p className="text-xs text-muted-foreground">
            Số chấm ở đây thay số tự chấm khi tính điểm trục theo công thức đã
            cấu hình
            {columns.base ? ` (mẫu số: ${columns.base.title})` : ""}. Số cán bộ
            tự chấm vẫn được giữ lại để đối chiếu.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="review-note">Nhận xét của chỉ huy</Label>
          <Textarea
            id="review-note"
            className="min-h-[88px]"
            placeholder="Nhận xét, lưu ý cho cán bộ..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving}
          />
          {/* Mấy câu hay dùng - bấm là thay nội dung, vẫn sửa lại được. */}
          <div className="flex flex-wrap gap-1.5">
            {NOTE_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant="outline"
                className="h-auto whitespace-normal bg-background px-2 py-1 text-left text-xs font-normal"
                onClick={() => setNote(preset)}
                disabled={saving}
              >
                {preset}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="bg-background"
          onClick={onDone}
          disabled={saving}
        >
          Hủy
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={saving}>
          <CheckCheck className="h-4 w-4" />
          {saving ? "Đang lưu..." : "Chấm điểm & xác nhận hoàn thành"}
        </Button>
      </DialogFooter>
    </>
  );
}

type ReviewScoreDialogProps = {
  /** Đang mở hay không - tách khỏi `item` để lúc đóng vẫn còn nội dung mà vẽ. */
  open: boolean;
  /** Nhiệm vụ đang chấm. */
  item: PersonalKpiItem | null;
  template: ResolvedTemplate | null;
  /** KPI tiến độ hiện tại, hiện ở dòng tóm tắt. */
  progressPercent: number | null;
  onOpenChange: (open: boolean) => void;
  onScored: () => void | Promise<void>;
};

/**
 * Chỉ huy chấm điểm rồi chốt hoàn thành.
 *
 * Bảng dựng theo CẤU HÌNH CÔNG THỨC của mẫu: mỗi tử số (B, C...) là một nhóm
 * cột, tiêu đề gộp lấy đúng tên nhóm header trong mẫu. Mẫu đổi công thức thì
 * bảng đổi theo, không có cột nào viết cứng.
 */
export function ReviewScoreDialog({
  open,
  item,
  template,
  progressPercent,
  onOpenChange,
  onScored,
}: ReviewScoreDialogProps) {
  const shown = item;

  const columns = scoreColumns(template);

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of flattenHeaderGroups(template?.headerGroups ?? [])) {
      map.set(group.id, group.name);
    }
    return map;
  }, [template]);

  /** Tên nhóm header bọc cột điểm; cột đứng riêng thì lấy chính tên cột. */
  const groupLabel = (entry: ScoreEntry) => {
    const path = entry.score.headerPath ?? [];
    const names = path.map((id) => groupNameById.get(id)).filter(Boolean);
    return names.length ? names.join(" · ") : entry.score.title;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chỉ huy chấm điểm KPI</DialogTitle>
          <DialogDescription>
            Xác nhận hoàn thành và chốt điểm cho nhiệm vụ này.
          </DialogDescription>
        </DialogHeader>

        {!shown ? null : columns.entries.length === 0 ? (
          <>
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
              <p className="text-muted-foreground">
                Mẫu KPI của trục này chưa cấu hình công thức điểm nên chưa chấm
                được. Vào Cấu hình form KPI › Mẫu bảng KPI để khai cột mẫu số và
                các cột tử số.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Đóng
              </Button>
            </DialogFooter>
          </>
        ) : (
          <ScoreForm
            key={shown.id}
            item={shown}
            columns={columns}
            groupLabel={groupLabel}
            templateColumns={template?.columns ?? []}
            progressPercent={progressPercent}
            onDone={() => onOpenChange(false)}
            onScored={onScored}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
