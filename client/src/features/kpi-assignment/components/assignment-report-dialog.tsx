"use client";

import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  reportAssignment,
  submitAssignment,
} from "@/features/kpi-assignment/api";
import {
  scoreGroupLabel,
  type KpiAssignment,
} from "@/features/kpi-assignment/types";
import { getApiErrorMessage } from "@/lib/api-client";

type AssignmentReportDialogProps = {
  item: KpiAssignment | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
};

function numToStr(value: number | null | undefined) {
  return value == null ? "" : String(value);
}

function optionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function AssignmentReportDialog({
  item,
  onOpenChange,
  onDone,
}: AssignmentReportDialogProps) {
  const open = !!item;
  const [progressPercent, setProgressPercent] = useState("");
  const [qualityPercent, setQualityPercent] = useState("");
  const [selfScore, setSelfScore] = useState("");
  const [resultNote, setResultNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setProgressPercent(numToStr(item.progressPercent));
    setQualityPercent(numToStr(item.qualityPercent));
    setSelfScore(numToStr(item.selfScore));
    setResultNote(item.resultNote ?? "");
  }, [item]);

  const buildPayload = () => ({
    progressPercent: optionalNumber(progressPercent),
    qualityPercent: optionalNumber(qualityPercent),
    selfScore: optionalNumber(selfScore),
    resultNote: resultNote.trim(),
  });

  const save = async (thenSubmit: boolean) => {
    if (!item) return;
    setBusy(true);
    try {
      await reportAssignment(item._id, buildPayload());
      if (thenSubmit) {
        await submitAssignment(item._id);
        toast.success("Đã gửi kết quả lên cấp giao.");
      } else {
        toast.success("Đã lưu kết quả.");
      }
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được kết quả."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Báo cáo kết quả</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {item?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {item?.rejectReason ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Bị trả lại: {item.rejectReason}
            </p>
          ) : null}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label htmlFor="report-progress">Tiến độ %</Label>
              <Input
                id="report-progress"
                type="number"
                min={0}
                max={100}
                value={progressPercent}
                onChange={(e) => setProgressPercent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-quality">Chất lượng %</Label>
              <Input
                id="report-quality"
                type="number"
                min={0}
                max={100}
                value={qualityPercent}
                onChange={(e) => setQualityPercent(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-score">Điểm tự chấm</Label>
              <Input
                id="report-score"
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={selfScore}
                onChange={(e) => setSelfScore(e.target.value)}
                placeholder="/ 100"
              />
            </div>
          </div>

          {item ? (
            <p className="text-xs text-muted-foreground">
              Nhóm điểm của nhiệm vụ:{" "}
              <span className="font-medium text-foreground">
                {scoreGroupLabel(item.scoreGroupId)}
              </span>
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="report-note">Kết quả thực hiện</Label>
            <Textarea
              id="report-note"
              rows={4}
              value={resultNote}
              onChange={(e) => setResultNote(e.target.value)}
              placeholder="Mô tả sản phẩm đã làm, số liệu, kết quả đạt được..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Hủy
          </Button>
          <Button
            variant="outline"
            onClick={() => void save(false)}
            disabled={busy}
          >
            Lưu tạm
          </Button>
          <Button onClick={() => void save(true)} disabled={busy}>
            {busy ? "Đang gửi..." : "Gửi lên cấp giao"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
