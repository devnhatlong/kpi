"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  Building2,
  CalendarRange,
  Check,
  ChevronRight,
  FileDown,
  History,
  Loader2,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  TriangleAlert,
  Trophy,
  Undo2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/common/searchable-select";
import {
  changeTeamReportSummaryTasks,
  decideTeamReportSummary,
  deleteTeamReportSummary,
  editTeamReportSummaryRows,
  fetchTeamReportRecipients,
  fetchTeamReportSummaryCandidates,
  reviewTeamReportSummary,
  sendTeamReportSummary,
  teamReportKeys,
  type TeamReportReviewRow,
  type TeamReportSummaryDetail,
  type TeamReportSummaryLevel,
} from "@/features/team-report/api";
import { DynamicColumnCell } from "@/features/team-report/components/dynamic-column-cell";
import { TeamReportCriteriaPreview } from "@/features/team-report/components/team-report-criteria-preview";
import { exportTeamReportToExcel } from "@/features/team-report/excel";
import {
  DAY_STATUS_CLASS,
  scoreTone,
} from "@/features/team-report/status-styles";
import {
  TEAM_REPORT_PERIOD_LABEL,
  TEAM_REPORT_STATUS_LABEL,
  catalogOfColumn,
  entryColumnKeys,
  formatScore,
  inputColumns,
  refId,
  refName,
  type TeamReportAxisScore,
  type TeamReportDayRow,
  type TeamReportFormula,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatYmd, formatServerHm } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/**
 * Bảng điểm theo trục - con số thật sự vào bảng KPI.
 *
 * Bày cả tỉ lệ lẫn điểm quy đổi: chỉ có điểm thì không ai kiểm được nó ra từ
 * đâu, mà đây là số cấp trên sẽ ký.
 */
function AxisScoreBoard({
  axisScores,
  totalScore,
  totalMax,
}: {
  axisScores: TeamReportAxisScore[];
  totalScore: number;
  totalMax: number;
}) {
  /*
    Chưa trục nào chấm được thì tổng là CHƯA CHẤM, không phải 0 điểm.

    Cộng `convertedScore ?? 0` sẽ ra 0/40 và tô đỏ - đọc thành "làm được 0 điểm"
    trong khi thật ra chưa ai chấm ô nào. Hai chuyện khác hẳn nhau, mà đây lại
    là con số đập vào mắt đầu tiên.
  */
  const scored = axisScores.some((axis) => axis.convertedScore !== null);
  const totalRatio = scored && totalMax > 0 ? totalScore / totalMax : null;
  const totalTone = scoreTone(totalRatio);

  return (
    <div className="overflow-hidden rounded-md border">
      {/* Tổng cả báo cáo đứng đầu và to hẳn: đây là con số cấp trên sẽ ký, phần
          còn lại chỉ giải thích nó ra từ đâu. */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3",
          totalTone.badge || "bg-muted/40",
        )}
      >
        <div className="flex items-center gap-2">
          <Trophy className="size-4" />
          <h3 className="font-display text-sm font-semibold">
            Tổng điểm báo cáo
          </h3>
        </div>
        {scored ? (
          <p className="tabular-nums">
            <strong className="font-display text-2xl">
              {formatScore(totalScore)}
            </strong>
            <span className="text-sm opacity-70">
              {" "}
              / {formatScore(totalMax)} điểm
            </span>
            {totalRatio === null ? null : (
              <span className="ml-2 text-sm opacity-70">
                ({formatScore(totalRatio * 100)}%)
              </span>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Chưa chấm được ô nào · trần {formatScore(totalMax)} điểm
          </p>
        )}
      </div>

      <div className="divide-y">
        {axisScores.map((axis) => {
          const tone = scoreTone(axis.axisScore);
          return (
            <div
              key={axis.axisId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{axis.axisName}</p>
                <p className="text-xs text-muted-foreground">
                  {axis.taskCount} nhiệm vụ
                  {axis.axisScore === null
                    ? " · chưa đủ dữ liệu để tính"
                    : ` · đạt ${formatScore(axis.axisScore * 100)}%`}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Thanh tỉ lệ chỉ để liếc nhanh; con số bên cạnh mới là thứ chốt. */}
                <div className="hidden h-2 w-28 overflow-hidden rounded-full bg-muted sm:block">
                  <div
                    className={cn("h-full rounded-full", tone.bar)}
                    style={{
                      width: `${Math.min(100, Math.max(0, (axis.axisScore ?? 0) * 100))}%`,
                    }}
                  />
                </div>
                <span className="tabular-nums text-sm">
                  <strong className={tone.text}>
                    {axis.convertedScore === null
                      ? "-"
                      : formatScore(axis.convertedScore)}
                  </strong>
                  <span className="text-muted-foreground">
                    {" "}
                    / {axis.maxScore}
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Một dòng công thức của mẫu giấy, viết cả bằng KÝ HIỆU lẫn bằng SỐ THẬT.
 *
 * Mẫu giấy chỉ ghi "[(B/A)+(C/A)] / 2" - đọc xong vẫn phải tự tra B, C, A là
 * cột nào rồi tự nhân chia. Bày thêm hàng số bên dưới thì kiểm được ngay con số
 * ra từ đâu, đó mới là thứ người duyệt cần.
 *
 * Truyền `converted` = dòng "Điểm quy đổi", không truyền = dòng "Tổng điểm trục".
 */
function FormulaLine({
  formula,
  ratio,
  maxScore,
  converted,
}: {
  formula: TeamReportFormula;
  ratio: number | null;
  maxScore: number;
  converted?: number | null;
}) {
  const isConverted = converted !== undefined;
  const num = (value: number | null) =>
    value === null ? "?" : formatScore(value);

  /* Cộng dồn: điểm trục là tổng các cột tử số, chặn ở trần trục. */
  if (formula.mode === "sum") {
    const symbols = formula.parts.map((part) => part.role).join(" + ");
    const numbers = formula.parts.map((part) => num(part.total)).join(" + ");
    return (
      <span className="inline-flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
        <span className="font-mono text-sm">
          {isConverted ? `min(${symbols}; ${maxScore})` : symbols}
        </span>
        <span className="text-xs text-muted-foreground">
          = {isConverted ? `min(${numbers}; ${maxScore})` : numbers}
        </span>
        <strong className="tabular-nums">
          ={" "}
          {isConverted
            ? num(converted ?? null)
            : num(ratio === null ? null : ratio * maxScore)}
        </strong>
      </span>
    );
  }

  const base = formula.base;
  const inner = formula.parts
    .map((part) => `(${part.role}/${base?.role ?? "A"})`)
    .join("+");
  const innerNumbers = formula.parts
    .map((part) => `(${num(part.total)}/${num(base?.total ?? null)})`)
    .join("+");
  const divisor = formula.parts.length;

  const symbols = `[${inner}] / ${divisor}`;
  const numbers = `[${innerNumbers}] / ${divisor}`;

  return (
    <span className="inline-flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
      <span className="font-mono text-sm">
        {isConverted ? `(${symbols}) × ${maxScore}` : symbols}
      </span>
      <span className="text-xs text-muted-foreground">
        = {isConverted ? `(${numbers}) × ${maxScore}` : numbers}
      </span>
      <strong className="tabular-nums">
        = {isConverted ? num(converted ?? null) : num(ratio)}
      </strong>
    </span>
  );
}

type PanelProps = {
  detail: TeamReportSummaryDetail;
  /**
   * Đang đứng ở vai nào.
   *
   * `OWNER` - đội lập bản: trình đi, xoá nháp.
   * `REVIEWER` - cấp trên nhận bản: duyệt hoặc trả lại.
   *
   * Cùng một khung nội dung vì cách ĐỌC một bản là y hệt nhau; chỉ khác đúng
   * nhóm nút, nên tách hai component là chép đôi cả bảng chấm.
   */
  role?: "OWNER" | "REVIEWER";
  /**
   * Bản này do ĐỘI lập hay do PHÒNG lập - quyết định gọi bộ route nào.
   *
   * Chỉ có nghĩa với vai `OWNER`. Vai `REVIEWER` đọc bản của cấp dưới qua đường
   * hộp đến, đường đó chung cho mọi cấp.
   */
  level?: TeamReportSummaryLevel;
  onChanged: () => void | Promise<void>;
  onDeleted?: () => void | Promise<void>;
};

/**
 * Nội dung một bản tổng hợp.
 *
 * Bản NHÁP thì còn trình đi hoặc xoá được; bản đã trình chỉ đọc với đội - nó là
 * thứ cấp trên đang cầm, sửa hay xoá ở đây là rút mất cái họ đang duyệt.
 */
export function TeamReportSummaryPanel({
  detail,
  role = "OWNER",
  level = "TEAM",
  onChanged,
  onDeleted,
}: PanelProps) {
  /*
    `catalogs` CHỈ dùng cho ô đang mở khoá, để đổ danh sách chọn.

    Ô chỉ đọc thì đọc thẳng TÊN đã lưu trong bản chụp - đúng cái tên tại thời
    điểm trình, kể cả khi danh mục đổi tên về sau. Tra lại danh mục để hiện tên
    ở ô chỉ đọc là cố tình bày một cái tên khác với cái đã trình.
  */
  const { summary, templates, catalogs, axisScores } = detail;
  /* Tên đơn vị lập bản. Server trả riêng ở `department` vì `departmentId` cố ý
     không populate; `refName` chỉ ăn khi bản tới từ danh sách đã populate. */
  const unitName = detail.department?.name || refName(summary.departmentId);
  const [sendOpen, setSendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [recipientId, setRecipientId] = useState("");
  const [note, setNote] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  /* Trục nào đang mở. Thu sẵn tất cả: mở báo cáo ra là nhìn điểm trước, cần
     xem chi tiết trục nào thì bấm mở trục đó. */
  const [openAxes, setOpenAxes] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addPicked, setAddPicked] = useState<Set<string>>(new Set());
  const [addQuery, setAddQuery] = useState("");
  /* Mở hộp thêm từ khối trục nào thì chỉ bày việc của trục đó - đứng ở Trục 2
     mà danh sách đổ ra cả bốn trục thì phải tự dò lại từng dòng. `null` là mở
     từ nút chung: bày tất, kể cả trục báo cáo chưa có dòng nào. */
  const [addAxisId, setAddAxisId] = useState<string | null>(null);
  /* Lọc theo ĐỘI trong hộp thêm - chỉ bản của phòng mới có. Lọc ở server vì kho
     có trần dòng, lọc tại chỗ thì đội cuối danh sách có thể đã bị cắt. */
  const [addDeptId, setAddDeptId] = useState<string | null>(null);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  /*
    Ô nào vừa bị server từ chối, khoá `<id nhiệm vụ>:<khoá cột>`.

    Báo ngay tại ô chứ không chỉ nổi một cái toast ở góc: bảng này rộng và có
    hàng chục ô: đọc "Cột Điểm phải trong 0-50" rồi phải tự dò xem dòng nào, ô
    nào thì lỗi nằm xa hẳn chỗ phải sửa.
  */
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  /*
    Cấp trên phải BẤM "Sửa" mới mở khoá bảng.

    Màn duyệt phần lớn thời gian là đọc; để ô gõ được sẵn thì một cú bấm nhầm là
    đổi con số trên bản chính thức mà không ai nhận ra. Bấm một lần để vào chế
    độ sửa là ranh giới rõ ràng giữa "đang đọc" và "đang chấm lại".
  */
  const [editMode, setEditMode] = useState(false);

  const reviewer = role === "REVIEWER";
  const draft = summary.status === "DRAFT";
  /* Duyệt / trả lại chỉ khi bản đang chờ: đã duyệt thì rút lại quyết định cấp
     dưới đã thấy, đã trả lại thì bóng đang ở bên đội. */
  const decidable = reviewer && summary.status === "PENDING";

  /*
    Ai được chấm lại, lúc nào:

    - Đội: chỉ khi bản CÒN NHÁP. Gửi rồi là bản cấp trên đang cầm, đổi số dưới
      tay họ mà không ai báo là chuyện khác hẳn.
    - Cấp trên: khi bản đang chờ duyệt hoặc đã trả lại. Duyệt xong thì thôi.

    Server chặn y hệt - chỗ này chỉ để khỏi bày ra ô gõ được rồi bị từ chối.
  */
  /*
    Ai được mở khoá bảng, lúc nào:

    - Đội: bản chưa trình, hoặc bị trả lại. Bị trả lại đúng là lúc cần sửa nhất
      - cấp trên vừa nói thiếu chỗ nào thì phải chữa được rồi trình lại.
    - Cấp trên: bản đang chờ duyệt hoặc đã trả lại. Duyệt xong thì thôi.

    Hai bên không bao giờ cùng mở khoá: bản PENDING thì đội đã hết quyền, bản
    DRAFT thì cấp trên chưa nhìn thấy. Riêng RETURNED thì đội đang giữ bóng.
  */
  const canEdit = reviewer
    ? summary.status === "PENDING"
    : draft || summary.status === "RETURNED";
  const editable = canEdit && editMode;
  /* Đổi danh sách nhiệm vụ: chỉ đội, và chỉ khi bản chưa trình hoặc bị trả lại.
     Không đòi bấm "Sửa điểm" trước - thêm bớt dòng là thao tác riêng, thấy ngay
     nút là làm được. */
  const canChangeTasks = !reviewer && (draft || summary.status === "RETURNED");
  /* Trình đi được ở đúng những trạng thái đội đang giữ bóng - cùng luật với
     `sendSummary` bên server, để nút không bao giờ bày ra rồi bị từ chối. */
  const canSend = !reviewer && (draft || summary.status === "RETURNED");

  const { data: recipients = [] } = useSWR(
    sendOpen ? teamReportKeys.recipients(level) : null,
    () => fetchTeamReportRecipients(undefined, level),
  );

  /*
    Kho để thêm: CẢ kho nhiệm vụ của đội, không bó trong kỳ của báo cáo.

    Lọc theo kỳ ở đây là chặt hơn cả luật thật - `changeSummaryTasks` bên server
    chỉ đòi việc phải sẵn sàng, chứ không hỏi nó thuộc kỳ nào. Việc đóng hôm
    trước kỳ vẫn có thể là thứ cần đưa vào bản tuần này, nên bày ra hết rồi đánh
    dấu "ngoài kỳ", chứ không giấu đi.
  */
  const { data: addData, isLoading: addLoading } = useSWR(
    addOpen
      ? teamReportKeys.summaryCandidates(
          summary.fromDate,
          summary.toDate,
          addQuery.trim(),
          "ALL",
          level,
          addDeptId ?? "",
        )
      : null,
    () =>
      fetchTeamReportSummaryCandidates({
        fromDate: summary.fromDate,
        toDate: summary.toDate,
        q: addQuery.trim(),
        scope: "ALL",
        level,
        ...(addDeptId ? { departmentIds: [addDeptId] } : {}),
      }),
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const inReport = useMemo(
    () => new Set(summary.rows.map((row) => String(row.taskId))),
    [summary.rows],
  );
  /*
    Bản này có trộn việc của NHIỀU đội không.

    Suy từ chính dữ liệu chứ không từ `level`: cấp trên mở bản của phòng qua
    đường hộp đến, ở đó `level` luôn là "TEAM" mà bản thì vẫn nhiều đội - cột
    tên đội phải hiện theo bản, không theo đường vào.
  */
  const multiUnit = useMemo(
    () =>
      new Set(
        summary.rows
          .map((row) => String(row.departmentId ?? ""))
          .filter(Boolean),
      ).size > 1,
    [summary.rows],
  );
  /** Các trục có mặt trong kho - để đổi trục ngay trong hộp thoại. */
  const addAxes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of addData?.tasks ?? []) {
      const id = refId(row.task.axisId);
      if (id && !seen.has(id)) seen.set(id, refName(row.task.axisId) || id);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [addData]);

  const addable = useMemo(
    () =>
      (addData?.tasks ?? [])
        .filter(
          (row) =>
            !inReport.has(row.task._id) &&
            (!addAxisId || refId(row.task.axisId) === addAxisId),
        )
        /* Việc trong kỳ lên trước: đó vẫn là thứ hay cần nhất, việc ngoài kỳ
           chỉ là trường hợp bổ sung. */
        .sort(
          (a, b) =>
            Number(b.inPeriod ?? true) - Number(a.inPeriod ?? true) ||
            b.task.createdDate.localeCompare(a.task.createdDate),
        ),
    [addData, inReport, addAxisId],
  );
  /* Tên trục để ghi lên tiêu đề hộp thoại - lấy từ khối đang đứng, không phải
     từ kho, vì kho có thể chưa nạp xong lúc mở. */
  const addAxisName = addAxisId
    ? (summary.rows.find((row) => refId(row.axisId) === addAxisId)?.axisName ??
      addAxes.find((axis) => axis.id === addAxisId)?.name ??
      "")
    : "";

  /** Các đội bên dưới - rỗng với bản của đội, nên ô lọc tự ẩn. */
  const addDepartments = useMemo(() => addData?.departments ?? [], [addData]);

  const openAddDialog = (axisId: string | null) => {
    setAddAxisId(axisId);
    setAddDeptId(null);
    setAddPicked(new Set());
    setAddQuery("");
    setAddOpen(true);
  };

  /*
    Gom theo TRỤC, không theo mẫu.

    Trục 1, 3, 4 dùng chung một mẫu - gom theo mẫu là ba trục dồn vào một khối
    mang nhãn "Trục 1", và dòng tổng ra một con số không thuộc trục nào. Điểm
    thì chấm theo trục, nên khối cũng phải theo trục.
  */
  const groups = useMemo(() => {
    const byAxis = new Map<string, TeamReportDayRow[]>();
    for (const row of summary.rows) {
      const key = refId(row.axisId) || "";
      byAxis.set(key, [...(byAxis.get(key) ?? []), row]);
    }

    return [...byAxis.entries()].map(([axisId, rows]) => {
      const score = axisScores.find((item) => item.axisId === axisId) ?? null;
      /* Bộ cột lấy theo phiên bản mẫu MỚI NHẤT trong nhóm - giống hệt cách
         server chọn để tính dòng tổng, nếu không thì tiêu đề một đằng số một
         nẻo. */
      const templateKey =
        score?.templateKey ||
        rows
          .filter((row) => row.formTemplateId)
          .map((row) => `${row.formTemplateId}:${row.formTemplateVersion ?? 1}`)
          .sort()
          .pop() ||
        "";
      return {
        key: axisId || "__no_axis__",
        templateKey,
        template: templates[templateKey] ?? null,
        axisName: rows[0]?.axisName ?? "",
        rows,
        score,
      };
    });
  }, [summary.rows, templates, axisScores]);

  /** Tổng điểm cả bản - cộng điểm quy đổi của các trục. */
  const totalScore = axisScores.reduce(
    (sum, item) => sum + (item.convertedScore ?? 0),
    0,
  );
  const totalMax = axisScores.reduce((sum, item) => sum + item.maxScore, 0);

  /*
    Xuất Excel dựng từ CHÍNH dữ liệu đang mở, không gọi lại server: bản chụp và
    điểm trục đều đã có sẵn trong `detail`, gọi lại chỉ để nhận đúng thứ đang
    cầm - và có nguy cơ file khác với thứ vừa đọc trên màn.
  */
  const exportExcel = async () => {
    setExporting(true);
    try {
      await exportTeamReportToExcel({
        title: summary.title,
        /* Tên tệp kèm đơn vị: cấp trên tải về hàng chục bản cùng kỳ, tên giống
           hệt nhau thì mở ra mới biết của ai. */
        fileTitle: unitName ? `${summary.title} - ${unitName}` : summary.title,
        meta: [
          unitName || "Đơn vị lập",
          `Kỳ ${formatYmd(summary.fromDate)} - ${formatYmd(summary.toDate)}`,
          TEAM_REPORT_PERIOD_LABEL[summary.period],
          `${summary.rows.length} nhiệm vụ`,
          draft ? "Nháp" : TEAM_REPORT_STATUS_LABEL[summary.status],
          summary.recipientName ? `Trình ${summary.recipientName}` : "",
        ]
          .filter(Boolean)
          .join("   ·   "),
        note: summary.note,
        rows: summary.rows,
        templates,
        axisScores,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xuất được file Excel."));
    } finally {
      setExporting(false);
    }
  };

  const send = async () => {
    if (!recipientId) {
      toast.error("Chọn cấp trên nhận báo cáo.");
      return;
    }
    setBusy(true);
    try {
      await sendTeamReportSummary(
        summary._id,
        { recipientId, note: note.trim() || undefined },
        level,
      );
      setSendOpen(false);
      await onChanged();
      toast.success("Đã trình báo cáo lên cấp trên.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không trình được báo cáo."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteTeamReportSummary(summary._id, level);
      setDeleteOpen(false);
      await onDeleted?.();
      toast.success("Đã xoá bản nháp.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được."));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Lưu một ô vừa sửa.
   *
   * Tự lưu từng ô như tab Phân loại, không gom vào một nút "Lưu": bản này có
   * thể vài trăm dòng, giữ bản nháp của cả bảng trong màn hình rồi lưu một lượt
   * là đè mất phần người khác vừa sửa.
   *
   * Không hỏi lý do: ai sửa, sửa gì, lúc nào đã có trong nhật ký - đó là thứ
   * để trace, còn bắt gõ lý do trước mỗi lượt chấm chỉ làm người duyệt bực.
   */
  const saveCell = async (taskId: string, patch: TeamReportReviewRow) => {
    /* Mỗi lượt lưu chỉ đụng vào một ô, nên khoá đầu tiên chính là ô vừa gõ - đủ
       để gắn câu từ chối của server vào đúng ô đó. */
    const touched =
      Object.keys(patch.fieldValues ?? {})[0] ??
      Object.keys(patch.catalogValues ?? {})[0] ??
      null;
    const errorKey = touched ? `${taskId}:${touched}` : null;

    setSavingCell(taskId);
    try {
      if (reviewer) {
        await reviewTeamReportSummary(summary._id, { rows: [patch] });
      } else {
        await editTeamReportSummaryRows(summary._id, [patch], level);
      }
      await onChanged();
      setSavedAt(formatServerHm(Date.now()));
      if (errorKey) {
        setCellErrors((prev) => {
          if (!(errorKey in prev)) return prev;
          const next = { ...prev };
          delete next[errorKey];
          return next;
        });
      }
    } catch (error) {
      const message = getApiErrorMessage(error, "Không lưu được.");
      if (errorKey) {
        /* KHÔNG nạp lại: nạp lại là đẩy giá trị server về, xoá mất con số người
           dùng vừa gõ - tức xoá luôn thứ họ cần sửa. Cũng không bắn toast, đã
           có chữ đỏ ngay dưới ô. */
        setCellErrors((prev) => ({ ...prev, [errorKey]: message }));
      } else {
        toast.error(message);
        await onChanged();
      }
    } finally {
      setSavingCell(null);
    }
  };

  /**
   * Thêm / bớt nhiệm vụ khỏi bản.
   *
   * Chỉ đội làm được, và chỉ khi bản chưa trình hoặc bị trả lại - cấp trên thấy
   * thiếu thì trả lại kèm lý do, không tự bốc việc vào bản của đội.
   */
  const changeTasks = async (input: { add?: string[]; remove?: string[] }) => {
    setBusy(true);
    try {
      const result = await changeTeamReportSummaryTasks(
        summary._id,
        input,
        level,
      );
      await onChanged();
      toast.success(
        result.rows?.length
          ? `Báo cáo còn ${result.rows.length} nhiệm vụ.`
          : "Đã cập nhật danh sách nhiệm vụ.",
      );
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không đổi được danh sách."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: "APPROVE" | "RETURN") => {
    if (decision === "RETURN" && !returnReason.trim()) {
      toast.error("Nêu lý do trả lại để đội biết phải sửa gì.");
      return;
    }
    setBusy(true);
    try {
      await decideTeamReportSummary(summary._id, {
        decision,
        reason: returnReason.trim() || undefined,
      });
      setReturnOpen(false);
      setReturnReason("");
      await onChanged();
      toast.success(decision === "RETURN" ? "Đã trả lại." : "Đã duyệt.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không thực hiện được."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="space-y-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1.5">
            <h2 className="break-words font-display text-lg font-semibold">
              {summary.title}
            </h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {/* Đơn vị lập đứng ĐẦU dòng thông tin và in đậm: mở hộp duyệt ra,
                  câu hỏi đầu tiên luôn là "bản này của ai". */}
              {unitName ? (
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Building2 className="size-3.5" />
                  {unitName}
                </span>
              ) : null}
              <span className="flex items-center gap-1.5 tabular-nums">
                <CalendarRange className="size-3.5" />
                {formatYmd(summary.fromDate)} - {formatYmd(summary.toDate)}
                {" · "}
                {TEAM_REPORT_PERIOD_LABEL[summary.period]}
              </span>
              {summary.recipientName ? (
                <span className="flex items-center gap-1.5">
                  <User className="size-3.5" />
                  Trình {summary.recipientName}
                  {summary.sentAt
                    ? ` lúc ${formatServerHm(summary.sentAt)}`
                    : ""}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tự lưu nên phải nói rõ đã lưu chưa - không có nút Lưu nào cả. */}
            {savingCell ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Đang lưu
              </span>
            ) : savedAt ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="size-3 text-emerald-600" />
                Đã lưu lúc {savedAt}
              </span>
            ) : null}
            <Badge
              variant="secondary"
              className={cn(
                "whitespace-nowrap font-normal",
                DAY_STATUS_CLASS[summary.status],
              )}
            >
              {draft ? "Nháp" : TEAM_REPORT_STATUS_LABEL[summary.status]}
            </Badge>

            {/* Xuất được ở MỌI trạng thái, cả hai vai: bản nháp cũng cần in ra
                đọc soát trước khi trình, bản đã duyệt là thứ đem nộp. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="bg-background"
              disabled={exporting || !summary.rows.length}
              onClick={() => void exportExcel()}
            >
              {exporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" />
              )}
              Xuất Excel
            </Button>

            {/*
              Vào chế độ sửa là một hành động riêng cho CẢ HAI vai, không phải
              trạng thái mặc định: bảng gõ được sẵn thì một cú bấm nhầm là đổi
              một con số mà không ai nhận ra.

              Chỉ khác ở chỗ cấp trên phải nêu lý do trước - họ sửa số của người
              khác, còn đội sửa bản của chính mình.
            */}
            {canEdit ? (
              editMode ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setEditMode(false)}
                >
                  <Check className="size-4" />
                  Xong, khoá lại
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-background"
                  disabled={busy}
                  onClick={() => {
                    setEditMode(true);
                    /* Mở luôn các trục: bấm Sửa xong mà bảng vẫn thu hết thì
                       không có ô nào để gõ, phải đi mở từng trục mới sửa được. */
                    setOpenAxes(new Set(groups.map((group) => group.key)));
                  }}
                >
                  <Pencil className="size-4" />
                  Sửa điểm
                </Button>
              )
            ) : null}

            {decidable ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-background"
                  disabled={busy}
                  onClick={() => {
                    setReturnReason("");
                    setReturnOpen(true);
                  }}
                >
                  <Undo2 className="size-4" />
                  Trả lại
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={() => void decide("APPROVE")}
                >
                  <Check className="size-4" />
                  Duyệt
                </Button>
              </>
            ) : null}

            {/* Xoá thì chỉ bản nháp: bản bị trả lại đã từng đi lên, cấp trên có
                nhắc tới nó trong lý do trả lại. */}
            {draft && !reviewer ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label="Xoá bản nháp"
                title="Xoá bản nháp"
                className="text-destructive hover:text-destructive"
                disabled={busy}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-4" />
              </Button>
            ) : null}

            {/*
              Trình được cả bản NHÁP lẫn bản BỊ TRẢ LẠI.

              Thiếu nút ở bản bị trả lại là bế tắc hoàn toàn: sửa xong rồi đứng
              đó, đường duy nhất là lập một bản mới trong khi lý do trả lại nằm
              ở bản cũ.
            */}
            {canSend ? (
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => {
                  /* Bản bị trả lại đã có người nhận từ lượt trước - điền sẵn để
                     khỏi phải chọn lại đúng người đó. */
                  setRecipientId(refId(summary.recipientId) || "");
                  setNote(summary.note ?? "");
                  setSendOpen(true);
                }}
              >
                <Send className="size-4" />
                {draft ? "Trình cấp trên" : "Trình lại"}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Đang mở khoá thì phải thấy rõ - bảng chỉ đọc và bảng gõ được nhìn
            gần giống nhau, mà hậu quả thì khác hẳn. */}
        {editable ? (
          <p className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <Pencil className="size-4 shrink-0" />
            <span>
              Đang sửa điểm. Mỗi ô tự lưu ngay khi chọn hoặc rời ô, ghi thẳng
              vào nhiệm vụ gốc và vào nhật ký bên dưới.
            </span>
          </p>
        ) : null}

        {summary.returnReason ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            Cấp trên trả lại: {summary.returnReason}
          </p>
        ) : null}

        {summary.note ? (
          <p className="rounded-md border bg-muted/40 px-3 py-2.5 text-sm">
            <span className="text-muted-foreground">Ghi chú: </span>
            {summary.note}
          </p>
        ) : null}

        {/* Bảng điểm đứng TRƯỚC chi tiết: người duyệt cần con số chốt trước, chi
            tiết chỉ để tra lại vì sao ra con số đó. */}
        {axisScores.length ? (
          <AxisScoreBoard
            axisScores={axisScores}
            totalScore={totalScore}
            totalMax={totalMax}
          />
        ) : null}

        {/*
          Khối A bày kèm cho ĐỘI, thu gọn sẵn - chỉ để đối chiếu A với B trên
          cùng một màn trước khi trình. Không nằm trong bản chụp, không đi lên
          cấp trên: bảng A có đường riêng. Vai duyệt và cấp phòng không thấy -
          họ không có quyền đọc bảng A của đội qua đường này, mà cũng không cần.
        */}
        {!reviewer && level === "TEAM" ? (
          <TeamReportCriteriaPreview
            fromDate={summary.fromDate}
            toDate={summary.toDate}
          />
        ) : null}

        {/* Không có nút "Thêm nhiệm vụ" chung ở đây: thêm việc luôn xảy ra tại
            một trục cụ thể, mà trong hộp thoại vẫn đổi được sang trục khác. */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {groups.length > 1 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                setOpenAxes(
                  openAxes.size === groups.length
                    ? new Set()
                    : new Set(groups.map((group) => group.key)),
                )
              }
            >
              {openAxes.size === groups.length ? "Thu tất cả" : "Mở tất cả"}
            </Button>
          ) : null}
        </div>

        {groups.map((group) => {
          /* Bỏ cột trùng với ô đầu dòng (tên việc, sản phẩm, hạn) và cột nội
             dung công việc - bảng đã có cột cứng cho nó. */
          const skip = entryColumnKeys(group.template);
          const columns = inputColumns(group.template).filter(
            (column) =>
              column.semanticKey !== "work_content" && !skip.has(column.key),
          );
          const open = openAxes.has(group.key);
          const tone = scoreTone(group.score?.axisScore ?? null);

          return (
            <div key={group.key} className="space-y-2">
              {/*
                Thu sẵn, mở mới dựng bảng: một bản tổng hợp cả tháng có thể vài
                trăm dòng trải bốn trục - dựng hết một lượt là mở báo cáo nào
                cũng khựng, trong khi phần lớn lúc chỉ cần nhìn điểm.
              */}
              <div className="flex items-center gap-1 rounded-md border pr-1.5 transition-colors hover:bg-muted/60">
                <button
                  type="button"
                  onClick={() =>
                    setOpenAxes((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                  className="flex min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-2 px-3 py-2.5 text-left"
                >
                  <ChevronRight
                    className={cn(
                      "size-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-90",
                    )}
                  />
                  <h3 className="font-display text-sm font-semibold">
                    {group.axisName || "Chưa gắn trục"}
                  </h3>
                  <Badge variant="secondary" className="font-normal">
                    {group.rows.length} nhiệm vụ
                  </Badge>
                  {group.score ? (
                    <Badge
                      variant="secondary"
                      className={cn(
                        "whitespace-nowrap font-normal",
                        tone.badge,
                      )}
                    >
                      {group.score.convertedScore === null
                        ? "chưa chấm được"
                        : `${formatScore(group.score.convertedScore)}/${group.score.maxScore} điểm`}
                    </Badge>
                  ) : null}
                  {group.template ? (
                    <span className="ml-auto hidden text-xs text-muted-foreground sm:block">
                      Mẫu: {group.template.name} (bản {group.template.version})
                    </span>
                  ) : null}
                </button>

                {/* Thêm việc ngay tại trục đang đứng - hộp thoại mở ra chỉ bày
                    việc của trục này. Khối "Chưa gắn trục" thì không: chưa
                    chọn trục thì không lọc theo trục được. */}
                {canChangeTasks && group.key !== "__no_axis__" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="shrink-0 whitespace-nowrap text-muted-foreground"
                    disabled={busy}
                    title={`Thêm nhiệm vụ thuộc ${group.axisName || "trục này"}`}
                    onClick={() => openAddDialog(group.key)}
                  >
                    <Plus className="size-4" />
                    <span className="hidden sm:inline">Thêm nhiệm vụ</span>
                  </Button>
                ) : null}
              </div>

              {open ? (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[240px]">
                          Nhiệm vụ
                        </TableHead>
                        <TableHead className="min-w-[200px]">
                          Nội dung công việc
                        </TableHead>
                        {columns.map((column) => (
                          <TableHead
                            key={column.key}
                            className="whitespace-nowrap"
                            style={{ minWidth: Math.max(150, column.width) }}
                          >
                            {column.title}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((row) => (
                        <TableRow key={row.taskId}>
                          <TableCell className="max-w-[340px] whitespace-normal break-words align-middle">
                            <div className="flex items-start gap-1.5">
                              {/* Gỡ khỏi BÁO CÁO, không xoá nhiệm vụ: việc vẫn
                                  nằm ở bảng ngày, chỉ là không đi trong bản
                                  này. */}
                              {canChangeTasks ? (
                                <button
                                  type="button"
                                  aria-label="Gỡ khỏi báo cáo"
                                  title="Gỡ nhiệm vụ này khỏi báo cáo"
                                  disabled={busy}
                                  onClick={() =>
                                    void changeTasks({
                                      remove: [String(row.taskId)],
                                    })
                                  }
                                  className="mt-0.5 shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-destructive disabled:cursor-not-allowed"
                                >
                                  <X className="size-4" />
                                </button>
                              ) : null}
                              <span className="font-medium">{row.name}</span>
                            </div>
                            {/* Tên đội chỉ bày khi bản trộn nhiều đội - bản của
                                đội thì dòng nào cũng của chính họ, ghi lại chỉ
                                tổ chật bảng. */}
                            {multiUnit && row.departmentName ? (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Building2 className="size-3 shrink-0" />
                                {row.departmentName}
                              </div>
                            ) : null}
                            {row.product ? (
                              <div className="text-xs text-muted-foreground">
                                Sản phẩm: {row.product}
                              </div>
                            ) : null}
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {row.deadline
                                ? `Hạn ${formatYmd(row.deadline)}`
                                : "Không đặt hạn"}
                              {row.closed ? " · đã đóng" : ""}
                            </div>
                          </TableCell>
                          <TableCell className="align-middle text-sm">
                            {row.workContentName || "-"}
                          </TableCell>
                          {/*
                          CHỈ ĐỌC: đây là bản đã chụp lại, không phải nhiệm vụ
                          sống. Cho sửa ở đây thì con số trên bản trình lệch với
                          con số bảng ngày đang giữ, mà không ai biết bên nào đúng.
                        */}
                          {columns.map((column) => {
                            const catalog = catalogOfColumn(column);

                            /* Ô tự tính và ô tệp không ai gõ được, nên kể cả
                               khi bảng đang mở khoá vẫn bày dạng chữ. */
                            const canEdit =
                              editable &&
                              !column.autoValue &&
                              column.dataType !== "file";

                            if (canEdit) {
                              const current = catalog
                                ? (row.catalogValues?.[column.key]?.id ?? "")
                                : String(row.fieldValues?.[column.key] ?? "");
                              const cellError =
                                cellErrors[
                                  `${String(row.taskId)}:${column.key}`
                                ];
                              return (
                                <TableCell
                                  key={column.key}
                                  className="align-middle"
                                >
                                  <DynamicColumnCell
                                    /* Ghép giá trị vào khoá để ô dựng lại khi
                                       server trả số mới - ô nhập giữ bản nháp
                                       cục bộ, không tự nhận props mới. */
                                    key={`${column.key}:${current}`}
                                    column={column}
                                    value={current}
                                    catalogs={catalogs}
                                    invalid={!!cellError}
                                    disabled={savingCell === String(row.taskId)}
                                    onCommit={(next) =>
                                      void saveCell(String(row.taskId), {
                                        taskId: String(row.taskId),
                                        ...(catalog
                                          ? {
                                              catalogValues: {
                                                [column.key]: next,
                                              },
                                            }
                                          : {
                                              fieldValues: {
                                                [column.key]: next,
                                              },
                                            }),
                                      })
                                    }
                                  />
                                  {/* Bảng ngang chật nên chỉ một dòng ngắn dưới
                                      ô - viền đỏ đã chỉ đúng chỗ rồi. */}
                                  {cellError ? (
                                    <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
                                      <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                                      <span>{cellError}</span>
                                    </p>
                                  ) : null}
                                </TableCell>
                              );
                            }

                            const raw = catalog
                              ? (row.catalogValues?.[column.key]?.name ?? "")
                              : String(row.fieldValues?.[column.key] ?? "");
                            /* Ngày phải bày dd/mm/yyyy như mọi chỗ khác - để
                             nguyên YYYY-MM-DD là đọc lạc hẳn cách đọc. */
                            const value =
                              !catalog && column.dataType === "date" && raw
                                ? formatYmd(raw)
                                : raw;
                            return (
                              <TableCell
                                key={column.key}
                                className={cn(
                                  "align-middle text-sm",
                                  column.dataType === "number" &&
                                    "tabular-nums text-right",
                                )}
                              >
                                {value || (
                                  <span className="text-muted-foreground">
                                    -
                                  </span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}

                      {/* Dòng tổng: cộng theo TỔNG CỘT, không phải cộng điểm từng
                        dòng - việc điểm chuẩn cao phải nặng hơn việc điểm chuẩn
                        thấp. Server tính, đây chỉ bày lại. */}
                      {group.score &&
                      Object.keys(group.score.columnTotals).length ? (
                        <>
                          {/* Ba dòng cuối đúng như mẫu giấy: tổng từng cột,
                              công thức tính điểm trục, rồi điểm quy đổi. */}
                          <TableRow className="border-t-2 bg-muted/40 font-medium hover:bg-inherit">
                            <TableCell className="align-middle">
                              Tổng từng cột
                            </TableCell>
                            <TableCell className="align-middle text-sm text-muted-foreground">
                              {group.rows.length} nhiệm vụ
                            </TableCell>
                            {columns.map((column) => {
                              const total =
                                group.score?.columnTotals[column.key];
                              return (
                                <TableCell
                                  key={column.key}
                                  className="align-middle text-right tabular-nums"
                                >
                                  {total === undefined
                                    ? ""
                                    : formatScore(total)}
                                </TableCell>
                              );
                            })}
                          </TableRow>

                          {group.score.formula ? (
                            <>
                              <TableRow className="bg-muted/40 hover:bg-inherit">
                                <TableCell className="align-middle font-medium">
                                  Tổng điểm {group.axisName.toLowerCase()}
                                </TableCell>
                                <TableCell
                                  colSpan={columns.length + 1}
                                  className="align-middle text-center"
                                >
                                  <FormulaLine
                                    formula={group.score.formula}
                                    ratio={group.score.axisScore}
                                    maxScore={group.score.maxScore}
                                  />
                                </TableCell>
                              </TableRow>

                              <TableRow
                                className={cn(
                                  "font-medium hover:bg-inherit",
                                  tone.badge || "bg-muted/40",
                                )}
                              >
                                <TableCell className="align-middle">
                                  Điểm quy đổi
                                </TableCell>
                                <TableCell
                                  colSpan={columns.length + 1}
                                  className="align-middle text-center"
                                >
                                  <FormulaLine
                                    formula={group.score.formula}
                                    ratio={group.score.axisScore}
                                    maxScore={group.score.maxScore}
                                    converted={group.score.convertedScore}
                                  />
                                </TableCell>
                              </TableRow>
                            </>
                          ) : null}
                        </>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </div>
          );
        })}

        {/*
          Nhật ký là thứ duy nhất trả lời được "con số này ai đặt, lúc nào, vì
          sao" sau khi báo cáo đã duyệt - giá trị thì chỉ còn một bản mới nhất.
          Nên bày mới nhất lên trước và ghi đủ giờ.
        */}
        {summary.edits?.length ? (
          <div className="rounded-md border">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2.5">
              <History className="size-4 text-muted-foreground" />
              <h3 className="font-display text-sm font-semibold">
                Nhật ký thay đổi
              </h3>
              <Badge variant="secondary" className="font-normal">
                {summary.edits.length} lượt
              </Badge>
            </div>
            <ul className="max-h-72 divide-y overflow-y-auto">
              {[...summary.edits].reverse().map((edit, index) => (
                <li key={index} className="px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{edit.byName}</span>
                    <span className="text-muted-foreground">{edit.field}</span>
                    <span className="tabular-nums">
                      <span className="text-muted-foreground line-through">
                        {edit.from || "trống"}
                      </span>
                      {" → "}
                      <strong>{edit.to || "trống"}</strong>
                    </span>
                    {edit.at ? (
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {formatYmd(edit.at.slice(0, 10))}{" "}
                        {formatServerHm(edit.at)}
                      </span>
                    ) : null}
                  </div>
                  {edit.reason ? (
                    <p className="text-xs text-muted-foreground">
                      Lý do: {edit.reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {draft ? "Trình báo cáo lên cấp trên" : "Trình lại báo cáo"}
            </DialogTitle>
            <DialogDescription className="break-words">
              {summary.title} · {summary.rows.length} nhiệm vụ
              {draft ? null : (
                <>
                  {" · "}
                  {/* Nhắc lại vì sao bị trả - trình lại mà chưa chữa đúng chỗ
                      đó thì lại bị trả tiếp. */}
                  <span className="text-destructive">
                    đã bị trả lại: {summary.returnReason || "không nêu lý do"}
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                Trình lên <span className="text-destructive">*</span>
              </p>
              <SearchableSelect
                value={recipientId}
                onValueChange={setRecipientId}
                options={recipients.map((person) => ({
                  value: person.id,
                  label: person.departmentName
                    ? `${person.fullName} - ${person.departmentName}`
                    : person.fullName,
                }))}
                placeholder={
                  recipients.length
                    ? "Chọn cấp trên..."
                    : "Chưa tìm được cấp trên nào có quyền duyệt"
                }
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Ghi chú gửi kèm</p>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="Không bắt buộc"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setSendOpen(false)}>
              Huỷ
            </Button>
            <Button disabled={busy || !recipientId} onClick={() => void send()}>
              <Send className="size-4" />
              Trình cấp trên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kho lấy đúng KỲ của báo cáo, và bỏ sẵn những việc đã có trong bản -
          bày lại thứ đang nằm trong báo cáo chỉ tổ tích nhầm rồi không hiểu vì
          sao không thêm được. */}
      <Dialog
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next);
          if (!next) {
            setAddPicked(new Set());
            setAddQuery("");
            setAddAxisId(null);
            setAddDeptId(null);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {addAxisName
                ? `Thêm nhiệm vụ vào ${addAxisName}`
                : "Thêm nhiệm vụ vào báo cáo"}
            </DialogTitle>
            <DialogDescription>
              {addDepartments.length
                ? "Nhiệm vụ đã sẵn sàng của các đội mà báo cáo này chưa có."
                : "Nhiệm vụ đã sẵn sàng của đội mà báo cáo này chưa có."}{" "}
              Việc nằm ngoài kỳ {formatYmd(summary.fromDate)} -{" "}
              {formatYmd(summary.toDate)} vẫn chọn được, có ghi chú riêng.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={addQuery}
                onChange={(event) => setAddQuery(event.target.value)}
                placeholder="Tìm nhiệm vụ hoặc sản phẩm..."
                className="bg-background pl-8"
              />
            </div>
            {/* Lọc đội đứng trước lọc trục - với bản của phòng, câu hỏi đầu
                tiên là "việc của đội nào". Ẩn hẳn với bản của đội. */}
            {addDepartments.length ? (
              <SearchableSelect
                value={addDeptId ?? ""}
                onValueChange={(next) => {
                  setAddDeptId(next || null);
                  setAddPicked(new Set());
                }}
                options={[
                  { value: "", label: "Tất cả các đội" },
                  ...addDepartments.map((department) => ({
                    value: department.id,
                    label: department.name,
                  })),
                ]}
                placeholder="Tất cả các đội"
                className="w-full sm:w-56"
              />
            ) : null}
            {/* Mở từ khối trục nào thì lọc sẵn trục đó, nhưng vẫn đổi được sang
                trục khác - kể cả trục báo cáo chưa có dòng nào. */}
            <SearchableSelect
              value={addAxisId ?? ""}
              onValueChange={(next) => {
                setAddAxisId(next || null);
                setAddPicked(new Set());
              }}
              options={[
                { value: "", label: "Tất cả trục" },
                ...addAxes.map((axis) => ({
                  value: axis.id,
                  label: axis.name,
                })),
              ]}
              placeholder="Tất cả trục"
              className="w-full sm:w-56"
            />
          </div>

          <div className="max-h-[22rem] space-y-1.5 overflow-y-auto rounded-md border p-2">
            {addLoading && !addable.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Đang tải...
              </p>
            ) : null}
            {!addLoading && !addable.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {addAxisName
                  ? `Đội không còn nhiệm vụ sẵn sàng nào của ${addAxisName} ngoài báo cáo này.`
                  : "Đội không còn nhiệm vụ sẵn sàng nào ngoài báo cáo này."}
              </p>
            ) : null}

            {addable.map(({ task, alreadySent, inPeriod, departmentName }) => (
              <label
                key={task._id}
                className="flex cursor-pointer items-start gap-2.5 rounded-md p-2 hover:bg-muted/60"
              >
                <Checkbox
                  checked={addPicked.has(task._id)}
                  onCheckedChange={() =>
                    setAddPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(task._id)) next.delete(task._id);
                      else next.add(task._id);
                      return next;
                    })
                  }
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block break-words text-sm font-medium">
                    {task.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {refName(task.workContentId) || "Chưa rõ nội dung"}
                    {task.product ? ` · ${task.product}` : ""}
                    {task.deadline ? ` · hạn ${formatYmd(task.deadline)}` : ""}
                    {` · khai ${formatYmd(task.createdDate)}`}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {addDepartments.length && departmentName ? (
                      <Badge
                        variant="secondary"
                        className="gap-1 whitespace-nowrap font-normal"
                      >
                        <Building2 className="size-3" />
                        {departmentName}
                      </Badge>
                    ) : null}
                    {refName(task.axisId) ? (
                      <Badge variant="secondary" className="font-normal">
                        {refName(task.axisId)}
                      </Badge>
                    ) : null}
                    {/* Chọn được, nhưng phải nói rõ: nó không thuộc khoảng ngày
                        ghi trên đầu báo cáo. */}
                    {inPeriod === false ? (
                      <Badge variant="secondary" className="font-normal">
                        Ngoài kỳ báo cáo
                      </Badge>
                    ) : null}
                    {alreadySent ? (
                      <Badge
                        variant="secondary"
                        className="border-amber-300 bg-amber-100 font-normal text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
                      >
                        Đã trình ở bản khác
                      </Badge>
                    ) : null}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Huỷ
            </Button>
            <Button
              disabled={busy || !addPicked.size}
              onClick={async () => {
                const ok = await changeTasks({ add: [...addPicked] });
                if (ok) {
                  setAddOpen(false);
                  setAddPicked(new Set());
                  setAddQuery("");
                }
              }}
            >
              <Plus className="size-4" />
              Thêm {addPicked.size || ""} nhiệm vụ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trả lại báo cáo</DialogTitle>
            <DialogDescription className="break-words">
              {summary.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              Lý do trả lại <span className="text-destructive">*</span>
            </p>
            <Textarea
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              rows={3}
              placeholder="Đội cần sửa gì trước khi trình lại"
            />
            <p className="text-xs text-muted-foreground">
              Đội đọc được lý do này và trình lại sau khi sửa.
            </p>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReturnOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void decide("RETURN")}
            >
              <Undo2 className="size-4" />
              Trả lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xoá bản nháp?</DialogTitle>
            <DialogDescription className="break-words">
              {summary.title} sẽ bị xoá hẳn. Nhiệm vụ bên trong không bị ảnh
              hưởng - chúng vẫn nằm ở bảng ngày như cũ.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void remove()}
            >
              <Trash2 className="size-4" />
              Xoá
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
