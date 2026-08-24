"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CriteriaView } from "@/features/kpi-form-config/components/criteria-view";

type CriteriaCatalogDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Danh mục tiêu chí chấm điểm chung, mở ngay trong màn cấu hình biểu mẫu.
 *
 * Dùng lại nguyên bảng của màn danh mục cũ - danh sách, tìm kiếm, phân trang và
 * form thêm/sửa đều y hệt, chỉ bỏ tiêu đề trang để không đụng tiêu đề hộp thoại.
 */
export function CriteriaCatalogDialog({
  open,
  onOpenChange,
}: CriteriaCatalogDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Danh mục điểm tiêu chí chung</DialogTitle>
          <DialogDescription>
            Mỗi dòng là một tiêu chí kèm điểm tối đa, dùng chung cho mọi đơn vị
            được chấm. Tổng điểm ở đây chính là điểm tối đa của khối A.
          </DialogDescription>
        </DialogHeader>
        <CriteriaView embedded />
      </DialogContent>
    </Dialog>
  );
}
