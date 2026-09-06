/**
 * Kiểu dữ liệu của bản nghiệp vụ MỚI: báo cáo ngày cấp đội.
 *
 * Tách hẳn khỏi `features/personal-mission` - không import qua lại, không dùng
 * chung kiểu nào. Hai bản phải bật tắt độc lập, mà kiểu dùng chung là thứ đầu
 * tiên buộc chúng vào nhau.
 *
 * Riêng `mission-form-config` thì dùng lại: đó là danh mục và cấu hình mẫu
 * bảng dùng chung cho cả hệ, bản mới đọc đúng bộ cột super admin đã khai ở đó.
 */

import {
  catalogOfSemantic,
  type FormTemplateColumn,
} from "@/features/mission-form-config/types";

export const TEAM_REPORT_DAY_STATUSES = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "RETURNED",
] as const;
export type TeamReportDayStatus = (typeof TEAM_REPORT_DAY_STATUSES)[number];

export const TEAM_REPORT_STATUS_LABEL: Record<TeamReportDayStatus, string> = {
  DRAFT: "Nháp",
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  RETURNED: "Trả lại",
};

/** Tham chiếu đã populate - server trả cả object, chỗ chưa populate trả id trần. */
export type Ref = { _id: string; code?: string; name?: string } | string | null;

export function refId(value: Ref | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value._id;
}

export function refName(value: Ref | undefined): string {
  if (!value || typeof value === "string") return "";
  return value.name ?? "";
}

// ------------------------------------------------- mẫu bảng động theo trục

/** Một cột của mẫu bảng do quản trị cấu hình. */
export type TeamReportColumn = FormTemplateColumn;

/** Bộ cột của một trục; null = trục chưa được gán mẫu. */
export type TeamReportTemplate = {
  _id: string;
  code: string;
  name: string;
  version: number;
  columns: TeamReportColumn[];
};

/** Một mục trong danh mục dùng cho cột kiểu chọn. */
export type TeamReportCatalogItem = {
  _id: string;
  name: string;
  /** Nhóm điểm mới có dải; mức chất lượng mới có phần trăm. */
  minScore?: number;
  maxScore?: number;
  percent?: number;
  workContentId?: string;
  /** Nội dung công việc thuộc trục nào - dùng để lọc theo trục đang chọn. */
  axisId?: string;
  note?: string;
};

export type TeamReportCatalogs = Record<string, TeamReportCatalogItem[]>;

/**
 * Danh mục đã thu hẹp theo ngữ cảnh của chính nhiệm vụ đang mở.
 *
 * Nội dung công việc chỉ trong TRỤC đã chọn, nhiệm vụ mẫu chỉ trong NỘI DUNG đã
 * chọn. Bày cả danh mục thì người dùng chọn được thứ server sẽ chặn - hoá ra
 * bắt họ đoán mục nào thuộc đâu.
 */
export function narrowCatalogs(
  catalogs: TeamReportCatalogs,
  scope: { axisId: string; workContentId: string },
): TeamReportCatalogs {
  const narrowed: TeamReportCatalogs = { ...catalogs };

  if (catalogs.work_content) {
    narrowed.work_content = scope.axisId
      ? catalogs.work_content.filter((item) => item.axisId === scope.axisId)
      : [];
  }
  if (catalogs.work_task) {
    narrowed.work_task = scope.workContentId
      ? catalogs.work_task.filter(
          (item) => item.workContentId === scope.workContentId,
        )
      : [];
  }
  return narrowed;
}

/** Cột này lấy giá trị từ danh mục nào; null = ô gõ tay. */
export function catalogOfColumn(column: TeamReportColumn): string | null {
  return catalogOfSemantic(column.semanticKey);
}

/**
 * Cột thật sự bày ra bảng.
 *
 * Bỏ cột `stt`: đó là số thứ tự dòng, bảng tự có rồi - bày ra thành một ô trống
 * không ai điền được mà vẫn chiếm chỗ.
 */
export function inputColumns(
  template: TeamReportTemplate | null | undefined,
): TeamReportColumn[] {
  return (template?.columns ?? []).filter(
    (column) => column.visible && column.semanticKey !== "stt",
  );
}

/**
 * Mẫu có sẵn cột "Nội dung công việc" hay không.
 *
 * Có thì chính cột đó là chỗ phân loại, bảng KHÔNG vẽ thêm ô chọn riêng - hai ô
 * cùng một việc đứng cạnh nhau là người dùng không biết điền ô nào.
 */
export function workContentColumnOf(
  template: TeamReportTemplate | null | undefined,
): TeamReportColumn | undefined {
  return inputColumns(template).find(
    (column) => column.semanticKey === "work_content",
  );
}

/** Nhiệm vụ đang ở bước nào của việc phân loại. */
export type TaskReadiness = "UNCLASSIFIED" | "IN_PROGRESS" | "READY";

export const READINESS_LABEL: Record<TaskReadiness, string> = {
  UNCLASSIFIED: "Chưa phân loại",
  IN_PROGRESS: "Đang hoàn thiện",
  READY: "Sẵn sàng gửi",
};

export type TeamReportAxis = {
  _id: string;
  code: string;
  name: string;
  sortOrder: number;
  maxScore: number;
};

export type TeamReportWorkContent = {
  _id: string;
  code: string;
  name: string;
  /** Trục chứa nội dung này - dùng để lọc theo trục đã chọn. */
  axisId: string;
  scoreGroupId: string | null;
  sortOrder: number;
};

// --------------------------------------------------------------- nhiệm vụ

export type TeamReportEvidence = {
  uploadId: string;
  name: string;
  url: string;
};

export type TeamReportEdit = {
  byName: string;
  field: string;
  from: string;
  to: string;
  reason: string;
  at: string;
};

/** Giá trị cột danh mục: id kèm tên đã chép sẵn lúc chọn. */
export type CatalogValue = { id: string; name: string };

/**
 * Nhiệm vụ SỐNG của đội - không thuộc riêng ngày nào.
 *
 * Còn mở thì ngày nào cũng hiện lại trong bảng để cập nhật tiếp; đóng rồi thì
 * biến mất khỏi bảng của những ngày sau.
 */
export type TeamReportTask = {
  _id: string;
  departmentId: string;

  /* giai đoạn 1 - những trường ai trong đội cũng gõ được */
  name: string;
  deadline: string;
  /** Sản phẩm phải ra: "Kế hoạch số 12", "Báo cáo chuyên đề"... Ô chữ tự do. */
  product: string;
  /* Không có điểm ở đây: điểm nằm trong bộ cột của mẫu ở giai đoạn 2. */
  evidence: TeamReportEvidence[];

  /* giai đoạn 2 - trục quyết định bộ cột, giá trị đi theo khoá cột */
  axisId: Ref;
  workContentId: Ref;
  formTemplateId: string | null;
  formTemplateVersion: number | null;
  fieldValues: Record<string, string | number>;
  catalogValues: Record<string, CatalogValue>;

  /* cấp trên chấm lại - để riêng để đối chiếu với số đội khai */
  reviewValues: Record<string, string | number>;
  reviewCatalogValues: Record<string, CatalogValue>;
  edits: TeamReportEdit[];

  isOpen: boolean;
  closedDate: string;
  closedReason: string;
  createdDate: string;
  /** Số bản - phải gửi lại đúng số này khi lưu, kẻo đè mất phần người khác. */
  version: number;
};

/**
 * Giá trị CHỐT của một ô: số cấp trên chấm lại đè lên số đội khai.
 *
 * Bảng bày số chốt, còn số đội tự khai vẫn đọc được từ `fieldValues` để đối
 * chiếu - hai thứ khác nhau, đừng gộp làm một.
 */
export function finalFieldValue(
  task: TeamReportTask,
  key: string,
): string | number | undefined {
  return task.reviewValues?.[key] ?? task.fieldValues?.[key];
}

export function finalCatalogValue(
  task: TeamReportTask,
  key: string,
): CatalogValue | undefined {
  return task.reviewCatalogValues?.[key] ?? task.catalogValues?.[key];
}

/**
 * Các ô BẮT BUỘC của mẫu mà nhiệm vụ còn bỏ trống.
 *
 * Bỏ qua cột hệ thống tự tính: người dùng không gõ được vào đó nên đòi họ điền
 * là đòi một thứ không có cách nào làm.
 */
export function missingRequiredColumns(
  task: TeamReportTask,
  template: TeamReportTemplate | null | undefined,
): TeamReportColumn[] {
  return inputColumns(template).filter((column) => {
    if (!column.required || column.autoValue) return false;
    const filled = catalogOfColumn(column)
      ? !!finalCatalogValue(task, column.key)
      : String(finalFieldValue(task, column.key) ?? "").trim() !== "";
    return !filled;
  });
}

/**
 * Nhiệm vụ đã sẵn sàng gửi chưa.
 *
 * Chưa có trục hoặc chưa có nội dung công việc thì vẫn là "chưa phân loại" - đó
 * là hai thứ quyết định nhiệm vụ được cộng vào đâu, thiếu là cấp trên nhận về
 * không biết xếp vào mục nào.
 */
export function readinessOf(
  task: TeamReportTask,
  template: TeamReportTemplate | null | undefined,
): TaskReadiness {
  if (!refId(task.axisId) || !refId(task.workContentId)) return "UNCLASSIFIED";
  return missingRequiredColumns(task, template).length
    ? "IN_PROGRESS"
    : "READY";
}

/** Cấp trên đã chấm lại ô này chưa. */
export function isColumnReviewed(task: TeamReportTask, key: string): boolean {
  return (
    task.reviewValues?.[key] !== undefined ||
    task.reviewCatalogValues?.[key] !== undefined
  );
}

// ------------------------------------------------------------ báo cáo ngày

/** Một dòng trong bản chụp của báo cáo ngày. */
export type TeamReportDayRow = {
  taskId: string;
  name: string;
  deadline: string;
  product: string;
  axisId: Ref;
  axisName: string;
  workContentId: Ref;
  workContentName: string;
  formTemplateId: string | null;
  formTemplateVersion: number | null;
  /** Giá trị đã CHỐT lúc gửi - số đội khai đã ghép số cấp trên chấm lại. */
  fieldValues: Record<string, string | number>;
  catalogValues: Record<string, CatalogValue>;
  evidenceCount: number;
  closed: boolean;
};

export type TeamReportDay = {
  _id: string;
  departmentId: Ref;
  reportDate: string;
  status: TeamReportDayStatus;
  rows: TeamReportDayRow[];
  sentByName: string;
  sentAt: string | null;
  note: string;
  decidedByName: string;
  decidedAt: string | null;
  returnReason: string;
  edits: TeamReportEdit[];
};

export type TeamReportUnitDayRow = TeamReportDayRow & {
  teamDepartmentId: Ref;
  teamDepartmentName: string;
};

export type TeamReportUnitDay = {
  _id: string;
  departmentId: Ref;
  reportDate: string;
  status: TeamReportDayStatus;
  rows: TeamReportUnitDayRow[];
  sentByName: string;
  sentAt: string | null;
  note: string;
  returnReason: string;
};

// ------------------------------------------------------------ phản hồi API

export type TeamReportSheet = {
  reportDate: string;
  /** Đã gửi lên trên thì bảng của ngày đó khoá, trừ khi bị trả lại. */
  locked: boolean;
  day: TeamReportDay | null;
  tasks: TeamReportTask[];
  unclassified: number;
};

export type TeamReportClassifyBoard = TeamReportSheet & {
  axes: TeamReportAxis[];
  workContents: TeamReportWorkContent[];
  /** Bộ cột theo trục, tra bằng id trục. null = trục chưa gán mẫu. */
  templates: Record<string, TeamReportTemplate | null>;
  catalogs: TeamReportCatalogs;
  /** Phân loại hết mới gửi được - cấp trên không cộng được dòng chưa rõ thuộc đâu. */
  canSubmit: boolean;
};
