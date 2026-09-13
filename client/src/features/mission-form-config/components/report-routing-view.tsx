"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import { AdjustmentRoutesEditor } from "@/features/mission-form-config/components/report-builder/adjustment-routes-editor";
import type { TeamReportRouteKind } from "@/features/team-report/api";

/**
 * Một cửa cho LUỒNG TRÌNH của mọi loại báo cáo - quản trị chọn loại rồi khai
 * các luồng "ai gửi → gửi cho ai". Cùng một trình soạn cho cả hai loại, chỉ
 * khác dữ liệu; đặt ở đây để không phải mò vào từng trình dựng form.
 */
export function ReportRoutingView() {
  const [kind, setKind] = useState<TeamReportRouteKind>("SUMMARY");

  return (
    <div className="space-y-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Send className="size-5" />
            </span>
            <div>
              <h1 className="font-display text-xl font-semibold tracking-tight">
                Luồng trình báo cáo
              </h1>
              <p className="text-sm text-muted-foreground">
                Ai gửi thì thấy ai trong dropdown &quot;Trình lên&quot;. Không
                khớp luồng nào thì trình lên cấp trên trực tiếp có quyền duyệt.
              </p>
            </div>
          </div>
          <SegmentedTabs
            ariaLabel="Loại báo cáo"
            value={kind}
            onChange={setKind}
            items={[
              { value: "SUMMARY" as const, label: "Báo cáo tổng hợp" },
              {
                value: "ADJUSTMENT" as const,
                label: "Điểm cộng, trừ & xếp loại",
              },
            ]}
          />
        </CardContent>
      </Card>

      <AdjustmentRoutesEditor kind={kind} />
    </div>
  );
}
