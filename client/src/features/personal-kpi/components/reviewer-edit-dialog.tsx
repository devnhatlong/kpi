"use client";

import { useMemo, useState } from "react";
import { PencilLine, TriangleAlert } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchAxesAll,
  fetchWorkContentsAll,
} from "@/features/kpi-form-config/api";
import { entityId } from "@/features/kpi-form-config/types";
import { reviewerEditPersonalKpi } from "@/features/personal-kpi/api";
import { TaskFieldsGrid } from "@/features/personal-kpi/components/task-fields-grid";
import { kpiTone } from "@/features/personal-kpi/status-styles";
import { useAxisTemplates } from "@/features/personal-kpi/use-axis-templates";
import type {
  PersonalKpiItem,
  PersonalTaskDraft,
} from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Danh mục trả về id thô hoặc bản đã populate - lấy ra id ở cả hai kiểu. */
function refId(value: string | { _id: string } | null | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value._id;
}

type ReviewerEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nhiệm vụ đang sửa; tách khỏi `open` để lúc đóng vẫn còn nội dung mà vẽ. */
  item: PersonalKpiItem | null;
  onSaved: () => void | Promise<void>;
};

/**
 * Chỉ huy sửa nhiệm vụ cán bộ đã gửi lên.
 *
 * Sửa được mọi thứ: trục, nội dung công việc và toàn bộ ô của mẫu. Đổi trục thì
 * bộ cột đổi theo mẫu của trục mới, nên form dựng lại từ mẫu đang chọn chứ
 * không giữ cứng bộ cột cũ.
 *
 * Bắt buộc nêu lý do: mọi thay đổi đều vào nhật ký nhiệm vụ, cán bộ mở ra là
 * thấy chỉ huy đã sửa gì, từ đâu thành đâu.
 */
export function ReviewerEditDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: ReviewerEditDialogProps) {
  const [axisId, setAxisId] = useState("");
  const [workContentId, setWorkContentId] = useState("");
  const [task, setTask] = useState<PersonalTaskDraft | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: axes = [] } = useSWR(
    ["axes", "all", "reviewer-edit"],
    fetchAxesAll,
  );
  const { data: contents = [] } = useSWR(
    ["work-contents", "all", "reviewer-edit"],
    fetchWorkContentsAll,
  );
  const { byAxis } = useAxisTemplates(open);

  /*
    Mở lên là nạp lại từ nhiệm vụ đang chọn, dọn ngay trong render chứ không đợi
    effect - effect chạy sau khi vẽ nên sẽ chớp qua dữ liệu của nhiệm vụ trước.
  */
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const currentId = open ? (item?.id ?? null) : null;
  if (currentId !== loadedId) {
    setLoadedId(currentId);
    setAxisId(item?.axisId ?? "");
    setWorkContentId(item?.workContentId ?? "");
    setTask(item ? { ...item.task } : null);
    setReason("");
  }

  const template = axisId ? byAxis.get(axisId) : undefined;

  /** Nội dung công việc bám theo trục đang chọn - đổi trục là danh sách đổi. */
  const contentOptions = useMemo(
    () =>
      contents
        .filter((content) => !axisId || refId(content.axisId) === axisId)
        .map((content) => ({
          value: entityId(content),
          label: content.name,
          keywords: content.code,
        })),
    [contents, axisId],
  );

  const content = contents.find((entry) => entityId(entry) === workContentId);

  const submit = async () => {
    if (!item || !task) return;
    if (!axisId || !workContentId) {
      toast.error("Chọn trục và nội dung công việc.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Lý do sửa là bắt buộc.");
      return;
    }

    setSaving(true);
    try {
      await reviewerEditPersonalKpi(item.id, {
        axisId,
        workContentId,
        catalogValues: task.catalogValues,
        fieldValues: task.fieldValues,
        attachments: task.attachments,
        reason: reason.trim(),
      });
      toast.success("Đã sửa nhiệm vụ và ghi vào nhật ký.");
      await onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không sửa được nhiệm vụ."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Sửa nhiệm vụ của cán bộ</DialogTitle>
          <DialogDescription>
            {item?.ownerName ? `${item.ownerName} · ` : ""}
            Sửa được mọi trường. Thay đổi nào cũng vào nhật ký nhiệm vụ, kèm lý
            do.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[68vh] space-y-4 overflow-y-auto px-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Trục</Label>
              <SearchableSelect
                value={axisId}
                onValueChange={(next) => {
                  setAxisId(next);
                  // Nội dung cũ thuộc trục cũ thì không còn hợp lệ.
                  const stillValid = contents.some(
                    (entry) =>
                      entityId(entry) === workContentId &&
                      refId(entry.axisId) === next,
                  );
                  if (!stillValid) setWorkContentId("");
                }}
                options={axes.map((axis) => ({
                  value: entityId(axis),
                  label: axis.name,
                  keywords: axis.code,
                }))}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nội dung công việc</Label>
              <SearchableSelect
                value={workContentId}
                onValueChange={setWorkContentId}
                options={contentOptions}
                disabled={saving || !axisId}
                placeholder={axisId ? "Chọn nội dung..." : "Chọn trục trước đã"}
              />
            </div>
          </div>

          {!template ? (
            <div
              className={cn(
                "flex items-start gap-2 rounded-lg border p-3 text-sm",
                kpiTone.warning.soft,
              )}
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              Trục này chưa gán mẫu bảng KPI nên không có ô nào để sửa. Vào Cấu
              hình form KPI › Mẫu bảng KPI để gán mẫu.
            </div>
          ) : task ? (
            <div className="rounded-lg border p-3">
              <TaskFieldsGrid
                columns={template.columns}
                headerGroups={template.headerGroups}
                task={task}
                scoreGroupId={refId(content?.scoreGroupId)}
                contentNote={content?.note ?? ""}
                workContentId={workContentId}
                disabled={saving}
                onChange={(patch) =>
                  setTask((prev) => (prev ? { ...prev, ...patch } : prev))
                }
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="reviewer-edit-reason">
              Lý do sửa <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reviewer-edit-reason"
              className="min-h-[72px]"
              placeholder="Vì sao phải sửa - cán bộ sẽ đọc được ở nhật ký nhiệm vụ..."
              value={reason}
              maxLength={500}
              disabled={saving}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="bg-background"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !reason.trim()}
          >
            <PencilLine className="size-4" />
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
