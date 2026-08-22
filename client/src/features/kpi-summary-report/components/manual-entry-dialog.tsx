"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/common/searchable-select";
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
import { fetchAxesAll } from "@/features/kpi-form-config/api";
import { entityId } from "@/features/kpi-form-config/types";
import { addSummaryManualItem } from "@/features/kpi-summary-report/api";
import { getApiErrorMessage } from "@/lib/api-client";

const NO_AXIS = "__none__";

type ManualEntryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  onAdded: () => void | Promise<void>;
};

/**
 * Nhiệm vụ tự nhập: việc có thật nhưng không đi qua KPI cá nhân (việc đột xuất,
 * việc đơn vị bạn phối hợp làm).
 *
 * Nội dung chép thẳng vào báo cáo nên không có gì để đồng bộ về sau - vì vậy
 * dòng này luôn mang nhãn "Tự nhập" ở cột Nguồn, đọc báo cáo là biết ngay số
 * nào có bản ghi KPI đứng sau, số nào do người lập gõ vào.
 */
export function ManualEntryDialog({
  open,
  onOpenChange,
  reportId,
  onAdded,
}: ManualEntryDialogProps) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [axisId, setAxisId] = useState(NO_AXIS);
  const [ownerName, setOwnerName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [score, setScore] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: axes = [] } = useSWR(
    ["axes", "all", "kpi-summary"],
    fetchAxesAll,
  );

  /* Mở lại là form trắng - dọn ngay trong render, không đợi effect. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTitle("");
      setNote("");
      setAxisId(NO_AXIS);
      setOwnerName("");
      setDepartmentName("");
      setScore("");
    }
  }

  const submit = async () => {
    const name = title.trim();
    if (!name) {
      toast.error("Tên nhiệm vụ là bắt buộc.");
      return;
    }
    // Điểm nhập tay nhận cả dấu phẩy thập phân như mọi ô điểm khác trong app.
    const parsed = Number(score.trim().replace(",", "."));
    if (score.trim() && !Number.isFinite(parsed)) {
      toast.error("Điểm phải là một con số.");
      return;
    }

    setBusy(true);
    try {
      await addSummaryManualItem(reportId, {
        title: name,
        note: note.trim() || undefined,
        axisId: axisId === NO_AXIS ? undefined : axisId,
        ownerName: ownerName.trim() || undefined,
        departmentName: departmentName.trim() || undefined,
        score: score.trim() ? parsed : undefined,
      });
      toast.success("Đã thêm nhiệm vụ tự nhập.");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm nhiệm vụ tự nhập</DialogTitle>
          <DialogDescription>
            Dành cho việc không có trong KPI cá nhân. Dòng này sẽ mang nhãn
            &quot;Tự nhập&quot; trong báo cáo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="manual-title">
              Tên nhiệm vụ <span className="text-destructive">*</span>
            </Label>
            <Input
              id="manual-title"
              value={title}
              maxLength={300}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ví dụ: Phối hợp bảo vệ hội nghị..."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Trục</Label>
              <SearchableSelect
                value={axisId}
                onValueChange={setAxisId}
                disabled={busy}
                options={[
                  { value: NO_AXIS, label: "Không gắn trục" },
                  ...axes.map((axis) => ({
                    value: entityId(axis),
                    label: axis.name,
                  })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-score">Điểm chỉ huy</Label>
              <Input
                id="manual-score"
                value={score}
                inputMode="decimal"
                disabled={busy}
                onChange={(event) => setScore(event.target.value)}
                placeholder="Bỏ trống nếu không chấm điểm"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="manual-owner">Cán bộ / bộ phận</Label>
              <Input
                id="manual-owner"
                value={ownerName}
                maxLength={200}
                disabled={busy}
                onChange={(event) => setOwnerName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-department">Đơn vị</Label>
              <Input
                id="manual-department"
                value={departmentName}
                maxLength={200}
                disabled={busy}
                onChange={(event) => setDepartmentName(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-note">Ghi chú</Label>
            <Textarea
              id="manual-note"
              rows={2}
              value={note}
              maxLength={1000}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Kết quả, sản phẩm kèm theo..."
            />
          </div>
        </div>

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
          <Button type="button" onClick={() => void submit()} disabled={busy}>
            <Plus className="size-4" />
            {busy ? "Đang thêm..." : "Thêm vào báo cáo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
