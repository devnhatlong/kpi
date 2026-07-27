import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { RoleCode } from '@/common/enums/role-code.enum';
import type { JwtPayloadUser } from '@/common/interfaces';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import {
  Department,
  DepartmentDocument,
} from '../departments/schemas/department.schema';
import {
  DepartmentLevel,
  DepartmentLevelDocument,
} from '../department-levels/schemas/department-level.schema';
import {
  CreateKpiMasterFormDto,
  KpiIndicatorDto,
  UpdateKpiMasterFormDto,
} from './dto/create-kpi-master-form.dto';
import {
  KpiMasterForm,
  KpiMasterFormDocument,
  KpiMasterFormScope,
  KpiMasterFormStatus,
} from './schemas/kpi-master-form.schema';
import { KpiPeriod, KpiPeriodDocument } from './schemas/kpi-period.schema';
import {
  KpiTemplate,
  KpiTemplateDocument,
} from './schemas/kpi-template.schema';
import {
  UnitKpiSheet,
  UnitKpiSheetDocument,
  UnitKpiSheetStatus,
} from './schemas/unit-kpi-sheet.schema';
import {
  AssignmentTargetType,
  TaskAssignment,
  TaskAssignmentDocument,
  TaskOrigin,
  TaskStatus,
} from './schemas/task-assignment.schema';

const EDITABLE_STATUSES = new Set([
  KpiMasterFormStatus.DRAFT,
  KpiMasterFormStatus.READY,
]);

@Injectable()
export class KpiMasterFormService {
  constructor(
    @InjectModel(KpiMasterForm.name)
    private readonly masterModel: Model<KpiMasterFormDocument>,
    @InjectModel(KpiPeriod.name)
    private readonly periodModel: Model<KpiPeriodDocument>,
    @InjectModel(KpiTemplate.name)
    private readonly templateModel: Model<KpiTemplateDocument>,
    @InjectModel(UnitKpiSheet.name)
    private readonly sheetModel: Model<UnitKpiSheetDocument>,
    @InjectModel(TaskAssignment.name)
    private readonly taskModel: Model<TaskAssignmentDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(DepartmentLevel.name)
    private readonly levelModel: Model<DepartmentLevelDocument>,
  ) {}

  async create(dto: CreateKpiMasterFormDto, user: JwtPayloadUser) {
    this.assertSuperAdmin(user);
    const code = dto.code.trim().toUpperCase();
    if (await this.masterModel.exists({ code })) {
      throw new BadRequestException('Mã form mẫu đã tồn tại.');
    }
    await this.requireById(this.periodModel, dto.periodId, 'Không tìm thấy kỳ KPI.');
    await this.requireById(
      this.templateModel,
      dto.templateId,
      'Không tìm thấy biểu mẫu cột.',
    );
    this.validateIndicators(dto.indicators);
    this.validateScope(dto);

    const data = await this.masterModel.create({
      name: dto.name.trim(),
      code,
      description: dto.description?.trim() ?? '',
      formType: dto.formType?.trim() || 'KPI',
      periodId: new Types.ObjectId(dto.periodId),
      templateId: new Types.ObjectId(dto.templateId),
      scopeType: dto.scopeType ?? KpiMasterFormScope.ALL_PHONG,
      provinceDepartmentId: dto.provinceDepartmentId
        ? new Types.ObjectId(dto.provinceDepartmentId)
        : undefined,
      targetDepartmentIds: (dto.targetDepartmentIds ?? []).map(
        (id) => new Types.ObjectId(id),
      ),
      indicators: this.normalizeIndicators(dto.indicators),
      status: KpiMasterFormStatus.DRAFT,
      version: 1,
      createdBy: new Types.ObjectId(user.uid),
    });
    await this.populateMaster(data);
    return { message: 'Tạo mẫu KPI thành công.', data };
  }

  async list(query: PaginationQueryDto, user: JwtPayloadUser) {
    const filter: Record<string, unknown> = {};
    // Manager/Unit Admin: chỉ xem form đã phát hành (read-only mẫu tỉnh — 3B)
    if (!this.isSuperAdmin(user)) {
      filter.status = {
        $in: [
          KpiMasterFormStatus.PUBLISHED,
          KpiMasterFormStatus.LOCKED,
          KpiMasterFormStatus.CLOSED,
        ],
      };
    }
    return this.paginate(this.masterModel, filter, query, { updatedAt: -1 }, [
      { path: 'periodId', select: 'code name startDate endDate' },
      { path: 'templateId', select: 'code name' },
      { path: 'provinceDepartmentId', select: 'code name' },
      { path: 'targetDepartmentIds', select: 'code name' },
      { path: 'createdBy', select: 'username fullName' },
      { path: 'publishedBy', select: 'username fullName' },
    ]);
  }

  async getOne(id: string, user: JwtPayloadUser) {
    const form = await this.requireById(
      this.masterModel,
      id,
      'Không tìm thấy mẫu KPI.',
    );
    if (
      !this.isSuperAdmin(user) &&
      ![
        KpiMasterFormStatus.PUBLISHED,
        KpiMasterFormStatus.LOCKED,
        KpiMasterFormStatus.CLOSED,
      ].includes(form.status)
    ) {
      throw new ForbiddenException('Mẫu KPI chưa được phát hành.');
    }
    await this.populateMaster(form);
    return { data: form };
  }

  async update(id: string, dto: UpdateKpiMasterFormDto, user: JwtPayloadUser) {
    this.assertSuperAdmin(user);
    const form = await this.requireById(
      this.masterModel,
      id,
      'Không tìm thấy mẫu KPI.',
    );
    if (!EDITABLE_STATUSES.has(form.status)) {
      throw new BadRequestException(
        'Form đã phát hành — không sửa trực tiếp. Tạo phiên bản mới nếu cần.',
      );
    }
    if (dto.name !== undefined) form.name = dto.name.trim();
    if (dto.description !== undefined) form.description = dto.description.trim();
    if (dto.formType !== undefined) form.formType = dto.formType.trim() || 'KPI';
    if (dto.periodId !== undefined) {
      await this.requireById(this.periodModel, dto.periodId, 'Không tìm thấy kỳ KPI.');
      form.periodId = new Types.ObjectId(dto.periodId);
    }
    if (dto.templateId !== undefined) {
      await this.requireById(
        this.templateModel,
        dto.templateId,
        'Không tìm thấy biểu mẫu cột.',
      );
      form.templateId = new Types.ObjectId(dto.templateId);
    }
    if (dto.scopeType !== undefined) form.scopeType = dto.scopeType;
    if (dto.provinceDepartmentId !== undefined) {
      form.provinceDepartmentId = dto.provinceDepartmentId
        ? new Types.ObjectId(dto.provinceDepartmentId)
        : undefined;
    }
    if (dto.targetDepartmentIds !== undefined) {
      form.targetDepartmentIds = dto.targetDepartmentIds.map(
        (v) => new Types.ObjectId(v),
      );
    }
    if (dto.indicators !== undefined) {
      this.validateIndicators(dto.indicators);
      form.indicators = this.normalizeIndicators(dto.indicators);
    }
    if (dto.status !== undefined) {
      if (
        dto.status !== KpiMasterFormStatus.DRAFT &&
        dto.status !== KpiMasterFormStatus.READY
      ) {
        throw new BadRequestException(
          'Chỉ chuyển Nháp / Chờ phát hành bằng cập nhật. Dùng API phát hành để publish.',
        );
      }
      form.status = dto.status;
    }
    this.validateScope({
      scopeType: form.scopeType,
      provinceDepartmentId: form.provinceDepartmentId
        ? String(form.provinceDepartmentId)
        : undefined,
      targetDepartmentIds: form.targetDepartmentIds.map(String),
    });
    await form.save();
    await this.populateMaster(form);
    return { message: 'Cập nhật mẫu KPI thành công.', data: form };
  }

  async markReady(id: string, user: JwtPayloadUser) {
    this.assertSuperAdmin(user);
    const form = await this.requireById(
      this.masterModel,
      id,
      'Không tìm thấy mẫu KPI.',
    );
    if (form.status !== KpiMasterFormStatus.DRAFT) {
      throw new BadRequestException('Chỉ chuyển Chờ phát hành từ trạng thái Nháp.');
    }
    if (!form.indicators.length) {
      throw new BadRequestException('Form chưa có chỉ tiêu.');
    }
    form.status = KpiMasterFormStatus.READY;
    await form.save();
    await this.populateMaster(form);
    return { message: 'Form đã sẵn sàng phát hành.', data: form };
  }

  /**
   * Phát hành: tạo/cập nhật Form KPI cho từng Phòng trong phạm vi,
   * seed chỉ tiêu origin = FROM_PROVINCE (1A: chỉ cấp phòng).
   */
  async publish(id: string, user: JwtPayloadUser) {
    this.assertSuperAdmin(user);
    const form = await this.requireById(
      this.masterModel,
      id,
      'Không tìm thấy mẫu KPI.',
    );
    if (
      form.status !== KpiMasterFormStatus.DRAFT &&
      form.status !== KpiMasterFormStatus.READY
    ) {
      throw new BadRequestException('Form đã được phát hành hoặc đã khóa.');
    }
    if (!form.indicators.length) {
      throw new BadRequestException('Form chưa có chỉ tiêu.');
    }

    const period = await this.requireById(
      this.periodModel,
      String(form.periodId),
      'Không tìm thấy kỳ KPI.',
    );
    const phongIds = await this.resolveTargetPhongIds(form);
    if (!phongIds.length) {
      throw new BadRequestException(
        'Không có phòng nào trong phạm vi áp dụng.',
      );
    }

    const defaultDue = form.indicators.find((i) => i.dueDate)?.dueDate
      ?? period.endDate;

    let sheetCount = 0;
    let taskCount = 0;

    for (const phongId of phongIds) {
      let sheet = await this.sheetModel.findOne({
        departmentId: phongId,
        periodId: form.periodId,
      });
      if (!sheet) {
        sheet = await this.sheetModel.create({
          departmentId: phongId,
          periodId: form.periodId,
          templateId: form.templateId,
          status: UnitKpiSheetStatus.ACTIVE,
        });
        sheetCount += 1;
      }

      for (const indicator of form.indicators) {
        const code = indicator.code.toUpperCase();
        const existing = await this.taskModel.findOne({
          sheetId: sheet._id,
          sourceMasterFormId: form._id,
          indicatorCode: code,
          origin: TaskOrigin.FROM_PROVINCE,
        });
        if (existing) continue;

        await this.taskModel.create({
          sheetId: sheet._id,
          ownerDepartmentId: phongId,
          origin: TaskOrigin.FROM_PROVINCE,
          sourceMasterFormId: form._id,
          indicatorCode: code,
          indicatorWeight: indicator.weight,
          title: indicator.name,
          description: [
            indicator.description,
            indicator.criteria ? `Tiêu chí: ${indicator.criteria}` : '',
            indicator.evidenceRequired
              ? `Minh chứng: ${indicator.evidenceRequired}`
              : '',
            indicator.scoringMethod
              ? `Cách tính: ${indicator.scoringMethod}`
              : '',
          ]
            .filter(Boolean)
            .join('\n'),
          dueDate: indicator.dueDate ?? defaultDue,
          product: indicator.unit?.trim() || 'Chỉ tiêu KPI cấp tỉnh',
          standardScore: indicator.weight,
          assignmentTargetType: AssignmentTargetType.UNASSIGNED,
          status: TaskStatus.ASSIGNED,
          fieldValues: {},
          createdBy: new Types.ObjectId(user.uid),
        });
        taskCount += 1;
      }
    }

    form.status = KpiMasterFormStatus.PUBLISHED;
    form.publishedAt = new Date();
    form.publishedBy = new Types.ObjectId(user.uid);
    await form.save();
    await this.populateMaster(form);

    return {
      message: `Đã phát hành cho ${phongIds.length} phòng.`,
      data: {
        form,
        phongCount: phongIds.length,
        sheetsCreated: sheetCount,
        tasksCreated: taskCount,
      },
    };
  }

  async setStatus(
    id: string,
    status: KpiMasterFormStatus,
    user: JwtPayloadUser,
  ) {
    this.assertSuperAdmin(user);
    const form = await this.requireById(
      this.masterModel,
      id,
      'Không tìm thấy mẫu KPI.',
    );
    const allowed: Partial<Record<KpiMasterFormStatus, KpiMasterFormStatus[]>> =
      {
        [KpiMasterFormStatus.PUBLISHED]: [
          KpiMasterFormStatus.LOCKED,
          KpiMasterFormStatus.CLOSED,
          KpiMasterFormStatus.CANCELLED,
        ],
        [KpiMasterFormStatus.LOCKED]: [
          KpiMasterFormStatus.PUBLISHED,
          KpiMasterFormStatus.CLOSED,
        ],
        [KpiMasterFormStatus.DRAFT]: [KpiMasterFormStatus.CANCELLED],
        [KpiMasterFormStatus.READY]: [KpiMasterFormStatus.CANCELLED],
      };
    const next = allowed[form.status] ?? [];
    if (!next.includes(status)) {
      throw new BadRequestException(
        `Không chuyển từ ${form.status} sang ${status}.`,
      );
    }
    form.status = status;
    await form.save();
    await this.populateMaster(form);
    return { message: 'Cập nhật trạng thái thành công.', data: form };
  }

  async tracking(id: string, user: JwtPayloadUser) {
    this.assertSuperAdmin(user);
    const form = await this.requireById(
      this.masterModel,
      id,
      'Không tìm thấy mẫu KPI.',
    );
    const phongIds = await this.resolveTargetPhongIds(form);
    const depts = await this.departmentModel
      .find({ _id: { $in: phongIds } })
      .select('code name')
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    const rows: Array<{
      departmentId: string;
      code: string;
      name: string;
      hasSheet: boolean;
      indicatorCount: number;
      assignedCount: number;
      completedCount: number;
      statusSummary: {
        unassigned: number;
        inProgress: number;
        submitted: number;
        appraised: number;
      };
    }> = [];
    for (const dept of depts) {
      const sheet = await this.sheetModel.findOne({
        departmentId: dept._id,
        periodId: form.periodId,
      });
      const tasks = sheet
        ? await this.taskModel
            .find({
              sheetId: sheet._id,
              sourceMasterFormId: form._id,
              origin: TaskOrigin.FROM_PROVINCE,
            })
            .lean()
        : [];
      const assigned = tasks.filter(
        (t) => t.assignmentTargetType !== AssignmentTargetType.UNASSIGNED,
      ).length;
      const done = tasks.filter(
        (t) =>
          t.status === TaskStatus.SUBMITTED ||
          t.status === TaskStatus.APPRAISED,
      ).length;
      rows.push({
        departmentId: String(dept._id),
        code: dept.code,
        name: dept.name,
        hasSheet: Boolean(sheet),
        indicatorCount: tasks.length,
        assignedCount: assigned,
        completedCount: done,
        statusSummary: {
          unassigned: tasks.length - assigned,
          inProgress: tasks.filter((t) => t.status === TaskStatus.IN_PROGRESS)
            .length,
          submitted: tasks.filter((t) => t.status === TaskStatus.SUBMITTED)
            .length,
          appraised: tasks.filter((t) => t.status === TaskStatus.APPRAISED)
            .length,
        },
      });
    }

    return {
      data: {
        formId: String(form._id),
        formName: form.name,
        status: form.status,
        phongTotal: rows.length,
        phongWithSheet: rows.filter((r) => r.hasSheet).length,
        phongAssigned: rows.filter((r) => r.assignedCount > 0).length,
        rows,
      },
    };
  }

  async delete(id: string, user: JwtPayloadUser) {
    this.assertSuperAdmin(user);
    const form = await this.requireById(
      this.masterModel,
      id,
      'Không tìm thấy mẫu KPI.',
    );
    if (form.status === KpiMasterFormStatus.PUBLISHED) {
      throw new BadRequestException(
        'Không xoá form đã phát hành. Hãy hủy hoặc kết thúc.',
      );
    }
    await form.deleteOne();
    return { message: 'Đã xoá mẫu KPI.' };
  }

  // ── Helpers ──────────────────────────────────────────────

  private async resolveTargetPhongIds(
    form: KpiMasterFormDocument,
  ): Promise<Types.ObjectId[]> {
    const phongLevel = await this.levelModel.findOne({ code: 'PHONG' }).lean();
    if (!phongLevel) {
      throw new BadRequestException('Chưa cấu hình cấp đơn vị PHONG.');
    }

    if (form.scopeType === KpiMasterFormScope.SELECTED_DEPTS) {
      if (!form.targetDepartmentIds?.length) {
        throw new BadRequestException('Chưa chọn phòng áp dụng.');
      }
      const depts = await this.departmentModel
        .find({
          _id: { $in: form.targetDepartmentIds },
          levelId: phongLevel._id,
          isActive: true,
        })
        .select('_id');
      return depts.map((d) => d._id);
    }

    if (form.scopeType === KpiMasterFormScope.PROVINCE) {
      if (!form.provinceDepartmentId) {
        throw new BadRequestException('Chưa chọn Công an tỉnh.');
      }
      const depts = await this.departmentModel
        .find({
          parentId: form.provinceDepartmentId,
          levelId: phongLevel._id,
          isActive: true,
        })
        .select('_id');
      return depts.map((d) => d._id);
    }

    // ALL_PHONG
    const depts = await this.departmentModel
      .find({ levelId: phongLevel._id, isActive: true })
      .select('_id');
    return depts.map((d) => d._id);
  }

  private validateIndicators(indicators: KpiIndicatorDto[]) {
    if (!indicators?.length) {
      throw new BadRequestException('Cần ít nhất một chỉ tiêu.');
    }
    const codes = indicators.map((i) => i.code.trim().toUpperCase());
    if (new Set(codes).size !== codes.length) {
      throw new BadRequestException('Mã chỉ tiêu phải duy nhất trong form.');
    }
    const weightSum = indicators.reduce((s, i) => s + Number(i.weight || 0), 0);
    if (Math.abs(weightSum - 100) > 0.01) {
      throw new BadRequestException(
        `Tổng trọng số phải bằng 100% (hiện ${weightSum}%).`,
      );
    }
  }

  private normalizeIndicators(indicators: KpiIndicatorDto[]) {
    return indicators.map((item, index) => ({
      code: item.code.trim().toUpperCase(),
      name: item.name.trim(),
      description: item.description?.trim() ?? '',
      weight: item.weight,
      criteria: item.criteria?.trim() ?? '',
      unit: item.unit?.trim() ?? '',
      evidenceRequired: item.evidenceRequired?.trim() ?? '',
      scoringMethod: item.scoringMethod?.trim() ?? '',
      dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
      sortOrder: item.sortOrder ?? index,
    }));
  }

  private validateScope(dto: {
    scopeType?: KpiMasterFormScope;
    provinceDepartmentId?: string;
    targetDepartmentIds?: string[];
  }) {
    const scope = dto.scopeType ?? KpiMasterFormScope.ALL_PHONG;
    if (scope === KpiMasterFormScope.PROVINCE && !dto.provinceDepartmentId) {
      throw new BadRequestException(
        'Scope toàn tỉnh cần chọn đơn vị Công an tỉnh.',
      );
    }
    if (
      scope === KpiMasterFormScope.SELECTED_DEPTS &&
      !dto.targetDepartmentIds?.length
    ) {
      throw new BadRequestException('Vui lòng chọn ít nhất một phòng.');
    }
  }

  private populateMaster(form: KpiMasterFormDocument) {
    return form.populate([
      { path: 'periodId', select: 'code name startDate endDate' },
      { path: 'templateId', select: 'code name columns headerGroups' },
      { path: 'provinceDepartmentId', select: 'code name' },
      { path: 'targetDepartmentIds', select: 'code name' },
      { path: 'createdBy', select: 'username fullName' },
      { path: 'publishedBy', select: 'username fullName' },
    ]);
  }

  private isSuperAdmin(user: JwtPayloadUser) {
    return (user.role ?? []).some((r) => r.roleCode === RoleCode.SUPER_ADMIN);
  }

  private assertSuperAdmin(user: JwtPayloadUser) {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenException('Chỉ Super Admin thực hiện được thao tác này.');
    }
  }

  private async paginate<T>(
    model: Model<T>,
    filter: Record<string, unknown>,
    query: PaginationQueryDto,
    sort: Record<string, 1 | -1>,
    populate: Parameters<ReturnType<Model<T>['find']>['populate']>[0] = [],
  ) {
    if (query.all) {
      const data = await model.find(filter).sort(sort).populate(populate);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [data, total] = await Promise.all([
      model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(populate),
      model.countDocuments(filter),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  private async requireById<T>(
    model: Model<T>,
    id: string,
    message: string,
  ): Promise<ReturnType<Model<T>['hydrate']>> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException(message);
    const document = await model.findById(id);
    if (!document) throw new NotFoundException(message);
    return document;
  }
}
