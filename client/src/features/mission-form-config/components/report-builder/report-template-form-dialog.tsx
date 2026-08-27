"use client";

import { useState } from "react";
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
  createReportTemplate,
  updateReportTemplate,
} from "@/features/mission-form-config/api";
import {
  DEFAULT_SCOPE,
  scopeFromTemplate,
  scopeIsComplete,
  type ScopeDraft,
} from "@/features/mission-form-config/components/report-builder/report-scope";
import { ScopePicker } from "@/features/mission-form-config/components/report-builder/scope-picker";
import {
  entityId,
  type ReportTemplate,
} from "@/features/mission-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { serverDayjs } from "@/lib/server-time";

type ReportTemplateFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bỏ trống = tạo mẫu mới. */
  edit?: ReportTemplate | null;
  onSaved: (template: ReportTemplate) => void | Promise<void>;
};

/**
 * Khai phần đầu của một mẫu báo cáo: tên, năm, phạm vi đơn vị.
 *
 * Các khối nội dung và form của từng trục dựng ở màn cấu hình riêng - hộp thoại
 * này chỉ lo phần "mẫu này là của năm nào, cho đơn vị nào".
 */
export function ReportTemplateFormDialog({
  open,
  onOpenChange,
  edit,
  onSaved,
}: ReportTemplateFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [year, setYear] = useState("");
  const [scope, setScope] = useState<ScopeDraft>(DEFAULT_SCOPE);
  const [saving, setSaving] = useState(false);

  /*
    Nạp lại theo mẫu đang sửa ngay trong render chứ không đợi effect - effect
    chạy sau khi vẽ nên sẽ chớp qua dữ liệu của lần mở trước.
  */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const currentKey = open ? (edit ? entityId(edit) : "new") : null;
  if (currentKey !== loadedKey) {
    setLoadedKey(currentKey);
    // Năm mặc định lấy theo GIỜ SERVER đã đồng bộ, không phải giờ máy trạm.
    const defaultYear = serverDayjs().year();
    setName(edit?.name ?? `Mẫu báo cáo nhiệm vụ năm ${defaultYear}`);
    setDescription(edit?.description ?? "");
    setYear(String(edit?.year ?? defaultYear));
    setScope(edit ? scopeFromTemplate(edit) : DEFAULT_SCOPE);
  }

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên mẫu báo cáo.");
      return;
    }
    const yearNum = Number(year);
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2200) {
      toast.error("Năm áp dụng không hợp lệ.");
      return;
    }
    if (!scopeIsComplete(scope)) {
      toast.error(
        scope.scopeType === "by_level"
          ? "Chọn ít nhất một cấp đơn vị."
          : "Chọn ít nhất một đơn vị.",
      );
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim(),
      year: yearNum,
      scopeType: scope.scopeType,
      levelIds: scope.levelIds,
      departmentIds: scope.departmentIds,
      includeDescendants: scope.includeDescendants,
    };

    setSaving(true);
    try {
      const saved = edit
        ? await updateReportTemplate(entityId(edit), payload)
        : await createReportTemplate({ ...payload, axisIds: [] });
      toast.success(edit ? "Đã cập nhật mẫu báo cáo." : "Đã tạo mẫu báo cáo.");
      onOpenChange(false);
      await onSaved(saved);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được mẫu báo cáo."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {edit ? `Sửa mẫu báo cáo · ${edit.code}` : "Tạo mẫu báo cáo"}
          </DialogTitle>
          <DialogDescription>
            {edit
              ? "Đổi phạm vi của mẫu đang áp dụng sẽ đưa mẫu về trạng thái đang cấu hình - phải bấm áp dụng lại."
              : "Tạo xong sẽ mở thẳng màn ghép trục và thiết kế form."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div className="space-y-2">
              <Label htmlFor="rt-form-name">
                Tên mẫu báo cáo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="rt-form-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="VD: Mẫu báo cáo nhiệm vụ khối Phòng"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rt-form-year">Năm áp dụng</Label>
              <Input
                id="rt-form-year"
                type="number"
                min={2000}
                max={2200}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rt-form-desc">Mô tả (tuỳ chọn)</Label>
            <Textarea
              id="rt-form-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Phạm vi áp dụng</Label>
            <ScopePicker value={scope} onChange={setScope} enabled={open} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Hủy
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Đang lưu..." : edit ? "Lưu" : "Tạo và cấu hình"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
