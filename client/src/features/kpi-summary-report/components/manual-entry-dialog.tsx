"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SummaryManualItemInput } from "@/features/kpi-summary-report/api";
import {
  ManualEntryForm,
  type ManualEntryValue,
} from "@/features/kpi-summary-report/components/manual-entry-form";

type ManualEntryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Có giá trị = đang sửa dòng đó; bỏ trống = thêm dòng mới. */
  item?: ManualEntryValue | null;
  /** Khoá của dòng đang mở - đổi khoá thì form nạp lại theo `item`. */
  formKey?: string;
  /** Ghi dòng này đi đâu là việc của nơi gọi. */
  onSubmit: (input: SummaryManualItemInput) => void | Promise<void>;
};

/**
 * Nhiệm vụ tự nhập: việc có thật nhưng không đi qua KPI cá nhân (việc đột xuất,
 * việc đơn vị bạn phối hợp làm, việc chỉ huy tự khai theo trục).
 *
 * Nội dung chép thẳng vào báo cáo nên không có gì để đồng bộ về sau - vì vậy
 * dòng này luôn mang nhãn "Tự nhập" ở cột Nguồn, đọc báo cáo là biết ngay số
 * nào có bản ghi KPI đứng sau, số nào do người lập gõ vào.
 */
export function ManualEntryDialog({
  open,
  onOpenChange,
  item = null,
  formKey = "new",
  onSubmit,
}: ManualEntryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {item ? "Sửa nhiệm vụ tự nhập" : "Thêm nhiệm vụ tự nhập"}
          </DialogTitle>
          <DialogDescription>
            Dành cho việc không có trong KPI cá nhân. Dòng này sẽ mang nhãn
            &quot;Tự nhập&quot; trong báo cáo.
          </DialogDescription>
        </DialogHeader>

        {/*
          Form dựng lại từ đầu mỗi lần mở: `key` đổi theo lần mở nên state cũ
          không sống sót qua hai lượt, khỏi phải dọn tay khi đóng.
        */}
        <ManualEntryForm
          key={open ? formKey : "closed"}
          item={item}
          formKey={formKey}
          submitLabel={item ? "Lưu" : "Thêm vào báo cáo"}
          onCancel={() => onOpenChange(false)}
          onSubmit={async (input) => {
            await onSubmit(input);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
