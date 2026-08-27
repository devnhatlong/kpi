"use client";

import { useState } from "react";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/common/searchable-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { entityId } from "@/features/kpi-form-config/types";
import { useScopedAxes } from "@/features/kpi-form-config/use-scoped-axes";
import type { SummaryManualItemInput } from "@/features/kpi-summary-report/api";
import { getApiErrorMessage } from "@/lib/api-client";

const NO_AXIS = "__none__";

/** Giá trị điền sẵn - dòng đã lưu trong báo cáo, hoặc bản nháp chưa ghi xuống. */
export type ManualEntryValue = {
  title: string;
  note?: string;
  axisId?: string | null;
  ownerName?: string;
  departmentName?: string;
  score?: number | null;
};

type ManualEntryFormProps = {
  /** Có giá trị = đang sửa dòng đó; bỏ trống = thêm dòng mới. */
  item?: ManualEntryValue | null;
  /**
   * Khoá của dòng đang mở - đổi khoá thì form nạp lại theo `item`. Tách riêng
   * khỏi `item` vì bản nháp trong trình tạo chưa có _id nào để nhận diện.
   */
  formKey: string;
  submitLabel: string;
  onCancel: () => void;
  /** Ghi dòng này đi đâu là việc của nơi gọi - form chỉ lo mấy cái ô. */
  onSubmit: (input: SummaryManualItemInput) => void | Promise<void>;
};

/**
 * Mấy ô của một nhiệm vụ tự nhập, tách khỏi chỗ chứa nó.
 *
 * Cùng bộ ô này xuất hiện ở hai nơi: hộp thoại của báo cáo đã lưu, và khối nhập
 * thẳng trong trình tạo. Để nguyên trong hộp thoại rồi mở hộp thoại đó chồng
 * lên trình tạo thì thành modal trong modal - cả repo chưa chỗ nào làm vậy, mà
 * người dùng cũng phải đóng mở hai lớp cho mỗi dòng khai.
 */
export function ManualEntryForm({
  item = null,
  formKey,
  submitLabel,
  onCancel,
  onSubmit,
}: ManualEntryFormProps) {
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [axisId, setAxisId] = useState(NO_AXIS);
  const [ownerName, setOwnerName] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [score, setScore] = useState("");
  const [busy, setBusy] = useState(false);

  /*
    Trục theo mẫu báo cáo của đơn vị người lập. Dòng đang sửa giữ nguyên trục cũ
    kể cả khi trục đó đã rời mẫu - báo cáo đã lập không được đổi trục ngầm.
  */
  const { axes } = useScopedAxes({
    ensureAxisIds: item?.axisId ? [item.axisId] : undefined,
  });

  const loadFromItem = () => {
    setTitle(item?.title ?? "");
    setNote(item?.note ?? "");
    setAxisId(item?.axisId || NO_AXIS);
    setOwnerName(item?.ownerName ?? "");
    setDepartmentName(item?.departmentName ?? "");
    setScore(
      item?.score === null || item?.score === undefined
        ? ""
        : String(item.score),
    );
  };

  /*
    Mở lên là nạp lại theo dòng đang sửa (hoặc form trắng khi thêm mới), dọn
    ngay trong render chứ không đợi effect - effect chạy sau khi vẽ nên sẽ chớp
    qua dữ liệu của lần mở trước.
  */
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (formKey !== loadedKey) {
    setLoadedKey(formKey);
    loadFromItem();
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
      await onSubmit({
        title: name,
        note: note.trim() || undefined,
        axisId: axisId === NO_AXIS ? undefined : axisId,
        ownerName: ownerName.trim() || undefined,
        departmentName: departmentName.trim() || undefined,
        score: score.trim() ? parsed : undefined,
      });
      toast.success(
        item ? "Đã sửa nhiệm vụ tự nhập." : "Đã thêm nhiệm vụ tự nhập.",
      );
      // Khai xong một dòng thường là khai tiếp dòng nữa - trả form về trắng
      // thay vì bắt người dùng tự xoá từng ô.
      loadFromItem();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không thêm được nhiệm vụ."));
    } finally {
      setBusy(false);
    }
  };

  return (
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
          <Label htmlFor="manual-score">Điểm</Label>
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

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="bg-background"
          onClick={onCancel}
          disabled={busy}
        >
          Huỷ
        </Button>
        <Button type="button" onClick={() => void submit()} disabled={busy}>
          {busy ? "Đang lưu..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
