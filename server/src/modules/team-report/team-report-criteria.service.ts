import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Permission } from '@/common/enums/permission.enum';
import { RoleCode } from '@/common/enums/role-code.enum';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import { Role, RoleDocument } from '@/modules/roles/schemas/role.schema';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  Criterion,
  CriterionDocument,
} from '@/modules/mission-form-config/schemas/criterion.schema';
import {
  FormTemplate,
  FormTemplateColumn,
  FormTemplateDocument,
} from '@/modules/mission-form-config/schemas/form-template.schema';
import { FormTemplatesService } from '@/modules/mission-form-config/form-templates.service';
import {
  TeamReportCriteriaSheet,
  TeamReportCriteriaSheetDocument,
  TeamReportCriterionRow,
} from './schemas/team-report-criteria-sheet.schema';
import {
  SaveTeamReportCriteriaDto,
  TeamReportCriteriaQueryDto,
} from './dto/team-report.dto';
import {
  TeamReportSummary,
  TeamReportSummaryDocument,
  type TeamReportSummaryCriteria,
} from './schemas/team-report-summary.schema';
import { departmentLabels } from './team-report.department-label';
import { serverDateYmd } from './team-report.time';

/**
 * Vai được chấm bảng A khi chỉ có quyền DUYỆT: trưởng / phó đơn vị cấp phòng,
 * xã - đúng những vai lập "báo cáo của đơn vị" để trình tiếp lên trên. Tài
 * khoản chỉ duyệt và cấp tỉnh có quyền duyệt nhưng không trình bảng A đi đâu.
 */
const UNIT_SCORER_ROLES: string[] = [
  RoleCode.UNIT_ADMIN,
  RoleCode.VICE_UNIT_ADMIN,
];

/** Bộ cột của mẫu bảng A, đã rút gọn còn đúng thứ bảng cần. */
type CriteriaTemplate = {
  _id: string;
  code: string;
  name: string;
  version: number;
  columns: FormTemplateColumn[];
  headerGroups: unknown[];
};

type Actor = {
  id: Types.ObjectId;
  name: string;
  departmentId: Types.ObjectId;
};

/**
 * Bảng A "Danh mục điểm tiêu chí chung" của đội - một bản mỗi tháng.
 *
 * Service riêng, không nhét vào `TeamReportService`: bảng A không dính gì tới
 * nhiệm vụ, bảng ngày hay chuỗi gửi - nó là một bảng chấm phẳng, tháng một lần.
 * Đưa vào service kia chỉ làm tệp vốn đã ba nghìn dòng phình thêm.
 */
@Injectable()
export class TeamReportCriteriaService {
  constructor(
    @InjectModel(TeamReportCriteriaSheet.name)
    private readonly sheetModel: Model<TeamReportCriteriaSheetDocument>,
    @InjectModel(Criterion.name)
    private readonly criterionModel: Model<CriterionDocument>,
    @InjectModel(FormTemplate.name)
    private readonly formTemplateModel: Model<FormTemplateDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Role.name)
    private readonly roleModel: Model<RoleDocument>,
    @InjectModel(TeamReportSummary.name)
    private readonly summaryModel: Model<TeamReportSummaryDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly formTemplatesService: FormTemplatesService,
  ) {}

  /**
   * Bảng A các đơn vị trực thuộc đã GỬI LÊN đơn vị mình trong tháng.
   *
   * Chỉ để phòng / xã tham khảo khi tự chấm bảng của mình - không cộng, không
   * trung bình gì cả. Đọc bản CHỤP trong báo cáo tổng hợp đang chờ duyệt hoặc
   * đã duyệt, đúng thứ đội đã trình, không đọc bảng sống của đội (đội còn sửa
   * được, mà phòng cần biết đội đã cam kết số nào).
   *
   * Một đơn vị trình nhiều bản cùng tháng (tuần + tháng) thì lấy bản trình sau
   * cùng. Bản trả lại / nháp không tính - số đó chưa phải số đội chốt.
   */
  async references(userId: string, query: TeamReportCriteriaQueryDto) {
    const actor = await this.requireActor(userId);
    const periodMonth = this.requireMonth(query.periodMonth);

    const summaries = await this.summaryModel
      .find({
        status: { $in: ['PENDING', 'APPROVED'] },
        'criteria.periodMonth': periodMonth,
        departmentId: { $ne: actor.departmentId },
        $or: [
          { recipientId: actor.id },
          { recipientDepartmentId: actor.departmentId },
          { finalRecipientId: actor.id },
          { finalRecipientDepartmentId: actor.departmentId },
        ],
      })
      .select('departmentId title status sentAt criteria')
      .sort({ sentAt: -1 });

    const latest = new Map<string, TeamReportSummaryDocument>();
    for (const summary of summaries) {
      const key = String(summary.departmentId);
      if (!latest.has(key)) latest.set(key, summary);
    }
    const names = await departmentLabels(this.departmentModel, [
      ...latest.values(),
    ].map((summary) => summary.departmentId));

    return {
      message: 'OK',
      data: [...latest.values()]
        .map((summary) => ({
          departmentId: String(summary.departmentId),
          departmentName: names.get(String(summary.departmentId)) ?? '',
          summaryId: String(summary._id),
          summaryTitle: summary.title,
          status: summary.status,
          sentAt: summary.sentAt,
          criteria: summary.criteria,
        }))
        .sort((a, b) => a.departmentName.localeCompare(b.departmentName, 'vi')),
    };
  }

  /**
   * Bảng A của một tháng.
   *
   * Chưa có bản nào cho tháng đó thì DỰNG TẠM từ danh mục tiêu chí đang hoạt
   * động và mẫu `forCriteria` hiện hành - KHÔNG ghi xuống. Mở ra xem mà đã tạo
   * bản ghi thì mỗi lần ai đó lướt qua các tháng là đẻ ra một bảng rỗng. Bản
   * thật chỉ sinh ra ở lượt lưu đầu tiên.
   */
  async sheet(userId: string, query: TeamReportCriteriaQueryDto) {
    const actor = await this.requireActor(userId);
    const periodMonth = this.requireMonth(query.periodMonth);

    const stored = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });

    const template = stored
      ? await this.templateOfSheet(stored)
      : await this.currentTemplate();

    const rows = stored ? stored.rows : await this.freshRows();

    /* Các tháng đã có bảng - để ô chọn tháng bày dấu "đã chấm", người dùng
       khỏi mở từng tháng dò xem tháng nào còn trống. */
    const months = (
      await this.sheetModel
        .find({ departmentId: actor.departmentId })
        .select('periodMonth')
        .sort({ periodMonth: -1 })
    ).map((item) => item.periodMonth);

    return {
      message: 'OK',
      data: {
        sheet: {
          _id: stored ? String(stored._id) : null,
          periodMonth,
          rows,
          version: stored?.version ?? 0,
          edits: stored?.edits ?? [],
          updatedAt: stored?.updatedAt ?? null,
          /** false = bảng tạm dựng từ danh mục, chưa ai lưu gì. */
          saved: Boolean(stored),
        },
        template,
        score: this.scoreOf(rows, template),
        months,
      },
    };
  }

  /**
   * Lưu các ô vừa chấm. Lần đầu là tạo bản, các lần sau là sửa tại chỗ.
   *
   * Nhận từng ô như tab Phân loại chứ không bắt lưu cả bảng: cả đội chấm chung
   * qua một tài khoản, gửi cả bảng là đè mất phần người khác vừa gõ.
   */
  async save(userId: string, month: string, dto: SaveTeamReportCriteriaDto) {
    const actor = await this.requireActor(userId);
    const periodMonth = this.requireMonth(month);

    let sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });

    if (!sheet) {
      /*
        Bản đầu tiên của tháng: chốt luôn mẫu và chép danh mục tại thời điểm
        này. Từ đây về sau quản trị sửa mẫu hay danh mục không đụng tới bảng.
      */
      const template = await this.currentTemplate();
      sheet = new this.sheetModel({
        departmentId: actor.departmentId,
        periodMonth,
        rows: await this.freshRows(),
        formTemplateId: template ? new Types.ObjectId(template._id) : null,
        formTemplateVersion: template?.version ?? null,
        version: 0,
        edits: [],
      });
    }

    /*
      So số bản: cả đội chấm chung một bảng qua một tài khoản, đây là thứ duy
      nhất ngăn hai người đè lên nhau. Bản mới dựng có version 0, khớp với thứ
      client vừa đọc về ở `sheet()`.
    */
    if (sheet.version !== dto.version) {
      throw new ConflictException(
        'Bảng vừa được người khác sửa. Tải lại rồi chấm tiếp.',
      );
    }

    const template = await this.templateOfSheet(sheet);
    const columns = this.inputColumns(template);
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const maxScoreKeys = new Set(
      (template?.columns ?? [])
        .filter((column) => column.semanticKey === 'criterion_max_score')
        .map((column) => column.key),
    );

    /*
      Mọi ô tích của một dòng là MỘT nhóm loại trừ - "Đảm bảo" và "Không đảm
      bảo" là hai nửa của cùng một kết luận, khớp `setFlag` của bảng cá nhân.
      Gom theo kiểu cột vì mẫu không có semanticKey đánh dấu cặp này.
    */
    const flagColumns = columns.filter(
      (column) => column.dataType === 'boolean',
    );

    const byCriterion = new Map(
      sheet.rows.map((row) => [String(row.criterionId), row]),
    );
    let changed = 0;

    for (const patch of dto.rows) {
      const row = byCriterion.get(patch.criterionId);
      if (!row) {
        throw new BadRequestException('Có tiêu chí không nằm trong bảng này.');
      }
      const next = { ...(row.fieldValues ?? {}) };

      const logEdit = (
        column: (typeof columns)[number],
        from: string,
        to: string,
      ) => {
        changed += 1;
        sheet.edits = [
          ...(sheet.edits ?? []),
          {
            byId: actor.id,
            byName: actor.name,
            byDepartmentId: actor.departmentId,
            field: `${row.criterionName} · ${column.title}`,
            from,
            to,
            reason: '',
            at: new Date(),
          },
        ];
      };

      for (const [key, raw] of Object.entries(patch.fieldValues ?? {})) {
        const column = byKey.get(key);
        if (!column) continue;
        const value = String(raw ?? '').trim();
        const before = String(next[key] ?? '');

        if (!value) {
          delete next[key];
        } else if (column.dataType === 'number') {
          const parsed = Number(value.replace(',', '.'));
          if (!Number.isFinite(parsed)) {
            throw new BadRequestException(`Cột "${column.title}" phải là số.`);
          }
          /*
            Cột điểm khai `rangeFromColumnKey` trỏ vào cột Điểm tối đa thì phải
            nằm trong 0 - điểm tối đa của CHÍNH dòng đó. Luật đọc từ mẫu chứ
            không đoán theo tiêu đề - quản trị đổi mẫu là luật đổi theo.
          */
          if (
            column.rangeFromColumnKey &&
            maxScoreKeys.has(column.rangeFromColumnKey) &&
            (parsed < 0 || parsed > row.maxScore)
          ) {
            throw new BadRequestException(
              `"${row.criterionName}" · ${column.title}: điểm phải nằm trong khoảng 0 - ${row.maxScore}.`,
            );
          }
          next[key] = parsed;
        } else if (column.dataType === 'boolean') {
          // Ô tích: "1" hoặc vắng mặt - cùng quy ước với bảng nhiệm vụ.
          next[key] = '1';
          for (const other of flagColumns) {
            if (other.key === key || !next[other.key]) continue;
            logEdit(other, String(next[other.key]), '');
            delete next[other.key];
          }
        } else {
          next[key] = value;
        }

        const after = String(next[key] ?? '');
        if (before === after) continue;
        logEdit(column, before, after);
      }

      row.fieldValues = next;
    }

    if (!changed) {
      return {
        message: 'Không có ô nào thay đổi.',
        data: this.toClient(sheet, template),
      };
    }

    sheet.version += 1;
    sheet.markModified('rows');
    sheet.markModified('edits');
    await sheet.save();

    return {
      message: `Đã lưu ${changed} ô.`,
      data: this.toClient(sheet, template),
    };
  }

  /**
   * Bảng A của một KỲ báo cáo tổng hợp - tháng MỚI NHẤT ĐÃ CHẤM trong kỳ.
   *
   * Kỳ quý, năm trải nhiều tháng mà tháng nào cũng có bảng; mỗi bảng đã là đánh
   * giá trọn 30 điểm của tháng đó nên lấy một bảng chứ không cộng. Kỳ chưa tháng
   * nào chấm thì dựng bảng trống từ danh mục - 0 điểm nhưng trần vẫn đủ, tổng
   * báo cáo không tự dưng tụt mẫu số.
   */
  async periodSnapshot(
    departmentId: Types.ObjectId,
    fromDate: string,
    toDate: string,
  ): Promise<TeamReportSummaryCriteria> {
    const fromMonth = fromDate.slice(0, 7);
    const toMonth = toDate.slice(0, 7);
    const stored = await this.sheetModel
      .findOne({
        departmentId,
        periodMonth: { $gte: fromMonth, $lte: toMonth },
      })
      .sort({ periodMonth: -1 });

    const template = stored
      ? await this.templateOfSheet(stored)
      : await this.currentTemplate();
    const rows = (stored ? stored.rows : await this.freshRows()).map(
      (row) => ({
        criterionId: row.criterionId,
        criterionName: row.criterionName,
        criterionNote: row.criterionNote ?? '',
        maxScore: row.maxScore ?? 0,
        fieldValues: { ...(row.fieldValues ?? {}) },
      }),
    );

    return {
      periodMonth: stored?.periodMonth ?? toMonth,
      saved: Boolean(stored),
      template: template
        ? {
            ...template,
            columns: template.columns as unknown[],
          }
        : null,
      rows,
      ...this.scoreOf(rows, template),
    };
  }

  // ==================================================================== nội bộ

  private toClient(
    sheet: TeamReportCriteriaSheetDocument,
    template: CriteriaTemplate | null,
  ) {
    return {
      sheet: {
        _id: String(sheet._id),
        periodMonth: sheet.periodMonth,
        rows: sheet.rows,
        version: sheet.version,
        edits: sheet.edits ?? [],
        updatedAt: sheet.updatedAt ?? null,
        saved: true,
      },
      template,
      score: this.scoreOf(sheet.rows, template),
    };
  }

  /**
   * Dòng dựng từ danh mục tiêu chí đang hoạt động, theo đúng thứ tự quản trị
   * xếp - chưa chấm ô nào.
   */
  private async freshRows(): Promise<TeamReportCriterionRow[]> {
    const criteria = await this.criterionModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 });
    return criteria.map((criterion) => ({
      criterionId: criterion._id,
      criterionName: criterion.name,
      criterionNote: criterion.note ?? '',
      maxScore: criterion.maxScore ?? 0,
      fieldValues: {},
    }));
  }

  /** Mẫu `forCriteria` đang hoạt động - quản trị chỉ giữ đúng một. */
  private async currentTemplate(): Promise<CriteriaTemplate | null> {
    const template = await this.formTemplateModel
      .findOne({ forCriteria: true, isActive: true })
      .select('code name version columns headerGroups');
    if (!template) return null;
    return {
      _id: String(template._id),
      code: template.code,
      name: template.name,
      version: template.version,
      columns: template.columns,
      headerGroups: template.headerGroups,
    };
  }

  /** Mẫu đã đóng dấu trên bảng - đúng phiên bản lúc lập. */
  private async templateOfSheet(
    sheet: TeamReportCriteriaSheetDocument,
  ): Promise<CriteriaTemplate | null> {
    if (!sheet.formTemplateId) return this.currentTemplate();
    const resolved = await this.formTemplatesService.resolveVersion(
      sheet.formTemplateId,
      sheet.formTemplateVersion ?? 1,
    );
    if (!resolved) return null;
    return { _id: String(sheet.formTemplateId), ...resolved };
  }

  /**
   * Cột người chấm gõ được: bỏ cột hệ thống (STT), ba cột chép từ danh mục
   * (tiêu chí, ghi chú, điểm tối đa) và cột tự tính.
   */
  private inputColumns(template: CriteriaTemplate | null) {
    return (template?.columns ?? []).filter(
      (column) =>
        column.visible &&
        !column.autoValue &&
        column.semanticKey !== 'stt' &&
        column.semanticKey !== 'criterion' &&
        column.semanticKey !== 'criterion_note' &&
        column.semanticKey !== 'criterion_max_score',
    );
  }

  /**
   * Điểm của cả bảng.
   *
   * Cột điểm là cột SỐ khai `rangeFromColumnKey` trỏ vào cột Điểm tối đa - đúng
   * cách mẫu giấy nói "điểm đạt không vượt điểm tối đa". Không có cột nào như
   * vậy thì bảng này không chấm điểm được, trả null chứ không cộng bừa một cột
   * số nào đó.
   */
  private scoreOf(
    rows: TeamReportCriterionRow[],
    template: CriteriaTemplate | null,
  ) {
    const columns = template?.columns ?? [];
    const maxScoreKeys = new Set(
      columns
        .filter((column) => column.semanticKey === 'criterion_max_score')
        .map((column) => column.key),
    );
    const scoreColumn = columns.find(
      (column) =>
        column.visible &&
        column.dataType === 'number' &&
        column.rangeFromColumnKey &&
        maxScoreKeys.has(column.rangeFromColumnKey),
    );

    const max = rows.reduce((sum, row) => sum + (row.maxScore ?? 0), 0);
    if (!scoreColumn) {
      return { scoreColumnKey: null, total: null, max, scoredRows: 0 };
    }

    let total = 0;
    let scoredRows = 0;
    for (const row of rows) {
      const raw = row.fieldValues?.[scoreColumn.key];
      if (raw === undefined || raw === null || String(raw).trim() === '') {
        continue;
      }
      const value = Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(value)) continue;
      total += value;
      scoredRows += 1;
    }
    return { scoreColumnKey: scoreColumn.key, total, max, scoredRows };
  }

  /**
   * Ai chấm được bảng A: đội / tổ (quyền nhập), hoặc trưởng / phó phòng, xã
   * (quyền duyệt + vai trưởng đơn vị) - đơn vị nào cũng chấm bảng của chính
   * mình để trình tiếp lên trên.
   */
  private async assertCanScore(roleCodes: string[]) {
    const roles = await this.roleModel
      .find({ code: { $in: roleCodes }, isActive: true })
      .select('permissions');
    const permissions = new Set(roles.flatMap((role) => role.permissions));
    const allowed =
      roleCodes.includes(RoleCode.SUPER_ADMIN) ||
      permissions.has(Permission.TEAM_REPORT_ENTRY) ||
      (permissions.has(Permission.TEAM_REPORT_REVIEW) &&
        roleCodes.some((code) => UNIT_SCORER_ROLES.includes(code)));
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    }
  }

  /** YYYY-MM hợp lệ; trống thì lấy tháng hiện tại theo giờ server. */
  private requireMonth(value?: string): string {
    const raw = (value ?? '').trim();
    if (!raw) return serverDateYmd().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
      throw new BadRequestException('Tháng phải có dạng YYYY-MM.');
    }
    return raw;
  }

  private async requireActor(userId: string): Promise<Actor> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }
    const user = await this.userModel
      .findById(userId)
      .select('fullName username departmentId roleAssignments');
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    if (!user.departmentId) {
      throw new BadRequestException(
        'Tài khoản chưa gắn đơn vị nên chưa chấm được bảng tiêu chí chung.',
      );
    }
    await this.assertCanScore(
      (user.roleAssignments ?? []).map((assignment) => assignment.roleCode),
    );
    return {
      id: user._id,
      name: user.fullName?.trim() || user.username,
      departmentId: new Types.ObjectId(String(user.departmentId)),
    };
  }
}
