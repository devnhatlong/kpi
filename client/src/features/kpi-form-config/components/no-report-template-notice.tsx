"use client";

import Link from "next/link";
import { FileWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { userHasAnyPermission } from "@/features/auth/types";
import { PERM } from "@/constants/permissions";
import { cn } from "@/lib/utils";

type NoReportTemplateNoticeProps = {
  /** Việc đang bị chặn, viết theo góc nhìn người dùng. */
  action?: string;
  className?: string;
};

/**
 * Màn chặn khi đơn vị chưa được gán mẫu báo cáo nào.
 *
 * Không nhập được là đúng chứ không phải lỗi: bộ trục và bộ cột phải do quản trị
 * duyệt trước, khai vào một cấu trúc chưa ai duyệt thì số liệu không quy về mẫu
 * nào để chấm. Vì vậy chỗ này phải nói rõ ai là người xử lý, chứ không chỉ báo
 * "không có dữ liệu".
 */
export function NoReportTemplateNotice({
  action = "nhập báo cáo",
  className,
}: NoReportTemplateNoticeProps) {
  const { user } = useAuth();
  const canManage = userHasAnyPermission(user, [PERM.KPI_MANAGE]);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <FileWarning className="size-8 text-muted-foreground/50" />
      <div className="space-y-1">
        <p className="font-medium">Đơn vị chưa được gán mẫu báo cáo</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Chưa có mẫu báo cáo nào áp dụng cho đơn vị của bạn, nên chưa {action}{" "}
          được.{" "}
          {canManage
            ? "Tạo mẫu và chọn phạm vi áp dụng, rồi bấm Lưu & áp dụng mẫu."
            : "Đề nghị quản trị hệ thống cấu hình mẫu báo cáo cho đơn vị."}
        </p>
      </div>
      {canManage ? (
        <Button asChild variant="outline" size="sm">
          <Link href="/kpi/form-config">Mở mục Mẫu báo cáo KPI</Link>
        </Button>
      ) : null}
    </div>
  );
}
