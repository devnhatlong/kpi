"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SummaryCandidatePicker } from "@/features/kpi-summary-report/components/summary-candidate-picker";
import { SummaryReportList } from "@/features/kpi-summary-report/components/summary-report-list";

/**
 * Hai việc của màn báo cáo tổng nằm cạnh nhau: nhặt nhiệm vụ đã hoàn thành, và
 * quản lý các báo cáo đã lập. Nhặt xong thì tự nhảy sang tab báo cáo để thấy
 * ngay kết quả, khỏi phải đi tìm.
 */
export function SummaryReportWorkspace() {
  const [tab, setTab] = useState("pick");
  const { mutate } = useSWRConfig();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Báo cáo tổng
        </h1>
        <p className="text-sm text-muted-foreground">
          Nhặt từng nhiệm vụ đã hoàn thành trong nhánh đơn vị của bạn rồi gom
          thành một báo cáo trải hết các trục, xuất ra Excel để nộp.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pick">Chọn nhiệm vụ</TabsTrigger>
          <TabsTrigger value="reports">Báo cáo của tôi</TabsTrigger>
        </TabsList>

        <TabsContent value="pick" className="mt-4">
          <SummaryCandidatePicker
            onChanged={() => {
              // Danh sách báo cáo bên tab kia đã cũ - làm mới mọi key của nhánh.
              void mutate(
                (key) =>
                  Array.isArray(key) && key[0] === "kpi-summary-reports",
                undefined,
                { revalidate: true },
              );
              setTab("reports");
            }}
          />
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <SummaryReportList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
