"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Inbox, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  appraisalKeys,
  decideAppraisal,
  fetchAppraisalBoard,
  type AppraisalBoardUnit,
  type AppraisalUnit,
} from "@/features/team-report/appraisal";
import { AppraisalWorkspace } from "@/features/team-report/components/appraisal-workspace";
import {
  ReturnTargetPicker,
  StageReturnNotice,
} from "@/features/team-report/components/return-target";
import type { ReturnTarget } from "@/features/team-report/stages";
import {
  MonthSwitcher,
  useCurrentMonth,
} from "@/features/team-report/components/month-switcher";
import { type TeamReportDayStatus } from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm } from "@/lib/server-time";

type Box = "PENDING" | "APPROVED" | "RETURNED" | "";

const BOX_TEXT: Record<Exclude<Box, "">, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  RETURNED: "Đã trả lại",
};

/**
 * Duyệt bảng thẩm định - CÙNG MỘT BÀN LÀM VIỆC với bên lập (danh sách đơn vị
 * bên trái, chi tiết đơn vị bên phải, bảng tổng, xuất tổng hợp), chỉ đọc, thêm
 * thanh duyệt / trả lại ở cuối từng đơn vị (user chốt 2026-10-19). Mỗi tháng
 * xem riêng; xuất tổng hợp ra đúng các đơn vị đang lọc.
 *
 * Đơn vị khoá theo ID ĐƠN VỊ TRONG BẢNG, không theo id phòng: cùng một phòng
 * có thể được hai đội thẩm định trình lên - bàn làm việc khoá theo
 * `departmentId` nên ở đây gán `departmentId` = id đơn vị trong bảng.
 */
export function TeamReportAppraisalInboxView() {
  const [box, setBox] = useState<Box>("PENDING");
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const currentMonth = useCurrentMonth();
  const month = pickedMonth ?? currentMonth;

  const { data, error, isLoading, mutate } = useSWR(
    month ? appraisalKeys.board(box, month) : null,
    () =>
      fetchAppraisalBoard({
        status: box as TeamReportDayStatus | "",
        periodMonth: month,
      }),
    { keepPreviousData: true },
  );

  // departmentId = id đơn vị trong bảng (xem chú thích trên).
  const byKey = useMemo(
    () =>
      new Map(
        (data?.units ?? []).map((unit) => [String(unit._id), unit] as const),
      ),
    [data],
  );
  const units = useMemo(
    () =>
      (data?.units ?? []).map((unit) => ({
        ...unit,
        departmentId: String(unit._id),
      })),
    [data],
  );
  const boardUnit = (unit: AppraisalUnit): AppraisalBoardUnit | undefined =>
    byKey.get(unit.departmentId);

  const teams = [...new Set((data?.units ?? []).map((unit) => unit.teamName))];
  const one = (pick: (unit: AppraisalBoardUnit) => string | undefined) => {
    const values = [
      ...new Set((data?.units ?? []).map(pick).filter(Boolean)),
    ];
    return values.length === 1 ? values[0]! : "";
  };

  const [dialog, setDialog] = useState<{
    kind: "APPROVE" | "RETURN";
    unit: AppraisalUnit;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [returnTo, setReturnTo] = useState<ReturnTarget>("PREVIOUS");
  const [busy, setBusy] = useState(false);

  const decide = async () => {
    if (!dialog) return;
    if (dialog.kind === "RETURN" && !reason.trim()) return;
    const toPrevious =
      dialog.kind === "RETURN" &&
      !!boardUnit(dialog.unit)?.canReturnToPrevious &&
      returnTo === "PREVIOUS";
    setBusy(true);
    try {
      await decideAppraisal(dialog.unit.departmentId, {
        decision: dialog.kind,
        reason: dialog.kind === "RETURN" ? reason.trim() : undefined,
        returnTo: toPrevious ? "PREVIOUS" : undefined,
      });
      toast.success(
        dialog.kind === "RETURN"
          ? toPrevious
            ? "Đã trả về người duyệt cấp 1."
            : "Đã trả lại."
          : "Đã duyệt.",
      );
      setDialog(null);
      setReason("");
      await mutate();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Không thực hiện được."));
    } finally {
      setBusy(false);
    }
  };

  const dialogUnit = dialog ? boardUnit(dialog.unit) : undefined;

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Inbox className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Duyệt bảng thẩm định
              </h1>
              <p className="text-sm text-muted-foreground">
                Phụ lục theo dõi, thẩm định tháng - các đội trình lên từng đơn
                vị, duyệt / trả lại riêng từng đơn vị.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedTabs
              ariaLabel="Trạng thái"
              value={box}
              onChange={setBox}
              items={[
                { value: "PENDING" as const, label: "Chờ duyệt" },
                { value: "APPROVED" as const, label: "Đã duyệt" },
                { value: "RETURNED" as const, label: "Đã trả lại" },
                { value: "" as const, label: "Tất cả" },
              ]}
            />
            <MonthSwitcher month={month} onChange={setPickedMonth} />
          </div>
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {getApiErrorMessage(error, "Không tải được bảng thẩm định.")}
        </p>
      ) : null}

      {isLoading || !data ? (
        error ? null : (
          <Skeleton className="h-96 w-full" />
        )
      ) : !units.length ? (
        <Card className="shadow-sm">
          <CardContent className="px-4 py-10 text-center text-sm text-muted-foreground">
            Không có đơn vị nào
            {box ? ` ở mục "${BOX_TEXT[box]}"` : ""} trong tháng này.
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="py-4">
            <AppraisalWorkspace
              units={units}
              criteria={data.criteria}
              editable={false}
              commendations={data.commendationHints}
              selfClaims={data.selfClaims}
              unitNote={(unit) => {
                const found = boardUnit(unit);
                if (!found) return undefined;
                return `Thẩm định bởi ${found.teamName}${
                  found.sentAt ? ` · trình lúc ${formatServerHm(found.sentAt)}` : ""
                }${
                  found.returnedToFirst && found.status === "PENDING"
                    ? ` · ${found.returnedToFirst.byName} trả về: ${found.returnedToFirst.reason}`
                    : ""
                }`;
              }}
              reviewActions={{
                busy,
                canDecide: (unit) => !!boardUnit(unit)?.canDecide,
                onApprove: (unit) => setDialog({ kind: "APPROVE", unit }),
                onReturn: (unit) => {
                  setReason("");
                  setReturnTo("PREVIOUS");
                  setDialog({ kind: "RETURN", unit });
                },
              }}
              /* Xuất đúng các đơn vị đang lọc (trạng thái + tháng). Nhiều đội
                 trình lên thì ghi đủ tên các đội; người ký chỉ ghi khi chung. */
              exportInfo={{
                periodMonth: month,
                teamName: teams.join(", "),
                leaderName: one((unit) => unit.leaderName),
                commanderName: one((unit) => unit.commanderName),
                statusLabel: box ? BOX_TEXT[box] : undefined,
              }}
            />
          </CardContent>
        </Card>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "RETURN"
                ? "Trả lại đơn vị thẩm định?"
                : "Duyệt đơn vị thẩm định?"}
            </DialogTitle>
            <DialogDescription>
              {dialog?.unit.departmentName}
              {dialogUnit ? ` (đội ${dialogUnit.teamName})` : ""}. Chỉ quyết
              riêng đơn vị này.
              {dialog?.kind === "APPROVE" &&
              dialogUnit?.finalRecipientName &&
              dialogUnit.stage !== "FINAL"
                ? ` Đây là duyệt cấp 1 - duyệt xong chuyển lên ${dialogUnit.finalRecipientName} duyệt cuối.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {dialogUnit?.status === "PENDING" ? (
            <StageReturnNotice info={dialogUnit.returnedToFirst} />
          ) : null}
          {dialog?.kind === "RETURN" && dialogUnit?.canReturnToPrevious ? (
            <ReturnTargetPicker
              value={returnTo}
              onChange={setReturnTo}
              creatorName={dialogUnit.teamName}
              previousName={dialogUnit.firstApproval?.byName}
            />
          ) : null}
          {dialog?.kind === "RETURN" ? (
            <div className="space-y-1.5">
              <Label htmlFor="appraisal-return-reason">
                Lý do trả lại <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="appraisal-return-reason"
                value={reason}
                rows={3}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Nêu rõ nội dung cần sửa…"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialog(null)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              variant={dialog?.kind === "RETURN" ? "destructive" : "default"}
              disabled={busy || (dialog?.kind === "RETURN" && !reason.trim())}
              onClick={() => void decide()}
            >
              {busy ? (
                <Loader2
                  className="size-4 motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {dialog?.kind === "RETURN" ? "Trả lại" : "Duyệt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
