"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { CircleCheck, Lock, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  classifyTeamReportTask,
  fetchTeamReportClassify,
  submitTeamReportDay,
  teamReportKeys,
  type TeamReportClassifyInput,
} from "@/features/team-report/api";
import { DynamicColumnCell } from "@/features/team-report/components/dynamic-column-cell";
import { TeamReportDayPicker } from "@/features/team-report/components/team-report-day-picker";
import {
  TEAM_REPORT_STATUS_LABEL,
  catalogOfColumn,
  finalCatalogValue,
  finalFieldValue,
  inputColumns,
  isColumnReviewed,
  refId,
  type TeamReportAxis,
  type TeamReportCatalogs,
  type TeamReportColumn,
  type TeamReportTask,
  type TeamReportTemplate,
  type TeamReportWorkContent,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { useServerTime } from "@/hooks/use-server-time";
import { formatYmd, serverYmd } from "@/lib/server-time";

const REFRESH_MS = 8000;

/**
 * Giai đoạn 2 - phân loại theo TRỤC rồi chấm theo bộ cột của trục đó.
 *
 * Chọn trục là quyết định luôn bộ cột: mỗi trục dùng một mẫu bảng do quản trị
 * cấu hình sẵn, nên bảng ở đây không có cột cố định nào ngoài Trục và Nội dung
 * công việc - phần còn lại dựng từ chính cấu hình đó.
 *
 * Lưu ngay từng ô thay vì gom lại một nút "Lưu tất cả": bảng này cũng chung một
 * tài khoản với cả đội, gom lại thì một lượt lưu có thể đè lên phần người khác
 * vừa sửa ở dòng khác.
 */
export function TeamReportClassifyView() {
  /*
    Mọi thứ dính tới ngày đều chờ ĐỒNG BỘ GIỜ SERVER xong.

    `serverYmd()` trả về giờ MÁY khi chưa đồng bộ, nên khởi tạo state bằng nó ở
    lần render đầu là chốt cứng một ngày có thể sai - máy lệch múi giờ hoặc lệch
    đồng hồ sẽ mở nhầm bảng của hôm khác, mà cả đội dùng chung một tài khoản nên
    hai người ngồi cạnh nhau lại thấy hai ngày.

    Vì vậy giữ "ngày người dùng đã chọn" (null = chưa chọn) rồi suy ra ngày đang
    xem từ hôm nay, và không gọi API trước khi `ready`.
  */
  const { ready } = useServerTime();
  const today = serverYmd();
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const reportDate = pickedDate ?? today;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [note, setNote] = useState("");
  const [closeIds, setCloseIds] = useState<Set<string>>(new Set());

  const { data, isLoading, mutate } = useSWR(
    ready ? teamReportKeys.classify(reportDate) : null,
    () => fetchTeamReportClassify({ reportDate }),
    {
      refreshInterval: REFRESH_MS,
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const axes = useMemo(() => data?.axes ?? [], [data]);
  const contents = useMemo(() => data?.workContents ?? [], [data]);
  const templates = useMemo(() => data?.templates ?? {}, [data]);
  const catalogs = useMemo(() => data?.catalogs ?? {}, [data]);

  const locked = data?.locked ?? false;
  const canSubmit = data?.canSubmit ?? false;
  const editable = ready && !locked && reportDate === today;

  /*
    Gom theo TRỤC: mỗi trục một bộ cột riêng nên không thể xếp chung một bảng.
    Nhóm "chưa chọn trục" đứng đầu vì đó là việc còn phải làm.
  */
  const groups = useMemo(() => {
    const byAxis = new Map<string, TeamReportTask[]>();
    for (const task of tasks) {
      const key = refId(task.axisId);
      byAxis.set(key, [...(byAxis.get(key) ?? []), task]);
    }
    return [...byAxis.entries()]
      .sort(([left], [right]) => {
        if (!left) return -1;
        if (!right) return 1;
        const a = axes.find((axis) => axis._id === left)?.sortOrder ?? 0;
        const b = axes.find((axis) => axis._id === right)?.sortOrder ?? 0;
        return a - b;
      })
      .map(([axisId, rows]) => ({
        axisId,
        axis: axes.find((axis) => axis._id === axisId) ?? null,
        template: axisId ? (templates[axisId] ?? null) : null,
        rows,
      }));
  }, [tasks, axes, templates]);

  const patch = async (
    task: TeamReportTask,
    input: TeamReportClassifyInput,
  ) => {
    setBusyId(task._id);
    try {
      await classifyTeamReportTask(task._id, input);
      await mutate();
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) {
        toast.error("Dòng này vừa được người khác sửa. Đã tải lại bản mới.");
      } else {
        toast.error(getApiErrorMessage(error, "Không lưu được."));
      }
      // Nạp lại để ô trên màn quay về đúng giá trị server đang giữ, không để
      // người dùng tưởng đã lưu xong.
      await mutate();
    } finally {
      setBusyId(null);
    }
  };

  const confirmSend = async () => {
    setSending(true);
    try {
      const result = await submitTeamReportDay({
        reportDate,
        note: note.trim() || undefined,
        closeTaskIds: [...closeIds],
      });
      setSendOpen(false);
      await mutate();
      toast.success(`Đã gửi ${result.rowCount} nhiệm vụ lên cấp trên.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gửi được báo cáo."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Phân loại &amp; gửi
          </h1>
          <p className="text-sm text-muted-foreground">
            Chọn trục cho từng nhiệm vụ — bảng chấm hiện đúng bộ cột mà quản trị
            đã cấu hình cho trục đó.
          </p>
        </div>

        <Button
          type="button"
          disabled={!editable || !canSubmit}
          onClick={() => {
            setNote("");
            setCloseIds(new Set());
            setSendOpen(true);
          }}
          title={
            canSubmit
              ? undefined
              : "Còn nhiệm vụ chưa phân loại - phân loại hết mới gửi được"
          }
        >
          <Send className="size-4" />
          Gửi lên cấp trên
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="space-y-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TeamReportDayPicker
              value={reportDate}
              onChange={setPickedDate}
              today={today}
            />

            {data ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="font-normal">
                  {tasks.length} nhiệm vụ
                </Badge>
                {data.unclassified ? (
                  <Badge
                    variant="secondary"
                    className="gap-1 border-amber-300 bg-amber-100 font-normal text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  >
                    <TriangleAlert className="size-3" />
                    {data.unclassified} chưa phân loại
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="gap-1 border-emerald-300 bg-emerald-100 font-normal text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                  >
                    <CircleCheck className="size-3" />
                    Đã phân loại hết
                  </Badge>
                )}
              </div>
            ) : null}
          </div>

          {locked && data?.day ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
              <Lock className="size-4 text-muted-foreground" />
              <span>
                Đã gửi ngày {formatYmd(reportDate)} —{" "}
                {TEAM_REPORT_STATUS_LABEL[data.day.status]}.
              </span>
              {data.day.returnReason ? (
                <span className="text-destructive">
                  Lý do trả lại: {data.day.returnReason}
                </span>
              ) : null}
            </div>
          ) : null}

          {isLoading && !tasks.length ? (
            <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
              Đang tải...
            </div>
          ) : null}

          {!isLoading && !tasks.length ? (
            <div className="rounded-md border p-10 text-center text-sm text-muted-foreground">
              Chưa có nhiệm vụ nào của ngày này.
            </div>
          ) : null}

          {groups.map((group) => (
            <AxisGroupTable
              key={group.axisId || "__unclassified__"}
              axis={group.axis}
              template={group.template}
              rows={group.rows}
              axes={axes}
              contents={contents}
              catalogs={catalogs}
              disabled={!editable}
              busyId={busyId}
              onPatch={patch}
            />
          ))}
        </CardContent>
      </Card>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gửi báo cáo ngày {formatYmd(reportDate)}</DialogTitle>
            <DialogDescription>
              Gửi xong thì bảng của ngày này khoá lại. Nhiệm vụ chưa đóng vẫn
              chạy tiếp và hiện lại ở bảng ngày mai.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
              Bản gửi gồm <strong>{tasks.length} nhiệm vụ</strong>.
            </div>

            {/* Đóng việc là quyết định riêng, không suy từ con số nào: mỗi trục
                chấm một kiểu, "đủ 100%" không phải khái niệm chung mọi mẫu. */}
            {tasks.filter((task) => task.isOpen).length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Đánh dấu nhiệm vụ đã xong (đóng lại, mai không hiện nữa)
                </p>
                <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-md border p-2">
                  {tasks
                    .filter((task) => task.isOpen)
                    .map((task) => (
                      <label
                        key={task._id}
                        className="flex cursor-pointer items-start gap-2 rounded p-1.5 text-sm hover:bg-muted/60"
                      >
                        <Checkbox
                          checked={closeIds.has(task._id)}
                          onCheckedChange={(checked) => {
                            setCloseIds((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(task._id);
                              else next.delete(task._id);
                              return next;
                            });
                          }}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 break-words">{task.name}</span>
                      </label>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <p className="text-sm font-medium">Ghi chú gửi kèm</p>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Không bắt buộc"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendOpen(false)}>
              Huỷ
            </Button>
            <Button disabled={sending} onClick={() => void confirmSend()}>
              <Send className="size-4" />
              Gửi lên cấp trên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type AxisGroupTableProps = {
  axis: TeamReportAxis | null;
  template: TeamReportTemplate | null;
  rows: TeamReportTask[];
  axes: TeamReportAxis[];
  contents: TeamReportWorkContent[];
  catalogs: TeamReportCatalogs;
  disabled: boolean;
  busyId: string | null;
  onPatch: (task: TeamReportTask, input: TeamReportClassifyInput) => void;
};

/**
 * Một bảng cho một trục.
 *
 * Mỗi trục một bộ cột khác nhau nên phải tách bảng: nhét chung thì hàng tiêu đề
 * phải là hợp của mọi trục, và dòng nào cũng thừa quá nửa số cột trống trơn.
 */
function AxisGroupTable({
  axis,
  template,
  rows,
  axes,
  contents,
  catalogs,
  disabled,
  busyId,
  onPatch,
}: AxisGroupTableProps) {
  const columns = inputColumns(template);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-sm font-semibold">
          {axis ? axis.name : "Chưa chọn trục"}
        </h2>
        <Badge variant="secondary" className="font-normal">
          {rows.length} nhiệm vụ
        </Badge>
        {axis && !template ? (
          <Badge
            variant="secondary"
            className="gap-1 border-amber-300 bg-amber-100 font-normal text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            <TriangleAlert className="size-3" />
            Trục này chưa được gán mẫu bảng
          </Badge>
        ) : null}
        {template ? (
          <span className="text-xs text-muted-foreground">
            Mẫu: {template.name} (bản {template.version})
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[240px]">Nhiệm vụ</TableHead>
              <TableHead className="w-[180px]">Trục</TableHead>
              <TableHead className="w-[220px]">Nội dung công việc</TableHead>
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  style={{ minWidth: Math.max(120, column.width) }}
                >
                  {column.title}
                  {column.required ? (
                    <span className="text-destructive"> *</span>
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((task) => (
              <ClassifyRow
                /*
                  Khoá kèm số bản: các ô giữ bản nháp cục bộ, mà state cục bộ thì
                  không tự nhận giá trị mới khi props đổi. Gắn version vào khoá là
                  dòng được dựng lại đúng lúc nội dung thật sự đổi - tức khi người
                  khác vừa sửa chính dòng này.
                */
                key={`${task._id}:${task.version}`}
                task={task}
                axes={axes}
                contents={contents}
                columns={columns}
                catalogs={catalogs}
                disabled={disabled || busyId === task._id}
                onPatch={onPatch}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type ClassifyRowProps = {
  task: TeamReportTask;
  axes: TeamReportAxis[];
  contents: TeamReportWorkContent[];
  columns: TeamReportColumn[];
  catalogs: TeamReportCatalogs;
  disabled: boolean;
  onPatch: (task: TeamReportTask, input: TeamReportClassifyInput) => void;
};

function ClassifyRow({
  task,
  axes,
  contents,
  columns,
  catalogs,
  disabled,
  onPatch,
}: ClassifyRowProps) {
  const axisId = refId(task.axisId);
  const contentId = refId(task.workContentId);

  /* Nội dung công việc chỉ trong trục đã chọn - server cũng chặn, nhưng không
     bày ra thì không ai chọn nhầm ngay từ đầu. */
  const options = useMemo(
    () => contents.filter((content) => content.axisId === axisId),
    [contents, axisId],
  );

  return (
    <TableRow className={task.isOpen ? undefined : "opacity-60"}>
      <TableCell className="max-w-[320px] whitespace-normal break-words align-middle">
        <div className="font-medium">{task.name}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          Khai ngày {formatYmd(task.createdDate)}
          {task.deadline ? ` · hạn ${formatYmd(task.deadline)}` : ""}
        </div>
      </TableCell>

      <TableCell className="align-middle">
        <Select
          value={axisId || "__none__"}
          disabled={disabled}
          onValueChange={(value) =>
            onPatch(task, {
              version: task.version,
              axisId: value === "__none__" ? null : value,
            })
          }
        >
          <SelectTrigger className="w-full bg-background">
            <SelectValue placeholder="Chọn trục" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Chưa chọn</SelectItem>
            {axes.map((item) => (
              <SelectItem key={item._id} value={item._id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      <TableCell className="align-middle">
        <Select
          value={contentId || "__none__"}
          disabled={disabled || !axisId}
          onValueChange={(value) =>
            onPatch(task, {
              version: task.version,
              workContentId: value === "__none__" ? null : value,
            })
          }
        >
          <SelectTrigger className="w-full bg-background">
            <SelectValue placeholder={axisId ? "Chọn" : "Chọn trục trước"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Chưa chọn</SelectItem>
            {options.map((content) => (
              <SelectItem key={content._id} value={content._id}>
                {content.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>

      {columns.map((column) => {
        const catalog = catalogOfColumn(column);
        const value = catalog
          ? (finalCatalogValue(task, column.key)?.id ?? "")
          : String(finalFieldValue(task, column.key) ?? "");

        return (
          <TableCell key={column.key} className="align-middle">
            <DynamicColumnCell
              column={column}
              value={value}
              catalogs={catalogs}
              disabled={disabled}
              onCommit={(next) =>
                onPatch(task, {
                  version: task.version,
                  ...(catalog
                    ? { catalogValues: { [column.key]: next } }
                    : { fieldValues: { [column.key]: next } }),
                })
              }
            />
            {/* Ô đang bày là số CHỐT. Cấp trên chấm lại thì nói rõ, kẻo đội
                tưởng đó là số mình khai. */}
            {isColumnReviewed(task, column.key) ? (
              <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                Cấp trên chấm lại
              </div>
            ) : null}
          </TableCell>
        );
      })}
    </TableRow>
  );
}
