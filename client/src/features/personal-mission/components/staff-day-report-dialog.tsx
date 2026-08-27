"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { CalendarDays } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQualityLevelMap } from "@/features/mission-form-config/use-quality-levels";
import {
  fetchStaffDayReport,
  mapPersonalMissionFromApi,
  personalMissionKeys,
} from "@/features/personal-mission/api";
import {
  DayTaskTable,
  type DayTaskRow,
} from "@/features/personal-mission/components/day-task-table";
import { missionTone } from "@/features/personal-mission/status-styles";
import {
  deadlineState,
  readResultInfo,
  resultColumns,
  silenceDays,
  summarizeTask,
  workStateOf,
} from "@/features/personal-mission/task-summary";
import { useAxisTemplates } from "@/features/personal-mission/use-axis-templates";
import { formatYmd, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

type StaffDayReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cán bộ cần đọc; null = chưa chọn ai, hộp thoại không gọi API. */
  ownerId: string | null;
  ownerName: string;
  /** Ngày đang xem, phải nằm trong `availableDates`. */
  reportDate: string | null;
  onReportDateChange: (value: string) => void;
  /**
   * Các ngày cán bộ này có việc trong khoảng đang lọc.
   *
   * Danh sách chỉ huy đang xem là một KHOẢNG ngày, còn báo cáo thì theo TỪNG
   * ngày - không cho chọn ngày thì hộp thoại phải tự đoán, mà đoán sai là đọc
   * nhầm báo cáo của hôm khác.
   */
  availableDates: string[];
  axisOrderById?: Map<string, number>;
};

/**
 * Chỉ huy đọc trọn báo cáo một ngày của một cán bộ, bày đúng như màn cán bộ
 * nhập.
 *
 * Bảng theo dõi chỉ hiện những việc đang nằm ở chỗ chỉ huy, nên nó là một lát
 * cắt: việc đã duyệt và chuyển tiếp lên trên đã rời khỏi bàn mình dù vẫn thuộc
 * báo cáo hôm đó. Hộp thoại này hỏi server theo CHỦ nhiệm vụ nên lấy đủ cả ngày.
 *
 * Chỉ đọc, không thao tác: sửa / gửi / xoá là việc của chính cán bộ, còn duyệt
 * và chấm thì chỉ huy làm ở bảng chính bên ngoài - đưa cả hai bộ nút vào đây
 * chỉ khiến cùng một nhiệm vụ có hai chỗ bấm khác nhau.
 */
export function StaffDayReportDialog({
  open,
  onOpenChange,
  ownerId,
  ownerName,
  reportDate,
  onReportDateChange,
  availableDates,
  axisOrderById,
}: StaffDayReportDialogProps) {
  const templates = useAxisTemplates(open);
  const qualityLevelById = useQualityLevelMap();
  const todayYmd = serverYmd();

  const { data, isLoading } = useSWR(
    open && ownerId && reportDate
      ? personalMissionKeys.staffDay(ownerId, reportDate)
      : null,
    () => fetchStaffDayReport({ ownerId: ownerId!, reportDate: reportDate! }),
    { revalidateOnFocus: false },
  );

  /*
    Dựng dòng bảng y hệt màn nhập: cùng `summarizeTask` / `workStateOf` nên một
    nhiệm vụ đọc ở đây và ở bảng của cán bộ ra cùng một tiến độ, cùng một trạng
    thái. Tự tính lại theo cách khác là hai màn nói hai số.
  */
  const rows = useMemo<DayTaskRow[]>(() => {
    return (data?.items ?? []).map((raw) => {
      const item = mapPersonalMissionFromApi(raw);
      const template = templates.byAxis.get(item.axisId) ?? null;
      const summary = summarizeTask(item.task, template, qualityLevelById, {
        values: item.reviewValues,
        catalogValues: item.reviewCatalogValues,
      });
      const result = readResultInfo(item.task, resultColumns(template), {
        values: item.reviewValues,
        catalogValues: item.reviewCatalogValues,
      });
      return {
        item,
        summary,
        result,
        deadline: deadlineState(summary.deadline, todayYmd),
        work: workStateOf(summary, {
          completed: item.status === "COMPLETED",
          touched: !!item.lastProgressAt,
          hasResult: result.declared,
        }),
        silence: summary.tracksProgress
          ? silenceDays(item.lastProgressAt ?? item.createdAt, todayYmd)
          : null,
        haystack: "",
      };
    });
  }, [data?.items, templates.byAxis, qualityLevelById, todayYmd]);

  /** Nhãn cột hạn lấy từ mẫu - mỗi trục đặt tên khác nhau thì dùng tên chung. */
  const deadlineHeader = useMemo(() => {
    const titles = new Set(
      rows.map((row) => row.summary.deadlineTitle).filter(Boolean),
    );
    return titles.size === 1 ? [...titles][0]! : "Hạn";
  }, [rows]);

  const owner = data?.owner;
  const heading = owner
    ? [owner.rank, owner.name].filter(Boolean).join(" ")
    : ownerName;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Rộng gần hết màn: bảng này có tới tám cột, ép vào khung hẹp là cột nào
        cũng xuống dòng và đọc còn khó hơn bảng bên ngoài.
      */}
      <DialogContent className="flex max-h-[92vh] w-[calc(100%-2rem)] flex-col gap-0 p-0 sm:max-w-[min(96vw,1500px)]">
        <DialogHeader className="border-b px-6 py-4 pr-14 text-left">
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            <CalendarDays className="size-4" />
            Báo cáo ngày · {heading}
            {reportDate ? (
              <Badge
                variant="secondary"
                className={cn("font-normal", missionTone.info.soft)}
              >
                {formatYmd(reportDate)}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {owner?.departmentName ? `${owner.departmentName} · ` : ""}
            Bản đầy đủ của ngày này, kể cả nhiệm vụ đã duyệt xong và chuyển lên
            cấp trên. Nhiệm vụ cán bộ còn để nháp chưa gửi thì không có ở đây.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-auto px-6 py-4">
          {/*
            Chọn ngày ngay trong hộp thoại: chỉ huy thường xem một cán bộ liền
            mấy ngày, đóng ra mở lại chỉ để đổi ngày là thừa một nhịp.
          */}
          {availableDates.length > 1 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Ngày báo cáo
              </span>
              <Select
                value={reportDate ?? ""}
                onValueChange={onReportDateChange}
              >
                <SelectTrigger className="w-[200px] bg-background">
                  <SelectValue placeholder="Chọn ngày" />
                </SelectTrigger>
                <SelectContent>
                  {availableDates.map((date) => (
                    <SelectItem key={date} value={date}>
                      {formatYmd(date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">
                Chỉ liệt kê ngày cán bộ có việc trong khoảng bạn đang lọc.
              </span>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <DayTaskTable
              readOnly
              rows={rows}
              criteriaRows={data?.criteria ?? []}
              deadlineHeader={deadlineHeader}
              loading={isLoading || templates.isLoading}
              emptyText="Cán bộ chưa gửi nhiệm vụ nào của ngày này."
              actingId={null}
              axisOrderById={axisOrderById}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
