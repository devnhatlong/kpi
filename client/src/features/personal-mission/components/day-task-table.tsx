"use client";

import {
  ClipboardList,
  Eye,
  MoreHorizontal,
  Pencil,
  Send,
  SquarePen,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCriteriaPeriod,
  type PersonalCriteriaSheetSummary,
} from "@/features/personal-mission/api";
import {
  DeadlineCell,
  PercentCell,
  WorkStateBadge,
} from "@/features/personal-mission/components/mission-cells";
import {
  missionTone,
  personalMissionStatusBadgeClass,
} from "@/features/personal-mission/status-styles";
import {
  SILENCE_ALERT_DAYS,
  type DeadlineState,
  type ResultInfo,
  type TaskSummary,
  type WorkState,
} from "@/features/personal-mission/task-summary";
import {
  PERSONAL_MISSION_STATUS_LABEL,
  canDeletePersonalMission,
  canEditPersonalMission,
  canUpdateProgress,
  type PersonalMissionItem,
} from "@/features/personal-mission/types";
import { formatYmd } from "@/lib/server-time";
import { cn } from "@/lib/utils";

export type DayTaskRow = {
  item: PersonalMissionItem;
  summary: TaskSummary;
  /** Kết quả Đạt / Không đạt của trục chấm theo mục - trục 2 đọc ở đây. */
  result: ResultInfo;
  deadline: DeadlineState | null;
  /** Trạng thái công việc theo tiến độ, tách khỏi trạng thái duyệt. */
  work: WorkState;
  /** Số ngày không ai cập nhật tiến độ; null = chưa có mốc nào. */
  silence: number | null;
};

/**
 * Cảnh báo về hạn cho cột "Tình trạng thực hiện".
 *
 * Việc đã xong tiến độ hoặc cấp trên đã chốt thì thôi kêu - quá ngày mà việc
 * xong rồi thì không còn là nợ.
 */
function deadlineHealth(row: DayTaskRow) {
  const settled =
    row.work === "DONE" ||
    row.item.status === "APPROVED" ||
    row.item.status === "COMPLETED";
  if (settled || !row.deadline) return null;

  if (row.deadline.days < 0) {
    return { label: "Trễ hạn", className: missionTone.danger.soft };
  }
  if (row.deadline.days <= 2) {
    return { label: "Sắp đến hạn", className: missionTone.warning.soft };
  }
  return null;
}

/** Việc chưa xong mà lâu rồi không ai đụng vào tiến độ. */
export function isSilent(row: DayTaskRow): boolean {
  if (row.work === "DONE" || row.item.status === "COMPLETED") return false;
  return row.silence !== null && row.silence >= SILENCE_ALERT_DAYS;
}

type DayTaskTableBaseProps = {
  rows: DayTaskRow[];
  /**
   * Bảng khối A của các ngày trong danh sách - mỗi bảng một dòng, đứng trên
   * nhiệm vụ.
   *
   * Nằm chung bảng chứ không tách ra một khung riêng: khối A cũng là một thứ
   * phải chấm, phải gửi, phải chờ duyệt như nhiệm vụ - để riêng thì nó biến mất
   * khỏi tầm mắt và cán bộ tưởng chưa khai gì.
   */
  criteriaRows?: PersonalCriteriaSheetSummary[];
  /** Mở bảng khối A của một ngày (chấm nếu còn sửa được, không thì xem lại). */
  onOpenCriteria?: (sheet: PersonalCriteriaSheetSummary) => void;
  /** Nhãn cột hạn - lấy theo tên cột ngày trong mẫu nhiệm vụ. */
  deadlineHeader: string;
  loading?: boolean;
  emptyText: string;
  /** Dòng đang chờ một thao tác chạy xong - khoá nút của riêng dòng đó. */
  actingId: string | null;
  /** Ẩn dòng tiêu đề - dùng khi bảng nằm trong một nhóm đã có tiêu đề riêng. */
  hideHeader?: boolean;
  /**
   * Hiện ngày báo cáo của từng dòng. Bật khi danh sách trải nhiều ngày - không
   * có nó thì việc hôm nay và việc tuần trước nằm lẫn nhau, không phân biệt nổi.
   */
  showReportDate?: boolean;
  /**
   * Số hiệu khối B của từng trục, theo mẫu báo cáo đang áp dụng. Có thì cột
   * Biểu mẫu hiện "B1 · Trục 1" để đối chiếu thẳng với bản in; không có thì chỉ
   * hiện tên trục.
   */
  axisOrderById?: Map<string, number>;
};

/**
 * Hai kiểu dùng, tách thành hai nhánh để chỗ gọi không lỡ tay quên:
 *
 * - mặc định: bảng của chính chủ, phải đủ bốn thao tác;
 * - `readOnly`: chỉ huy đọc lại báo cáo của cán bộ khác, bỏ hẳn cột "Thao tác".
 *
 * Cập nhật tiến độ / sửa / gửi / xoá đều là việc của CHỦ nhiệm vụ. Bày cho
 * người khác thì hoặc bấm vào là lỗi quyền, hoặc sửa đè lên bản của người ta.
 * Bỏ cả cột chứ không chỉ khoá nút - một cột toàn nút xám chỉ tổ chiếm chỗ.
 */
type DayTaskTableProps = DayTaskTableBaseProps &
  (
    | {
        readOnly: true;
        onUpdateProgress?: never;
        onEditDetail?: never;
        onSend?: never;
        onDelete?: never;
      }
    | {
        readOnly?: false;
        onUpdateProgress: (item: PersonalMissionItem) => void;
        onEditDetail: (item: PersonalMissionItem) => void;
        onSend: (item: PersonalMissionItem) => void;
        onDelete: (item: PersonalMissionItem) => void;
      }
  );

/**
 * Ô "Kết quả nhiệm vụ" - tự đổi cách bày theo MẪU của chính dòng đó.
 *
 * Trục chấm theo tỉ lệ hiện hai thanh Tiến độ / Chất lượng; trục chấm theo mục
 * hiện Đạt / Không đạt kèm điểm. Trước đây hai kiểu này là hai bộ cột khác
 * nhau, chọn theo cả bảng - nên danh sách trộn nhiều trục thì kiểu nào cũng sai
 * với một nửa số dòng.
 */
function MissionResultCell({ row }: { row: DayTaskRow }) {
  const { summary, result } = row;

  // Trục chấm theo mục: không có phần trăm nào để bày, chỉ có đạt hay không.
  if (!summary.tracksProgress && !summary.tracksQuality) {
    return (
      <div className="space-y-0.5">
        {!result.declared ? (
          <span className="text-xs text-muted-foreground">
            Chưa khai kết quả
          </span>
        ) : (
          <Badge
            variant="secondary"
            className={cn(
              "font-normal",
              result.failed
                ? missionTone.danger.soft
                : missionTone.success.soft,
            )}
          >
            {result.failed ? "Không đạt" : "Đạt"}
          </Badge>
        )}
        <div
          className="text-xs text-muted-foreground tabular-nums"
          title={
            result.score !== null &&
            result.selfScore !== null &&
            result.selfScore !== result.score
              ? `Chỉ huy chấm lại - bạn tự chấm ${result.selfScore}`
              : undefined
          }
        >
          {result.score === null ? "Chưa có điểm" : `${result.score} điểm`}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {summary.tracksProgress ? (
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
            Tiến độ
          </span>
          <div className="min-w-0 flex-1">
            <PercentCell
              percent={summary.progressPercent}
              change={summary.reviewChanges.find(
                (entry) => entry.field === "progress",
              )}
            />
          </div>
        </div>
      ) : null}
      {/* Chất lượng đứng riêng vì tiến độ 100% mà chất lượng 75% là chuyện
          bình thường - hai con số không thay nhau được. */}
      {summary.tracksQuality ? (
        <div className="flex items-center gap-2">
          <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
            Chất lượng
          </span>
          <div className="min-w-0 flex-1">
            <PercentCell
              percent={summary.qualityPercent}
              change={summary.reviewChanges.find(
                (entry) => entry.field === "quality",
              )}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Một dòng khối A trong danh sách - đọc theo đúng bộ cột của dòng nhiệm vụ.
 *
 * Bảng A không có trục, không có hạn, không có phần trăm tiến độ; những ô đó
 * bày thứ tương đương của nó (điểm đạt / tổng, số tiêu chí đã chấm) thay vì để
 * trống, nếu không dòng nhìn như một dòng hỏng.
 */
function CriteriaSummaryRow({
  sheet,
  showDeadline,
  readOnly,
  onOpen,
}: {
  sheet: PersonalCriteriaSheetSummary;
  showDeadline: boolean;
  /** Phải theo đúng bảng chứa nó, kẻo dòng này thừa một ô và lệch cả cột. */
  readOnly: boolean;
  onOpen?: (sheet: PersonalCriteriaSheetSummary) => void;
}) {
  const done = sheet.rowCount > 0 && sheet.scoredCount >= sheet.rowCount;
  const touchedAt = sheet.lastProgressAt ?? sheet.updatedAt;
  /** Còn sửa được thì mời chấm; đã chốt thì chỉ còn xem lại. */
  const editable = sheet.canEdit || sheet.canUpdate;

  return (
    <TableRow className="bg-muted/20">
      <TableCell className="max-w-[420px] whitespace-normal align-middle">
        {/* Kỳ luôn hiện, không phụ thuộc `showReportDate`: bảng chốt theo tháng
            nên không nói rõ tháng nào thì xem một tuần vắt qua hai tháng là
            hai dòng giống hệt nhau. */}
        <div className="text-xs text-muted-foreground tabular-nums">
          Chốt {formatCriteriaPeriod(sheet.period)}
        </div>
        <div className="break-words font-medium">Tiêu chí chung</div>
        <div className="break-words text-xs text-muted-foreground">
          Khối A · chốt kết quả cả tháng, cập nhật được hằng ngày
        </div>
      </TableCell>

      <TableCell className="align-middle">
        <Badge
          variant="secondary"
          className={cn("gap-1 font-normal", missionTone.success.soft)}
        >
          <span className="font-semibold">A</span>
          <span>Tiêu chí chung</span>
        </Badge>
      </TableCell>

      <TableCell className="align-middle">
        <div className="font-medium tabular-nums">
          {sheet.totalScore} / {sheet.maxScore} điểm
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {sheet.scoredCount}/{sheet.rowCount} tiêu chí đã chấm
        </div>
      </TableCell>

      {showDeadline ? (
        <TableCell className="align-middle text-xs text-muted-foreground">
          {touchedAt ? `Cập nhật ${formatYmd(touchedAt.slice(0, 10))}` : "-"}
        </TableCell>
      ) : null}

      <TableCell className="align-middle">
        <Badge
          variant="secondary"
          className={cn(
            "font-normal",
            done ? missionTone.success.soft : missionTone.warning.soft,
          )}
        >
          {done
            ? "Đã chấm đủ"
            : `Còn ${Math.max(0, sheet.rowCount - sheet.scoredCount)} tiêu chí`}
        </Badge>
      </TableCell>

      <TableCell className="align-middle">
        <Badge
          variant="secondary"
          className={personalMissionStatusBadgeClass(sheet.reviewStatus)}
          title={
            sheet.returnReason
              ? `Lý do trả lại: ${sheet.returnReason}`
              : undefined
          }
        >
          {PERSONAL_MISSION_STATUS_LABEL[sheet.reviewStatus]}
        </Badge>
      </TableCell>

      <TableCell className="align-middle text-sm text-muted-foreground">
        {sheet.recipientName || "-"}
      </TableCell>

      {readOnly ? null : (
        <TableCell className="text-right align-middle">
          <Button
            size="sm"
            variant="outline"
            className="bg-background"
            onClick={() => onOpen?.(sheet)}
            disabled={!onOpen}
            title={
              editable
                ? "Mở bảng tiêu chí chung của ngày này"
                : "Đã chốt - xem lại bảng và nhật ký"
            }
          >
            {editable ? (
              <>
                <Pencil className="h-4 w-4" />
                Chấm bảng A
              </>
            ) : (
              <>
                <Eye className="h-4 w-4" />
                Xem bảng A
              </>
            )}
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
}

/**
 * Bảng nhiệm vụ - dùng chung cho cả xem phẳng lẫn xem theo nhóm.
 *
 * Nhóm nào toàn nhiệm vụ của trục chấm theo mục (trục 2) thì đổi bộ cột: trục
 * kiểu đó không có tiến độ, không có chất lượng %, để nguyên thì mỗi dòng ghi
 * "Không theo dõi %" hai lần mà chẳng nói được kết quả ra sao. Đúng luật đang
 * dùng ở màn theo dõi của chỉ huy.
 */
export function DayTaskTable({
  rows,
  criteriaRows = [],
  onOpenCriteria,
  deadlineHeader,
  loading = false,
  emptyText,
  actingId,
  hideHeader = false,
  showReportDate = false,
  axisOrderById,
  readOnly = false,
  onUpdateProgress,
  onEditDetail,
  onSend,
  onDelete,
}: DayTaskTableProps) {
  /*
    Cột hạn giữ lại khi còn dòng nào khai hạn hoặc theo dõi tiến độ - danh sách
    toàn trục chấm theo mục thì cột này rỗng trơn.
  */
  const showDeadline = rows.some(
    (row) => Boolean(row.summary.deadline) || row.summary.tracksProgress,
  );
  // Bớt một khi ẩn cột "Thao tác": ô "chưa có dữ liệu" căn theo colSpan này,
  // lệch số là nó không trải hết bảng.
  const columnCount = (showDeadline ? 8 : 7) - (readOnly ? 1 : 0);

  return (
    <Table>
      {hideHeader ? null : (
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[280px]">Nhiệm vụ</TableHead>
            <TableHead className="w-[110px]">Biểu mẫu</TableHead>
            {/* MỘT cột kết quả, tự đổi cách bày theo mẫu của từng dòng. Hai cột
                cố định Tiến độ / Chất lượng chỉ đúng với trục chấm theo tỉ lệ;
                danh sách trộn nhiều trục thì dòng của trục Đạt/Không đạt ghi
                "Không theo dõi %" hai lần mà chẳng nói được kết quả ra sao. */}
            <TableHead className="w-[190px]">Kết quả nhiệm vụ</TableHead>
            {showDeadline ? (
              <TableHead className="w-[150px]">{deadlineHeader}</TableHead>
            ) : null}
            <TableHead className="w-[170px]">Tình trạng thực hiện</TableHead>
            <TableHead className="w-[130px]">Trạng thái duyệt</TableHead>
            <TableHead className="w-[160px]">Cấp trên theo dõi</TableHead>
            {readOnly ? null : (
              <TableHead className="w-[170px] text-right">Thao tác</TableHead>
            )}
          </TableRow>
        </TableHeader>
      )}
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell
              colSpan={columnCount}
              className="h-28 text-center text-muted-foreground"
            >
              Đang tải...
            </TableCell>
          </TableRow>
        ) : rows.length === 0 && criteriaRows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={columnCount}
              className="h-28 text-center text-muted-foreground"
            >
              <div className="inline-flex flex-col items-center gap-2">
                <ClipboardList className="h-8 w-8 opacity-40" />
                <span>{emptyText}</span>
              </div>
            </TableCell>
          </TableRow>
        ) : null}

        {criteriaRows.map((sheet) => (
          <CriteriaSummaryRow
            key={sheet.sheetId ?? sheet.period}
            sheet={sheet}
            showDeadline={showDeadline}
            readOnly={readOnly}
            onOpen={onOpenCriteria}
          />
        ))}

        {loading
          ? null
          : rows.map((row) => {
              const { item, summary, deadline, work } = row;
              const health = deadlineHealth(row);
              return (
                <TableRow key={item.id}>
                  {/* break-words: tên nhiệm vụ có thể là chuỗi dài không dấu
                    cách, không bẻ thì nó tràn sang cột bên cạnh. */}
                  <TableCell className="max-w-[420px] whitespace-normal align-middle">
                    {showReportDate && item.reportDate ? (
                      <div className="text-xs text-muted-foreground tabular-nums">
                        Ngày {formatYmd(item.reportDate)}
                      </div>
                    ) : null}
                    <div className="break-words font-medium">
                      {summary.title || item.workContentName}
                    </div>
                    {summary.title ? (
                      <div className="break-words text-xs text-muted-foreground">
                        {item.workContentName}
                      </div>
                    ) : null}
                  </TableCell>

                  <TableCell className="align-middle">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "max-w-full gap-1 truncate font-normal",
                        missionTone.info.soft,
                      )}
                      title={item.axisName}
                    >
                      {/* Số hiệu khối (B1, B2…) để đối chiếu thẳng với bản in;
                        không truyền thứ tự thì chỉ hiện tên trục. */}
                      {axisOrderById?.get(item.axisId) ? (
                        <span className="font-semibold">
                          B{axisOrderById.get(item.axisId)}
                        </span>
                      ) : null}
                      <span className="truncate">{item.axisName}</span>
                    </Badge>
                  </TableCell>

                  <TableCell className="align-middle">
                    <MissionResultCell row={row} />
                  </TableCell>

                  {showDeadline ? (
                    <TableCell className="align-middle">
                      <DeadlineCell
                        deadline={summary.deadline}
                        state={deadline}
                      />
                    </TableCell>
                  ) : null}

                  {/* Việc chạy tới đâu - theo tiến độ và hạn. */}
                  <TableCell className="align-middle">
                    <div className="flex flex-wrap gap-1">
                      <WorkStateBadge work={work} />
                      {health ? (
                        <Badge
                          variant="secondary"
                          className={cn("font-normal", health.className)}
                        >
                          {health.label}
                        </Badge>
                      ) : null}
                      {isSilent(row) ? (
                        <Badge
                          variant="secondary"
                          className={cn(
                            "font-normal",
                            missionTone.warning.soft,
                          )}
                          title="Số ngày liên tiếp không ai cập nhật tiến độ việc này"
                        >
                          {row.silence} ngày chưa cập nhật
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>

                  {/* Việc đang ở chặng nào của luồng duyệt. */}
                  <TableCell className="align-middle">
                    {/* Lý do trả lại không bày ra bảng - dòng nào cũng vài chục
                      chữ thì bảng chỉ còn là bức tường chữ. Để ở tooltip, đọc
                      đầy đủ trong ô "Cập nhật". */}
                    <Badge
                      variant="secondary"
                      className={personalMissionStatusBadgeClass(item.status)}
                      title={
                        item.rejectReason
                          ? `Lý do trả lại: ${item.rejectReason}`
                          : undefined
                      }
                    >
                      {PERSONAL_MISSION_STATUS_LABEL[item.status]}
                    </Badge>
                    {/* Cán bộ phải thấy ngay mình bị hạ điểm, và hạ ở ô nào. */}
                    {summary.reviewLowered ? (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "mt-1 font-normal",
                          missionTone.danger.soft,
                        )}
                        title={summary.reviewChanges
                          .map(
                            (change) =>
                              `${change.groupTitle ? `${change.groupTitle} · ` : ""}${change.title}: ${change.from}% → ${change.to}%`,
                          )
                          .join("; ")}
                      >
                        Bị hạ điểm
                      </Badge>
                    ) : null}
                  </TableCell>

                  <TableCell className="align-middle text-sm text-muted-foreground">
                    {item.recipientName ?? "-"}
                  </TableCell>

                  {readOnly ? null : (
                    <TableCell className="text-right align-middle">
                      <div className="inline-flex items-center gap-1">
                        {/* Việc đã chốt thì nút đổi thành xem lại - vẫn phải tra
                          được nhật ký tiến độ chứ không khoá cứng. */}
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-background"
                          onClick={() => onUpdateProgress?.(item)}
                          disabled={actingId === item.id}
                          title={
                            canUpdateProgress(item.status)
                              ? "Cập nhật tiến độ hôm nay - gửi rồi vẫn cập nhật được"
                              : "Đã chốt hoàn thành - xem lại nhật ký tiến độ"
                          }
                        >
                          {canUpdateProgress(item.status) ? (
                            <>
                              <Pencil className="h-4 w-4" />
                              Cập nhật
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4" />
                              Xem tiến độ
                            </>
                          )}
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Thao tác khác"
                              disabled={actingId === item.id}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onSelect={() => onEditDetail?.(item)}
                              disabled={!canEditPersonalMission(item.status)}
                            >
                              <SquarePen className="h-4 w-4" />
                              Sửa chi tiết
                            </DropdownMenuItem>
                            {/* Chỉ dòng đã từng gửi (bị trả lại rồi sửa) mới gửi lẻ
                              được; báo cáo mới thì gửi cả lượt ở trên. */}
                            {item.status === "DRAFT" && item.sentAt ? (
                              <DropdownMenuItem onSelect={() => onSend?.(item)}>
                                <Send className="h-4 w-4" />
                                Gửi lại nhiệm vụ này
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => onDelete?.(item)}
                              disabled={!canDeletePersonalMission(item.status)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              Xoá nhiệm vụ
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
      </TableBody>
    </Table>
  );
}
