"use client";

import { ArrowRight, Building2, User } from "lucide-react";
import dayjs from "dayjs";

import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { assignmentStatusBadgeClass } from "@/features/kpi-assignment/status-styles";
import {
  ASSIGNMENT_STATUS_LABEL,
  holderLabel,
  refLabel,
  scoreGroupLabel,
  type AssignmentTrailStep,
  type KpiAssignment,
} from "@/features/kpi-assignment/types";

type AssignmentDetailDrawerProps = {
  item: KpiAssignment | null;
  onOpenChange: (open: boolean) => void;
};

function stepTarget(step: AssignmentTrailStep) {
  return step.toType === "DEPARTMENT"
    ? refLabel(step.toDepartmentId, "Đơn vị")
    : refLabel(step.toUserId, "Cán bộ");
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

export function AssignmentDetailDrawer({
  item,
  onOpenChange,
}: AssignmentDetailDrawerProps) {
  return (
    <Sheet open={!!item} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[92vw] max-w-[92vw] flex-col gap-0 overflow-hidden sm:max-w-2xl"
      >
        <SheetHeader className="border-b pb-4 text-left">
          <SheetTitle className="pr-8">{item?.title}</SheetTitle>
          <SheetDescription>
            {item ? (
              <Badge
                variant="secondary"
                className={assignmentStatusBadgeClass(item.status)}
              >
                {ASSIGNMENT_STATUS_LABEL[item.status]}
              </Badge>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {item ? (
          <div className="flex-1 space-y-5 overflow-y-auto py-4">
            <section className="divide-y rounded-lg border px-4 py-2">
              <Row label="Trục" value={refLabel(item.axisId)} />
              <Row
                label="Nội dung công việc"
                value={refLabel(item.workContentId)}
              />
              <Row label="Sản phẩm dự kiến" value={item.product || "-"} />
              <Row label="Nhóm điểm" value={scoreGroupLabel(item.scoreGroupId)} />
              <Row
                label="Thời hạn"
                value={
                  item.deadline
                    ? dayjs(item.deadline).format("DD/MM/YYYY")
                    : "-"
                }
              />
              <Row label="Đang ở" value={holderLabel(item)} />
              <Row
                label="Ban hành"
                value={`${refLabel(item.issuerId)} · ${refLabel(item.issuerDepartmentId, "Hệ thống")}`}
              />
              {item.note ? <Row label="Ghi chú giao" value={item.note} /> : null}
            </section>

            <section className="space-y-2 rounded-lg border p-4">
              <h3 className="text-sm font-semibold">Kết quả thực hiện</h3>
              <div className="divide-y">
                <Row
                  label="Tiến độ"
                  value={
                    item.progressPercent != null
                      ? `${item.progressPercent}%`
                      : "Chưa cập nhật"
                  }
                />
                <Row
                  label="Chất lượng"
                  value={
                    item.qualityPercent != null
                      ? `${item.qualityPercent}%`
                      : "Chưa cập nhật"
                  }
                />
                <Row
                  label="Điểm tự chấm"
                  value={item.selfScore ?? "Chưa chấm"}
                />
                {item.status === "APPROVED" ? (
                  <Row label="Điểm duyệt" value={item.approvedScore ?? "-"} />
                ) : null}
                <Row label="Kết quả" value={item.resultNote || "-"} />
                <Row
                  label="Tài liệu"
                  value={
                    item.evidenceFiles?.length ? (
                      <ul className="space-y-1">
                        {item.evidenceFiles.map((file) => (
                          <li key={file.key} className="break-all text-xs">
                            {file.name}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "-"
                    )
                  }
                />
              </div>
              {item.rejectReason ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  Lý do trả lại: {item.rejectReason}
                </p>
              ) : null}
            </section>

            <section className="space-y-3 rounded-lg border p-4">
              <h3 className="text-sm font-semibold">Đường đi của nhiệm vụ</h3>
              <ol className="space-y-3">
                {item.trail.map((step, index) => (
                  <li key={`${step.at}-${index}`} className="flex gap-3 text-sm">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-muted-foreground">
                          {refLabel(step.byDepartmentId, "Hệ thống")}
                        </span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                        {step.toType === "DEPARTMENT" ? (
                          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <User className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        <span className="font-medium">{stepTarget(step)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {refLabel(step.byUserId, "")} ·{" "}
                        {dayjs(step.at).format("DD/MM/YYYY HH:mm")}
                      </p>
                      {step.note ? (
                        <p className="mt-1 text-xs">{step.note}</p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
