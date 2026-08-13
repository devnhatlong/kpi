"use client";

import { useState } from "react";
import useSWR from "swr";

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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/common/searchable-select";
import {
  fetchSummaryReports,
  summaryReportKeys,
} from "@/features/kpi-summary-report/api";
import { periodLabel } from "@/features/kpi-summary-report/types";

const NEW_REPORT = "__new__";

export type AddToReportPayload =
  | { mode: "new"; title: string; fromDate: string; toDate: string; note: string }
  | { mode: "existing"; reportId: string };

type AddToReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Số nhiệm vụ đang tích, chỉ để hiện trong tiêu đề. */
  count: number;
  /** Kỳ đang lọc, dùng làm gợi ý mặc định cho báo cáo mới. */
  defaultFromDate?: string;
  defaultToDate?: string;
  submitting: boolean;
  onConfirm: (payload: AddToReportPayload) => Promise<void> | void;
};

/**
 * Đưa các nhiệm vụ đã tích vào báo cáo: tạo mới, hoặc dồn vào một báo cáo nháp
 * đang có. Chỉ liệt kê báo cáo còn nháp - báo cáo đã chốt phải mở lại mới sửa
 * được, đưa vào danh sách này chỉ tổ làm người dùng bấm rồi ăn lỗi.
 */
export function AddToReportDialog({
  open,
  onOpenChange,
  count,
  defaultFromDate = "",
  defaultToDate = "",
  submitting,
  onConfirm,
}: AddToReportDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && submitting) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Đưa {count} nhiệm vụ vào báo cáo tổng</DialogTitle>
          <DialogDescription>
            Tạo báo cáo mới hoặc dồn thêm vào một báo cáo còn nháp.
          </DialogDescription>
        </DialogHeader>

        {/* Thân form nằm trong component con: Radix gỡ nội dung khi đóng, nên
            mỗi lần mở là state khởi tạo lại từ đầu - không cần effect dọn tay. */}
        <AddToReportForm
          defaultFromDate={defaultFromDate}
          defaultToDate={defaultToDate}
          submitting={submitting}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddToReportForm({
  defaultFromDate,
  defaultToDate,
  submitting,
  onCancel,
  onConfirm,
}: {
  defaultFromDate: string;
  defaultToDate: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: (payload: AddToReportPayload) => Promise<void> | void;
}) {
  const [target, setTarget] = useState(NEW_REPORT);
  const [title, setTitle] = useState("");
  const [fromDate, setFromDate] = useState(defaultFromDate);
  const [toDate, setToDate] = useState(defaultToDate);
  const [note, setNote] = useState("");

  const draftsQuery = { page: 1, limit: 50, status: "DRAFT" as const };
  const { data: drafts } = useSWR(summaryReportKeys.list(draftsQuery), () =>
    fetchSummaryReports(draftsQuery),
  );

  const isNew = target === NEW_REPORT;
  const canSubmit = isNew ? Boolean(title.trim()) : Boolean(target);

  const submit = async () => {
    if (!canSubmit) return;
    await onConfirm(
      isNew
        ? {
            mode: "new",
            title: title.trim(),
            fromDate,
            toDate,
            note: note.trim(),
          }
        : { mode: "existing", reportId: target },
    );
  };

  return (
    <>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Đưa vào</Label>
          <SearchableSelect
            value={target}
            onValueChange={setTarget}
            searchPlaceholder="Tìm báo cáo..."
            emptyText="Chưa có báo cáo nháp nào."
            options={[
              { value: NEW_REPORT, label: "➕ Tạo báo cáo tổng mới" },
              ...(drafts?.data ?? []).map((report) => ({
                value: report._id,
                label: `${report.title} · ${report.itemCount} nhiệm vụ`,
                keywords: periodLabel(report.fromDate, report.toDate),
              })),
            ]}
          />
        </div>

        {isNew ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="summary-title">
                Tên báo cáo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="summary-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Báo cáo tổng KPI tháng 8/2026"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="summary-from">Từ ngày</Label>
                <Input
                  id="summary-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="summary-to">Đến ngày</Label>
                <Input
                  id="summary-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="summary-note">Ghi chú</Label>
              <Textarea
                id="summary-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nội dung tóm tắt, nơi nhận..."
              />
            </div>
          </>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={submitting}>
          Hủy
        </Button>
        <Button
          onClick={() => void submit()}
          disabled={submitting || !canSubmit}
        >
          {submitting ? "Đang lưu..." : "Đưa vào báo cáo"}
        </Button>
      </DialogFooter>
    </>
  );
}
