"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Lock, Pencil, Plus, RefreshCw, Square, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  closeTeamReportTask,
  createTeamReportTask,
  deleteTeamReportTask,
  fetchTeamReportSheet,
  teamReportKeys,
  updateTeamReportTask,
} from "@/features/team-report/api";
import { DatePickerInput } from "@/components/common/date-picker-input";
import { NumberInput } from "@/features/team-report/components/number-input";
import { TeamReportDayPicker } from "@/features/team-report/components/team-report-day-picker";
import {
  TEAM_REPORT_STATUS_LABEL,
  refName,
  type TeamReportTask,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { useServerTime } from "@/hooks/use-server-time";
import { formatYmd, serverYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/**
 * Nhịp tự nạp lại bảng.
 *
 * Cả đội gõ chung một bảng nên phải thấy dòng người khác vừa thêm mà không cần
 * bấm gì. 5 giây là đủ để cảm giác "sống" mà không nện API - một đội chục người
 * ngồi cả buổi cũng chỉ vài nghìn lượt, nhẹ hơn nhiều so với dựng WebSocket.
 */
const REFRESH_MS = 5000;

/** Bản nháp đang gõ của một dòng. */
type Draft = {
  name: string;
  deadline: string;
  standardScore: string;
  /** Số bản lúc mở ra sửa - gửi kèm để server biết mình đang cầm bản nào. */
  version: number;
};

const emptyDraft = (): Draft => ({
  name: "",
  deadline: "",
  standardScore: "",
  version: 0,
});

function draftOf(task: TeamReportTask): Draft {
  return {
    name: task.name,
    deadline: task.deadline,
    standardScore:
      task.standardScore === null ? "" : String(task.standardScore),
    version: task.version,
  };
}

/** Ô số để trống nghĩa là CHƯA khai, khác hẳn với khai 0. */
function toNumberOrNull(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Giai đoạn 1 - bảng nhập chung của đội.
 *
 * Cả đội đăng nhập cùng một tài khoản và cùng gõ vào bảng này, nên server không
 * phân biệt được ai với ai. Chống đè bằng số bản trên từng dòng: mở ra sửa là
 * cầm số bản lúc đó, lưu mà server đã có bản mới hơn thì bị từ chối và chỉ dòng
 * đó phải tải lại - phần đang gõ ở dòng khác không việc gì.
 */
export function TeamReportSheetView() {
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<Draft>(emptyDraft);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [closing, setClosing] = useState<TeamReportTask | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [deleting, setDeleting] = useState<TeamReportTask | null>(null);

  const { data, isLoading, mutate, isValidating } = useSWR(
    ready ? teamReportKeys.sheet(reportDate, "") : null,
    () => fetchTeamReportSheet({ reportDate }),
    {
      // Tự nạp lại để thấy dòng người khác vừa thêm.
      refreshInterval: REFRESH_MS,
      // Không nạp lại khi quay về tab: đang gõ dở mà bảng nhảy là mất phần gõ.
      revalidateOnFocus: false,
      keepPreviousData: true,
    },
  );

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const locked = data?.locked ?? false;
  const day = data?.day ?? null;
  /* Chỉ sửa được bảng của HÔM NAY: bảng hôm qua là bản đã chốt, sửa lùi thì
     báo cáo đã gửi và bảng đang xem nói hai chuyện khác nhau. */
  const editable = ready && !locked && reportDate === today;

  const stopEditing = useCallback(() => {
    setEditingId(null);
    setDraft(emptyDraft());
  }, []);

  const handleError = useCallback(
    async (error: unknown, fallback: string) => {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status === 409) {
        // Người khác vừa sửa đúng dòng này - nạp lại rồi để họ gõ tiếp.
        toast.error("Dòng này vừa được người khác sửa. Đã tải lại bản mới.");
        stopEditing();
        await mutate();
        return;
      }
      toast.error(getApiErrorMessage(error, fallback));
    },
    [mutate, stopEditing],
  );

  const saveNew = async () => {
    const name = newDraft.name.trim();
    if (!name) {
      toast.error("Nhập tên nhiệm vụ trước đã.");
      return;
    }
    setBusyId("new");
    try {
      await createTeamReportTask({
        name,
        deadline: newDraft.deadline || undefined,
        standardScore: toNumberOrNull(newDraft.standardScore),
      });
      setNewDraft(emptyDraft());
      setAdding(false);
      await mutate();
      toast.success("Đã thêm nhiệm vụ.");
    } catch (error) {
      await handleError(error, "Không thêm được nhiệm vụ.");
    } finally {
      setBusyId(null);
    }
  };

  const saveEdit = async (task: TeamReportTask) => {
    const name = draft.name.trim();
    if (!name) {
      toast.error("Tên nhiệm vụ không được để trống.");
      return;
    }
    setBusyId(task._id);
    try {
      await updateTeamReportTask(task._id, {
        name,
        deadline: draft.deadline || undefined,
        standardScore: toNumberOrNull(draft.standardScore),
        version: draft.version,
      });
      stopEditing();
      await mutate();
      toast.success("Đã lưu.");
    } catch (error) {
      await handleError(error, "Không lưu được.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmClose = async () => {
    if (!closing) return;
    const reason = closeReason.trim();
    if (!reason) {
      toast.error("Nêu lý do dừng nhiệm vụ.");
      return;
    }
    setBusyId(closing._id);
    try {
      await closeTeamReportTask(closing._id, {
        version: closing.version,
        reason,
      });
      setClosing(null);
      setCloseReason("");
      await mutate();
      toast.success("Đã dừng nhiệm vụ.");
    } catch (error) {
      await handleError(error, "Không dừng được nhiệm vụ.");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting._id);
    try {
      await deleteTeamReportTask(deleting._id);
      setDeleting(null);
      await mutate();
      toast.success("Đã xoá nhiệm vụ.");
    } catch (error) {
      await handleError(error, "Không xoá được nhiệm vụ.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Bảng nhiệm vụ ngày
          </h1>
          <p className="text-sm text-muted-foreground">
            Cả đội cùng nhập vào bảng này. Bảng tự làm mới nên thấy ngay dòng
            người khác vừa thêm.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isValidating ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="size-3 animate-spin" />
              Đang đồng bộ
            </span>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="bg-background"
            onClick={() => void mutate()}
          >
            <RefreshCw className="size-4" />
            Làm mới
          </Button>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TeamReportDayPicker
              value={reportDate}
              onChange={setPickedDate}
              today={today}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-normal">
                {tasks.length} nhiệm vụ
              </Badge>
              {data?.unclassified ? (
                <Badge
                  variant="secondary"
                  className="border-amber-300 bg-amber-100 font-normal text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                >
                  {data.unclassified} chưa phân loại
                </Badge>
              ) : null}
            </div>
          </div>

          {/* Đã gửi thì nói rõ vì sao không gõ được, đừng để nút xám không lý do. */}
          {locked && day ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
              <Lock className="size-4 text-muted-foreground" />
              <span>
                Báo cáo ngày {formatYmd(reportDate)} đã gửi lên cấp trên
                {day.sentByName ? ` (${day.sentByName})` : ""} —{" "}
                {TEAM_REPORT_STATUS_LABEL[day.status]}.
              </span>
              {day.returnReason ? (
                <span className="text-destructive">
                  Lý do trả lại: {day.returnReason}
                </span>
              ) : null}
            </div>
          ) : null}

          {!locked && reportDate !== today ? (
            <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
              Đang xem lại ngày {formatYmd(reportDate)}. Chỉ bảng của hôm nay
              mới nhập và sửa được.
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[320px]">Nhiệm vụ</TableHead>
                  <TableHead className="w-[150px]">Hạn hoàn thành</TableHead>
                  <TableHead className="w-[120px]">Điểm chuẩn</TableHead>
                  <TableHead className="w-[180px]">Phân loại</TableHead>
                  <TableHead className="w-[110px]">Tình trạng</TableHead>
                  <TableHead className="w-[170px] text-right">
                    Thao tác
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && !tasks.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-28 text-center text-muted-foreground"
                    >
                      Đang tải...
                    </TableCell>
                  </TableRow>
                ) : null}

                {!isLoading && !tasks.length && !adding ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-28 text-center text-muted-foreground"
                    >
                      Chưa có nhiệm vụ nào của ngày này.
                    </TableCell>
                  </TableRow>
                ) : null}

                {tasks.map((task) => {
                  const busy = busyId === task._id;
                  const isEditing = editingId === task._id;

                  if (isEditing) {
                    return (
                      <TableRow key={task._id} className="bg-muted/30">
                        <TableCell>
                          <Input
                            autoFocus
                            value={draft.name}
                            onChange={(e) =>
                              setDraft({ ...draft, name: e.target.value })
                            }
                            className="bg-background"
                          />
                        </TableCell>
                        <TableCell>
                          <DatePickerInput
                            value={draft.deadline}
                            onChange={(next) =>
                              setDraft({ ...draft, deadline: next })
                            }
                            placeholder="Không đặt hạn"
                          />
                        </TableCell>
                        <TableCell>
                          <NumberInput
                            min={0}
                            step="any"
                            value={draft.standardScore}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                standardScore: e.target.value,
                              })
                            }
                          />
                        </TableCell>
                        <TableCell
                          colSpan={2}
                          className="text-sm text-muted-foreground"
                        >
                          Phân loại ở tab Phân loại &amp; gửi
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              disabled={busy}
                              onClick={() => void saveEdit(task)}
                            >
                              Lưu
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={stopEditing}
                            >
                              <X className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow
                      key={task._id}
                      className={cn(!task.isOpen && "opacity-60")}
                    >
                      <TableCell className="max-w-[420px] whitespace-normal break-words align-middle font-medium">
                        {task.name}
                        {task.closedReason ? (
                          <div className="text-xs font-normal text-muted-foreground">
                            Dừng: {task.closedReason}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="align-middle tabular-nums">
                        {task.deadline ? formatYmd(task.deadline) : "-"}
                      </TableCell>
                      <TableCell className="align-middle tabular-nums">
                        {task.standardScore ?? "-"}
                      </TableCell>
                      <TableCell className="align-middle text-sm">
                        {refName(task.workContentId) || (
                          <span className="text-muted-foreground">
                            Chưa phân loại
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="align-middle">
                        <Badge variant="secondary" className="font-normal">
                          {task.isOpen ? "Đang làm" : "Đã đóng"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right align-middle">
                        <div className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-background"
                            disabled={!editable || busy || !task.isOpen}
                            onClick={() => {
                              setEditingId(task._id);
                              setDraft(draftOf(task));
                            }}
                          >
                            <Pencil className="size-4" />
                            Sửa
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Dừng nhiệm vụ"
                            title="Dừng nhiệm vụ giữa chừng"
                            disabled={busy || !task.isOpen}
                            onClick={() => {
                              setClosing(task);
                              setCloseReason("");
                            }}
                          >
                            <Square className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Xoá nhiệm vụ"
                            className="text-destructive hover:text-destructive"
                            disabled={!editable || busy}
                            onClick={() => setDeleting(task)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {adding ? (
                  <TableRow className="bg-muted/30">
                    <TableCell>
                      <Input
                        autoFocus
                        placeholder="Tên nhiệm vụ"
                        value={newDraft.name}
                        onChange={(e) =>
                          setNewDraft({ ...newDraft, name: e.target.value })
                        }
                        className="bg-background"
                      />
                    </TableCell>
                    <TableCell>
                      <DatePickerInput
                        value={newDraft.deadline}
                        onChange={(next) =>
                          setNewDraft({ ...newDraft, deadline: next })
                        }
                        placeholder="Không đặt hạn"
                      />
                    </TableCell>
                    <TableCell>
                      <NumberInput
                        min={0}
                        step="any"
                        placeholder="0"
                        value={newDraft.standardScore}
                        onChange={(e) =>
                          setNewDraft({
                            ...newDraft,
                            standardScore: e.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell
                      colSpan={2}
                      className="text-sm text-muted-foreground"
                    >
                      Phân loại sau khi nhập xong
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          size="sm"
                          disabled={busyId === "new"}
                          onClick={() => void saveNew()}
                        >
                          Thêm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAdding(false);
                            setNewDraft(emptyDraft());
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          {editable && !adding ? (
            <Button
              type="button"
              variant="outline"
              className="bg-background"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-4" />
              Thêm nhiệm vụ
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={!!closing}
        onOpenChange={(open) => {
          if (!open) setClosing(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dừng nhiệm vụ</DialogTitle>
            <DialogDescription>
              Nhiệm vụ sẽ không hiện lại ở bảng của những ngày sau. Nêu rõ lý do
              để cấp trên đọc được vì sao dừng giữa chừng.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={closeReason}
            onChange={(e) => setCloseReason(e.target.value)}
            placeholder="Ví dụ: chuyển sang đơn vị khác thực hiện"
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClosing(null)}>
              Huỷ
            </Button>
            <Button
              disabled={busyId === closing?._id}
              onClick={() => void confirmClose()}
            >
              Dừng nhiệm vụ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xoá nhiệm vụ</DialogTitle>
            <DialogDescription>
              Xoá hẳn &ldquo;{deleting?.name}&rdquo; khỏi bảng. Nhiệm vụ đã nằm
              trong báo cáo đã gửi thì không xoá được — dùng nút dừng.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={busyId === deleting?._id}
              onClick={() => void confirmDelete()}
            >
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
