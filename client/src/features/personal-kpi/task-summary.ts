import { flattenHeaderGroups } from "@/features/kpi-form-config/form-template-utils";
import type {
  FormHeaderGroup,
  FormTemplateColumn,
  QualityLevel,
} from "@/features/kpi-form-config/types";
import type { PersonalTaskDraft } from "@/features/personal-kpi/types";
import { daysBetweenYmd, serverYmd } from "@/lib/server-time";

/**
 * Vài giá trị rút ra từ một nhiệm vụ để hiện lên danh sách: tên việc, hạn,
 * KPI tiến độ, KPI chất lượng.
 *
 * Mẫu bảng do đơn vị tự cấu hình nên không cột nào chắc chắn tồn tại - rút
 * theo quy tắc dưới đây rồi chấp nhận "chưa có" thay vì bịa ra cột cứng.
 */
export type TaskSummary = {
  /** Tên việc cán bộ gõ; rỗng khi mẫu không có cột chữ nào có dữ liệu. */
  title: string;
  /** Hạn dạng YYYY-MM-DD; rỗng khi mẫu không có cột "Thời hạn hoàn thành". */
  deadline: string;
  /** Tiêu đề cột hạn trong mẫu - dùng làm nhãn cột trên danh sách. */
  deadlineTitle: string;
  /**
   * KPI tiến độ (nhóm B) - căn cứ DUY NHẤT cho trạng thái công việc.
   * null = mẫu không có cột tiến độ hoặc chưa nhập.
   */
  progressPercent: number | null;
  /**
   * KPI chất lượng (nhóm C) - chỉ để xem.
   * Tiến độ 100% mà chất lượng 75% là chuyện bình thường, nên KHÔNG được lấy
   * con số này thay cho tiến độ.
   */
  qualityPercent: number | null;
};

/** Bộ cột + cây nhóm header của mẫu gán cho trục. */
type TemplateShape = {
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
};

/**
 * Khoá cột cố định của mẫu mặc định (createDefaultTemplateDraft).
 * Mẫu tạo từ bộ mặc định lần nào cũng ra đúng khoá này nên khớp được ngay,
 * khỏi đoán theo tiêu đề.
 */
const PROGRESS_COLUMN_KEY = "progress_percent";
const QUALITY_COLUMN_KEY = "quality_percent";
const DEADLINE_COLUMN_KEY = "deadline";
const NOTE_COLUMN_KEY = "note";

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d");
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function readNumber(task: PersonalTaskDraft, columnKey: string): number | null {
  const raw = task.fieldValues?.[columnKey] ?? "";
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? clampPercent(value) : null;
}

/** Tiêu đề cột kèm tên các nhóm header bọc ngoài nó. */
function columnLabelPath(
  column: FormTemplateColumn,
  groupNameById: Map<string, string>,
): string {
  const groups = (column.headerPath ?? [])
    .map((id) => groupNameById.get(id) ?? "")
    .filter(Boolean);
  return normalize([...groups, column.title].join(" "));
}

/**
 * Cột mang được một con số phần trăm.
 *
 * Hai dạng đều tính: ô số có "%" trong tiêu đề, và ô chọn "Chất lượng thực
 * hiện" - danh mục đó vốn là các mức 100% / 75% / 50%, nên mẫu hay dùng chính
 * nó cho cả cột "Thực tế hoàn thành %" của nhóm tiến độ.
 */
function isPercentColumn(column: FormTemplateColumn): boolean {
  if (column.semanticKey === "quality_level") return true;
  return column.dataType === "number" && column.title.includes("%");
}

/**
 * Hai cột phần trăm của nhiệm vụ: tiến độ (nhóm B) và chất lượng (nhóm C).
 *
 * Phân biệt bằng khoá cố định của mẫu mặc định trước; không có thì soi từ khoá
 * "tiến độ" / "chất lượng" trong tiêu đề cột VÀ tên nhóm header bọc ngoài -
 * mẫu thật hay đặt hai cột trùng tên "Thực tế hoàn thành %", chỉ tên nhóm mới
 * tách được chúng. Mẫu không nhắc gì thì lấy theo thứ tự bày trên bảng, vì
 * khuôn KPI luôn xếp nhóm B trước nhóm C.
 */
function findPercentColumns(template: TemplateShape): {
  progress?: FormTemplateColumn;
  quality?: FormTemplateColumn;
} {
  const candidates = template.columns.filter(
    (column) => column.visible && isPercentColumn(column),
  );
  if (candidates.length === 0) return {};

  const groupNameById = new Map(
    flattenHeaderGroups(template.headerGroups ?? []).map((group) => [
      group.id,
      group.name,
    ]),
  );
  const byKeyword = (keyword: string) =>
    candidates.find((column) =>
      columnLabelPath(column, groupNameById).includes(keyword),
    );

  let progress =
    candidates.find((column) => column.key === PROGRESS_COLUMN_KEY) ??
    byKeyword("tien do");
  let quality =
    candidates.find((column) => column.key === QUALITY_COLUMN_KEY) ??
    byKeyword("chat luong");

  const rest = candidates.filter(
    (column) => column !== progress && column !== quality,
  );
  progress ??= rest.shift();
  quality ??= rest.shift();

  return { progress, quality };
}

/**
 * Giá trị phần trăm của một ô, đọc đúng chỗ theo loại cột: ô chọn thì lấy phần
 * trăm của mức trong danh mục, ô số thì lấy con số đã gõ.
 */
export function readColumnPercent(
  task: PersonalTaskDraft,
  column: FormTemplateColumn | undefined,
  qualityLevelById: Map<string, QualityLevel>,
): number | null {
  if (!column) return null;
  if (column.semanticKey === "quality_level") {
    const level = qualityLevelById.get(task.catalogValues?.[column.key] ?? "");
    return level ? clampPercent(level.percent) : null;
  }
  return readNumber(task, column.key);
}

/**
 * Các cột mà việc theo dõi hằng ngày đụng tới.
 * Rút một lần ở đây để danh sách và ô "Cập nhật tiến độ" luôn đọc / ghi đúng
 * cùng một cột.
 */
export type TrackingColumns = {
  titleColumn?: FormTemplateColumn;
  deadlineColumn?: FormTemplateColumn;
  /** Cột phần trăm của nhóm "KPI tiến độ (B)" - ô số hoặc ô chọn mức. */
  progressColumn?: FormTemplateColumn;
  /** Cột phần trăm của nhóm "KPI chất lượng (C)". */
  qualityColumn?: FormTemplateColumn;
  noteColumn?: FormTemplateColumn;
};

export function trackingColumns(
  template: TemplateShape | null,
  task?: PersonalTaskDraft,
): TrackingColumns {
  if (!template) return {};
  const visible = template.columns.filter((column) => column.visible);

  const textColumns = visible.filter(
    (column) =>
      column.semanticKey === "custom" &&
      column.dataType === "text" &&
      column.key !== NOTE_COLUMN_KEY,
  );
  const percent = findPercentColumns(template);

  return {
    // Tên việc: cột chữ tự do đầu tiên có dữ liệu - trong mẫu mặc định là cột
    // "Nhiệm vụ", cũng là cột đầu tiên người nhập gõ.
    titleColumn: task
      ? (textColumns.find((column) =>
          (task.fieldValues?.[column.key] ?? "").trim(),
        ) ?? textColumns[0])
      : textColumns[0],
    // Hạn: cột "Thời hạn hoàn thành" của mẫu mặc định, mẫu khác thì cột ngày đầu.
    deadlineColumn:
      visible.find(
        (column) =>
          column.key === DEADLINE_COLUMN_KEY && column.dataType === "date",
      ) ?? visible.find((column) => column.dataType === "date"),
    progressColumn: percent.progress,
    qualityColumn: percent.quality,
    noteColumn: visible.find((column) => column.key === NOTE_COLUMN_KEY),
  };
}

export function summarizeTask(
  task: PersonalTaskDraft,
  template: TemplateShape | null,
  qualityLevelById: Map<string, QualityLevel>,
): TaskSummary {
  const { titleColumn, deadlineColumn, progressColumn, qualityColumn } =
    trackingColumns(template, task);

  return {
    title: titleColumn ? (task.fieldValues?.[titleColumn.key] ?? "").trim() : "",
    deadline: deadlineColumn
      ? (task.fieldValues?.[deadlineColumn.key] ?? "").trim()
      : "",
    deadlineTitle: deadlineColumn?.title ?? "Hạn",
    progressPercent: readColumnPercent(task, progressColumn, qualityLevelById),
    qualityPercent: readColumnPercent(task, qualityColumn, qualityLevelById),
  };
}

/** Trạng thái công việc, suy từ KPI tiến độ chứ không phải từ luồng duyệt. */
export type WorkState = "NOT_STARTED" | "IN_PROGRESS" | "DONE";

export const WORK_STATE_LABEL: Record<WorkState, string> = {
  NOT_STARTED: "Chưa bắt đầu",
  IN_PROGRESS: "Đang thực hiện",
  DONE: "Xong tiến độ",
};

export function workState(progressPercent: number | null): WorkState {
  if (progressPercent === null || progressPercent <= 0) return "NOT_STARTED";
  return progressPercent >= 100 ? "DONE" : "IN_PROGRESS";
}

/**
 * Bao nhiêu ngày rồi không ai đụng tới tiến độ của việc này.
 *
 * Nhận mốc thời gian ISO của server; ngày của mốc đó quy theo MÚI GIỜ SERVER
 * chứ không theo đồng hồ máy - so theo ngày lịch nên cập nhật lúc 23h hôm qua
 * thì hôm nay là "im lặng 1 ngày", không phải 0.
 */
export function silenceDays(
  lastTouchedIso: string | undefined,
  todayYmd: string,
): number | null {
  if (!lastTouchedIso) return null;
  const touchedYmd = serverYmd(lastTouchedIso);
  const days = daysBetweenYmd(touchedYmd, todayYmd);
  if (days === null) return null;
  return days < 0 ? 0 : days;
}

/** Từ mức này trở lên thì danh sách kêu "im lặng". */
export const SILENCE_ALERT_DAYS = 3;

export type DeadlineState = {
  /** Số ngày còn lại; âm là đã trễ. */
  days: number;
  label: string;
  tone: "danger" | "warning" | "muted";
};

/**
 * Nhãn "Còn N ngày / Hạn hôm nay / Trễ N ngày" so với ngày hiện tại.
 * `todayYmd` phải là ngày theo giờ server - đừng truyền ngày của máy người dùng.
 */
export function deadlineState(
  deadline: string,
  todayYmd: string,
): DeadlineState | null {
  if (!deadline) return null;

  const days = daysBetweenYmd(todayYmd, deadline);
  if (days === null) return null;

  if (days < 0) {
    return { days, label: `Trễ ${-days} ngày`, tone: "danger" };
  }
  if (days === 0) return { days, label: "Hạn hôm nay", tone: "warning" };
  if (days <= 2) return { days, label: `Còn ${days} ngày`, tone: "warning" };
  return { days, label: `Còn ${days} ngày`, tone: "muted" };
}
