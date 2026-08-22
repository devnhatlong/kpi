"use client";

import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { addSummaryReportItems } from "@/features/kpi-summary-report/api";
import { SummaryCandidatePicker } from "@/features/kpi-summary-report/components/summary-candidate-picker";
import { getApiErrorMessage } from "@/lib/api-client";

type PickCompletedDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  /** Gọi sau khi đã đưa việc vào báo cáo, để nạp lại chi tiết. */
  onAdded: () => void | Promise<void>;
};

/**
 * Nhặt thêm nhiệm vụ đã hoàn thành vào một báo cáo đang soạn.
 *
 * Chỉ hiện việc chưa nằm trong báo cáo nào khác của tôi - một việc đếm hai lần
 * ở hai báo cáo là số liệu sai, không phải tiện lợi.
 */
export function PickCompletedDialog({
  open,
  onOpenChange,
  reportId,
  onAdded,
}: PickCompletedDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  /*
    Mở lại là bắt đầu từ con số 0, dọn ngay trong lúc render chứ không dùng
    effect: effect chạy sau khi vẽ, sẽ thấy loáng thoáng lựa chọn của lần trước.
  */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSelected(new Set());
  }

  const submit = async () => {
    if (!selected.size) return;
    setBusy(true);
    try {
      const result = await addSummaryReportItems(reportId, [...selected]);
      toast.success(
        result.added
          ? `Đã đưa ${result.added} nhiệm vụ vào báo cáo.`
          : "Các nhiệm vụ này đã có trong báo cáo.",
      );
      await onAdded();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không thêm được nhiệm vụ."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chọn nhiệm vụ đã hoàn thành</DialogTitle>
          <DialogDescription>
            Nhiệm vụ chỉ huy đã xác nhận hoàn thành trong nhánh đơn vị của bạn,
            chưa nằm trong báo cáo nào khác.
          </DialogDescription>
        </DialogHeader>

        <SummaryCandidatePicker
          reportId={reportId}
          selected={selected}
          onChange={setSelected}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="bg-background"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={busy || selected.size === 0}
          >
            <CircleCheck className="size-4" />
            {busy ? "Đang thêm..." : `Đưa vào báo cáo (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
