"use client";

import { useState } from "react";
import {
  ChevronDown,
  ClipboardCheck,
  Loader2,
  Send,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  formatCriteriaPeriod,
  forwardPersonalKpi,
  reviewPersonalKpi,
  scorePersonalCriteriaSheet,
  type PersonalCriteriaSheetRecord,
  type PersonalKpiBoardCriteriaBlock,
  type SubmitPersonalKpiPayload,
} from "@/features/personal-kpi/api";
import {
  CriteriaTable,
  type CriteriaRow,
  type CriteriaRowPatch,
} from "@/features/personal-kpi/components/criteria-table";
import { SendRecipientDialog } from "@/features/personal-kpi/components/send-recipient-dialog";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import {
  PERSONAL_KPI_STATUS_LABEL,
  canCompletePersonalKpi,
  canReviewPersonalKpi,
} from "@/features/personal-kpi/types";
import { serverYmd } from "@/lib/server-time";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Tên người từ trường đã populate hoặc id trần. */
function personName(value: PersonalCriteriaSheetRecord["ownerId"]): string {
  if (!value || typeof value !== "object") return "Chưa rõ";
  return value.fullName?.trim() || value.username || "Chưa rõ";
}

function departmentName(
  value: PersonalCriteriaSheetRecord["ownerDepartmentId"],
): string {
  if (!value || typeof value !== "object") return "";
  return value.name ?? "";
}

/**
 * Dòng bày ra bảng: giá trị đang sửa là SỐ CHỈ HUY - ô nào chưa chấm thì lấy số
 * cán bộ tự chấm làm điểm khởi đầu.
 *
 * Mở ra với ô trống rồi bắt chỉ huy gõ lại cả sáu dòng thì lần nào cũng thành
 * chấm lại từ đầu, trong khi phần lớn trường hợp chỉ sửa một hai ô.
 */
function toEditableRows(
  sheet: PersonalCriteriaSheetRecord,
  notes: Record<string, string>,
): CriteriaRow[] {
  return sheet.rows.map((row) => ({
    criterionId: row.criterionId,
    criterionName: row.criterionName,
    criterionNote: notes[row.criterionId] ?? "",
    maxScore: row.maxScore,
    fieldValues: { ...row.fieldValues, ...row.reviewValues },
    catalogValues: { ...row.catalogValues, ...row.reviewCatalogValues },
  }));
}

type CriteriaReviewCardProps = {
  blocks: PersonalKpiBoardCriteriaBlock[] | null;
  /** false = không còn ai ở trên, đây là cấp cuối - chỉ chốt chứ không gửi tiếp. */
  canForwardUp: boolean;
  /** Nạp lại bảng tổng sau khi chấm / trả lại / gửi tiếp. */
  onDone: () => Promise<void> | void;
};

/**
 * Khối A trong bảng tổng của chỉ huy: các bảng tiêu chí chung cấp dưới đã gửi.
 *
 * Để riêng khỏi bảng nhiệm vụ chứ không nhét thành một trục giả: bảng A không
 * có trục, không có nội dung công việc, và duyệt theo CẢ BẢNG chứ không lẻ từng
 * dòng - gộp vào bảng nhiệm vụ là phải bịa dữ liệu cho ba cột đó.
 */
export function CriteriaReviewCard({
  blocks,
  canForwardUp,
  onDone,
}: CriteriaReviewCardProps) {
  /** Bảng đang mở, kèm bộ cột của đúng phiên bản mẫu lúc nó được gửi. */
  const sheets = (blocks ?? []).flatMap((block) =>
    block.sheets.map((sheet) => ({ sheet, template: block.template })),
  );
  /** Ghi chú của tiêu chí - server trả chung một bảng tra cho mọi khối. */
  const notes: Record<string, string> = Object.assign(
    {},
    ...(blocks ?? []).map((block) => block.criterionNotes ?? {}),
  );

  const [edited, setEdited] = useState<Record<string, CriteriaRow[]>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [returnSheet, setReturnSheet] =
    useState<PersonalCriteriaSheetRecord | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [forwardSheet, setForwardSheet] =
    useState<PersonalCriteriaSheetRecord | null>(null);

  if (!sheets.length) return null;

  const rowsOf = (sheet: PersonalCriteriaSheetRecord) =>
    edited[sheet._id] ?? toEditableRows(sheet, notes);

  const patch = (
    sheet: PersonalCriteriaSheetRecord,
    criterionId: string,
    part: CriteriaRowPatch,
  ) =>
    setEdited((prev) => ({
      ...prev,
      [sheet._id]: rowsOf(sheet).map((row) =>
        row.criterionId === criterionId ? { ...row, ...part } : row,
      ),
    }));

  const doScore = async (sheet: PersonalCriteriaSheetRecord) => {
    setBusyId(sheet._id);
    try {
      await scorePersonalCriteriaSheet(sheet._id, {
        rows: rowsOf(sheet).map((row) => ({
          criterionId: row.criterionId,
          values: { ...row.fieldValues },
        })),
        note: note[sheet._id]?.trim() || undefined,
      });
      toast.success("Đã chấm và chốt bảng tiêu chí chung.");
      setEdited((prev) => {
        const next = { ...prev };
        delete next[sheet._id];
        return next;
      });
      await onDone();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không chốt được bảng."));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Gửi tiếp lên cấp cao hơn - chuyển lên CHÍNH LÀ duyệt, không bắt bấm duyệt
   * trước. Cùng luật với nhiệm vụ, xem `forward` bên server.
   */
  const doForward = async (payload: SubmitPersonalKpiPayload) => {
    if (!forwardSheet) return;
    setBusyId(forwardSheet._id);
    try {
      const result = await forwardPersonalKpi({
        criteriaSheetIds: [forwardSheet._id],
        recipientId: payload.recipientId,
        note: payload.note,
      });
      toast.success(`Đã gửi bảng khối A lên ${result.recipientName}.`);
      setForwardSheet(null);
      await onDone();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gửi lên được."));
    } finally {
      setBusyId(null);
    }
  };

  const doReturn = async () => {
    if (!returnSheet) return;
    const reason = returnReason.trim();
    if (!reason) {
      toast.error("Lý do trả lại là bắt buộc.");
      return;
    }
    setBusyId(returnSheet._id);
    try {
      await reviewPersonalKpi({
        criteriaSheetIds: [returnSheet._id],
        decision: "RETURN",
        reason,
      });
      toast.success("Đã trả lại bảng để cán bộ chấm lại.");
      setReturnSheet(null);
      setReturnReason("");
      await onDone();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không trả lại được."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <ClipboardCheck className="size-4" />
            Bảng tiêu chí chung (khối A)
            <Badge
              variant="secondary"
              className={cn("font-normal", kpiTone.info.soft)}
            >
              {sheets.length} bảng
            </Badge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Bảng chốt kết quả của CẢ THÁNG, cán bộ cập nhật dần trong tháng. Bạn
            sửa đè được từng ô - số cán bộ khai vẫn nằm dưới ô để đối chiếu.
            Chốt là cả bảng khoá lại, cán bộ không sửa tiếp được nữa.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {sheets.map(({ sheet, template }) => {
            const status = sheet.reviewStatus;
            const editable = canCompletePersonalKpi(status);
            const busy = busyId === sheet._id;
            const rows = rowsOf(sheet);
            const dept = departmentName(sheet.ownerDepartmentId);
            const selfValues = Object.fromEntries(
              sheet.rows.map((row) => [row.criterionId, row.fieldValues]),
            );

            return (
              <Collapsible
                key={sheet._id}
                className="overflow-hidden rounded-lg border"
              >
                <div className="flex flex-wrap items-center gap-2 bg-muted/30 px-3 py-2.5">
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7 shrink-0 [&>svg]:transition-transform data-[state=closed]:[&>svg]:-rotate-90"
                      aria-label={`Mở bảng của ${personName(sheet.ownerId)}`}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                  </CollapsibleTrigger>
                  <span className="font-medium">
                    {personName(sheet.ownerId)}
                  </span>
                  {dept ? (
                    <span className="text-xs text-muted-foreground">
                      {dept}
                    </span>
                  ) : null}
                  <Badge variant="secondary" className="font-normal">
                    Chốt {formatCriteriaPeriod(sheet.periodMonth)}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "font-normal",
                      status === "COMPLETED"
                        ? kpiTone.success.soft
                        : status === "RETURNED"
                          ? kpiTone.danger.soft
                          : kpiTone.warning.soft,
                    )}
                  >
                    {PERSONAL_KPI_STATUS_LABEL[status]}
                  </Badge>
                  {sheet.lastProgressAt ? (
                    <span className="text-xs text-muted-foreground">
                      Cán bộ đã sửa lại sau khi gửi
                    </span>
                  ) : null}
                </div>

                <CollapsibleContent className="space-y-3 border-t p-3">
                  {template ? (
                    <CriteriaTable
                      columns={template.columns}
                      headerGroups={template.headerGroups}
                      rows={rows}
                      disabled={!editable || busy}
                      selfValues={selfValues}
                      onChange={(criterionId, part) =>
                        patch(sheet, criterionId, part)
                      }
                    />
                  ) : (
                    <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                      Không dựng lại được bộ cột của bảng này - mẫu khối A đã bị
                      xoá hoặc chưa gán.
                    </p>
                  )}

                  {status === "COMPLETED" ? (
                    <p className="text-xs text-muted-foreground">
                      Đã chốt
                      {sheet.reviewScoredByName
                        ? ` bởi ${sheet.reviewScoredByName}`
                        : ""}
                      .{sheet.reviewNote ? ` Nhận xét: ${sheet.reviewNote}` : ""}
                    </p>
                  ) : editable ? (
                    <div className="space-y-2">
                      <Textarea
                        rows={2}
                        value={note[sheet._id] ?? ""}
                        placeholder="Nhận xét của chỉ huy (không bắt buộc)"
                        disabled={busy}
                        onChange={(event) =>
                          setNote((prev) => ({
                            ...prev,
                            [sheet._id]: event.target.value,
                          }))
                        }
                      />
                      {/*
                        Chốt là khoá cả tháng: cán bộ hết đường cập nhật cho
                        những ngày còn lại. Nhắc trước khi bấm, không chặn -
                        đơn vị vẫn có thể cần chốt sớm.
                      */}
                      {sheet.periodMonth === serverYmd().slice(0, 7) ? (
                        <p
                          className={cn(
                            "text-xs",
                            kpiTone.warning.text,
                          )}
                        >
                          Tháng này chưa kết thúc - chốt bây giờ là khoá luôn,
                          cán bộ không cập nhật tiếp được.
                        </p>
                      ) : null}
                      <div className="flex flex-wrap justify-end gap-2">
                        {canReviewPersonalKpi(status) ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => {
                              setReturnSheet(sheet);
                              setReturnReason("");
                            }}
                          >
                            <Undo2 className="size-4" />
                            Trả lại
                          </Button>
                        ) : null}
                        {canForwardUp ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy}
                            onClick={() => setForwardSheet(sheet)}
                          >
                            <Send className="size-4" />
                            Gửi lên cấp trên
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          disabled={busy || !template}
                          onClick={() => void doScore(sheet)}
                        >
                          {busy ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <ClipboardCheck className="size-4" />
                          )}
                          Chấm & chốt
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </CardContent>
      </Card>

      <SendRecipientDialog
        open={!!forwardSheet}
        onOpenChange={(open) => {
          if (!open && !busyId) setForwardSheet(null);
        }}
        title="Gửi bảng khối A lên cấp trên"
        description="Chuyển lên trên cũng là duyệt - bảng rời khỏi chỗ bạn và nằm chờ ở cấp nhận."
        confirmLabel="Gửi lên"
        submitting={!!busyId}
        onConfirm={doForward}
      />

      <Dialog
        open={!!returnSheet}
        onOpenChange={(open) => {
          if (!open && !busyId) setReturnSheet(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trả lại bảng tiêu chí chung</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Bảng quay về chỗ người đã gửi để chấm lại. Lý do hiện trong nhật ký
            của bảng.
          </p>
          <Textarea
            rows={3}
            value={returnReason}
            placeholder="Lý do trả lại"
            onChange={(event) => setReturnReason(event.target.value)}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReturnSheet(null)}
              disabled={!!busyId}
            >
              Đóng
            </Button>
            <Button
              variant="destructive"
              onClick={() => void doReturn()}
              disabled={!!busyId || !returnReason.trim()}
            >
              Trả lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
