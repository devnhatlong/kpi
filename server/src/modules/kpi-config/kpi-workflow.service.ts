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
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateKpiPeriodDto } from './dto/create-kpi-period.dto';
import { UpdateKpiPeriodDto } from './dto/update-kpi-period.dto';
import { CreateUnitKpiSheetDto } from './dto/create-unit-kpi-sheet.dto';
import { UpdateUnitKpiSheetDto } from './dto/update-unit-kpi-sheet.dto';
import { CreateUnitHandoffDto } from './dto/create-unit-handoff.dto';
import {
  AcceptUnitHandoffDto,
  AssignTaskTargetDto,
  RejectUnitHandoffDto,
} from './dto/handoff-actions.dto';
import {
  UnitHandoffListQueryDto,
  UnitKpiSheetListQueryDto,
} from './dto/workflow-list-query.dto';
import { KpiPeriod, KpiPeriodDocument } from './schemas/kpi-period.schema';
import {
  UnitKpiSheet,
  UnitKpiSheetDocument,
  UnitKpiSheetStatus,
} from './schemas/unit-kpi-sheet.schema';
import {
  UnitHandoff,
  UnitHandoffDocument,
  UnitHandoffStatus,
} from './schemas/unit-handoff.schema';
import {
  AssignmentTargetType,
  TaskAssignment,
  TaskAssignmentDocument,
  TaskOrigin,
  TaskStatus,
} from './schemas/task-assignment.schema';
import {
  WorkContent,
  WorkContentDocument,
} from './schemas/work-content.schema';
import {
  KpiTemplate,
  KpiTemplateDocument,
} from './schemas/kpi-template.schema';

@Injectable()
export class KpiWorkflowService {
  constructor(
    @InjectModel(KpiPeriod.name)
    private readonly periodModel: Model<KpiPeriodDocument>,
    @InjectModel(UnitKpiSheet.name)
    private readonly sheetModel: Model<UnitKpiSheetDocument>,
    @InjectModel(UnitHandoff.name)
    private readonly handoffModel: Model<UnitHandoffDocument>,
    @InjectModel(TaskAssignment.name)
    private readonly taskModel: Model<TaskAssignmentDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(KpiTemplate.name)
    private readonly templateModel: Model<KpiTemplateDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(DepartmentLevel.name)
    private readonly levelModel: Model<DepartmentLevelDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // ── Periods ──────────────────────────────────────────────

  async createPeriod(dto: CreateKpiPeriodDto) {
    const code = dto.code.trim().toUpperCase();
    if (await this.periodModel.exists({ code })) {
      throw new BadRequestException('Mã kỳ KPI đã tồn tại.');
    }
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu.');
    }
    const data = await this.periodModel.create({
      code,
      name: dto.name.trim(),
      startDate,
      endDate,
      isActive: dto.isActive ?? true,
    });
    return { message: 'Tạo kỳ KPI thành công.', data };
  }

  async listPeriods(query: PaginationQueryDto) {
    return this.paginate(this.periodModel, {}, query, {
      startDate: -1,
      code: 1,
    });
  }

  async updatePeriod(id: string, dto: UpdateKpiPeriodDto) {
    const period = await this.requireById(
      this.periodModel,
      id,
      'Không tìm thấy kỳ KPI.',
    );
    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      if (await this.periodModel.exists({ code, _id: { $ne: period._id } })) {
        throw new BadRequestException('Mã kỳ KPI đã tồn tại.');
      }
      period.code = code;
    }
    if (dto.name !== undefined) period.name = dto.name.trim();
    if (dto.startDate !== undefined) period.startDate = new Date(dto.startDate);
    if (dto.endDate !== undefined) period.endDate = new Date(dto.endDate);
    if (dto.isActive !== undefined) period.isActive = dto.isActive;
    if (period.endDate < period.startDate) {
      throw new BadRequestException('Ngày kết thúc phải sau ngày bắt đầu.');
    }
    await period.save();
    return { message: 'Cập nhật kỳ KPI thành công.', data: period };
  }

  async deletePeriod(id: string) {
    const period = await this.requireById(
      this.periodModel,
      id,
      'Không tìm thấy kỳ KPI.',
    );
    if (await this.sheetModel.exists({ periodId: period._id })) {
      throw new BadRequestException('Không thể xoá kỳ đang có Form KPI.');
    }
    await period.deleteOne();
    return { message: 'Xoá kỳ KPI thành công.' };
  }

  // ── Sheets (Form 1) ──────────────────────────────────────

  async createSheet(dto: CreateUnitKpiSheetDto, user: JwtPayloadUser) {
    this.assertCanAccessDepartment(user, dto.departmentId);
    await this.requireById(
      this.departmentModel,
      dto.departmentId,
      'Không tìm thấy đơn vị.',
    );
    await this.requireById(
      this.periodModel,
      dto.periodId,
      'Không tìm thấy kỳ KPI.',
    );
    await this.requireById(
      this.templateModel,
      dto.templateId,
      'Không tìm thấy biểu mẫu.',
    );

    const existing = await this.sheetModel.findOne({
      departmentId: new Types.ObjectId(dto.departmentId),
      periodId: new Types.ObjectId(dto.periodId),
    });
    if (existing) {
      throw new BadRequestException(
        'Đơn vị đã có Form KPI cho kỳ này.',
      );
    }

    const data = await this.sheetModel.create({
      departmentId: new Types.ObjectId(dto.departmentId),
      periodId: new Types.ObjectId(dto.periodId),
      templateId: new Types.ObjectId(dto.templateId),
      status: dto.status ?? UnitKpiSheetStatus.ACTIVE,
    });
    await this.populateSheet(data);
    return { message: 'Tạo Form KPI thành công.', data };
  }

  async listSheets(query: UnitKpiSheetListQueryDto, user: JwtPayloadUser) {
    const filter: Record<string, unknown> = {};
    if (query.departmentId) {
      this.assertCanAccessDepartment(user, query.departmentId);
      filter.departmentId = new Types.ObjectId(query.departmentId);
    } else if (!this.isSuperAdmin(user)) {
      const scoped = this.scopedDepartmentObjectIds(user);
      if (!scoped.length) {
        return buildPaginatedResponse([], 0, 1, query.limit ?? 10);
      }
      filter.departmentId = { $in: scoped };
    }
    if (query.periodId) filter.periodId = new Types.ObjectId(query.periodId);
    if (query.status) filter.status = query.status;
    return this.paginate(
      this.sheetModel,
      filter,
      query,
      { updatedAt: -1 },
      this.sheetPopulate(),
    );
  }

  async getSheet(id: string, user: JwtPayloadUser) {
    const sheet = await this.requireById(
      this.sheetModel,
      id,
      'Không tìm thấy Form KPI.',
    );
    this.assertCanAccessDepartment(user, String(sheet.departmentId));
    await this.populateSheet(sheet);
    return { data: sheet };
  }

  async updateSheet(
    id: string,
    dto: UpdateUnitKpiSheetDto,
    user: JwtPayloadUser,
  ) {
    const sheet = await this.requireById(
      this.sheetModel,
      id,
      'Không tìm thấy Form KPI.',
    );
    this.assertCanAccessDepartment(user, String(sheet.departmentId));
    if (dto.templateId !== undefined) {
      await this.requireById(
        this.templateModel,
        dto.templateId,
        'Không tìm thấy biểu mẫu.',
      );
      sheet.templateId = new Types.ObjectId(dto.templateId);
    }
    if (dto.status !== undefined) sheet.status = dto.status;
    await sheet.save();
    await this.populateSheet(sheet);
    return { message: 'Cập nhật Form KPI thành công.', data: sheet };
  }

  async listSheetTasks(sheetId: string, user: JwtPayloadUser) {
    const sheet = await this.requireById(
      this.sheetModel,
      sheetId,
      'Không tìm thấy Form KPI.',
    );
    this.assertCanAccessDepartment(user, String(sheet.departmentId));
    const data = await this.taskModel
      .find({ sheetId: sheet._id })
      .sort({ dueDate: 1, createdAt: -1 })
      .populate(this.taskPopulate());
    return { data };
  }

  async createSheetTask(
    sheetId: string,
    body: {
      contentId: string;
      title: string;
      description?: string;
      dueDate: string;
      product: string;
      standardScore: number;
      note?: string;
      fieldValues?: Record<string, string | number>;
    },
    user: JwtPayloadUser,
  ) {
    const sheet = await this.requireById(
      this.sheetModel,
      sheetId,
      'Không tìm thấy Form KPI.',
    );
    this.assertCanAccessDepartment(user, String(sheet.departmentId));
    await this.requireById(
      this.workContentModel,
      body.contentId,
      'Không tìm thấy nội dung công việc.',
    );

    const template = await this.templateModel.findById(sheet.templateId).lean();
    const allowedIds = (template?.includedContentIds ?? []).map(String);
    if (!allowedIds.includes(String(body.contentId))) {
      throw new BadRequestException(
        'Nội dung công việc không thuộc biểu mẫu KPI này.',
      );
    }

    const data = await this.taskModel.create({
      sheetId: sheet._id,
      ownerDepartmentId: sheet.departmentId,
      contentId: new Types.ObjectId(body.contentId),
      title: body.title.trim(),
      description: body.description?.trim() ?? '',
      dueDate: new Date(body.dueDate),
      product: body.product.trim(),
      standardScore: body.standardScore,
      note: body.note?.trim() ?? '',
      fieldValues: body.fieldValues ?? {},
      origin: TaskOrigin.OWN,
      assignmentTargetType: AssignmentTargetType.UNASSIGNED,
      status: TaskStatus.ASSIGNED,
      createdBy: new Types.ObjectId(user.uid),
    });
    await data.populate(this.taskPopulate());
    return { message: 'Thêm nhiệm vụ vào Form KPI thành công.', data };
  }

  async assignTaskTarget(
    taskId: string,
    dto: AssignTaskTargetDto,
    user: JwtPayloadUser,
  ) {
    const task = await this.requireById(
      this.taskModel,
      taskId,
      'Không tìm thấy nhiệm vụ.',
    );
    if (!task.ownerDepartmentId) {
      throw new BadRequestException(
        'Nhiệm vụ chưa gắn Form KPI đơn vị — không thể giao dọc.',
      );
    }
    this.assertCanAccessDepartment(user, String(task.ownerDepartmentId));

    if (dto.targetType === 'USER') {
      if (!dto.userId) {
        throw new BadRequestException('Vui lòng chọn cán bộ nhận nhiệm vụ.');
      }
      const assignee = await this.userModel.findOne({
        _id: new Types.ObjectId(dto.userId),
        isActive: true,
      });
      if (!assignee) {
        throw new BadRequestException('Cán bộ không tồn tại hoặc đã ngừng.');
      }
      if (
        assignee.departmentId &&
        String(assignee.departmentId) !== String(task.ownerDepartmentId)
      ) {
        throw new BadRequestException(
          'Cán bộ phải thuộc đúng đơn vị sở hữu nhiệm vụ.',
        );
      }
      task.assignmentTargetType = AssignmentTargetType.USER;
      task.assigneeId = assignee._id;
      task.targetDepartmentId = undefined;
      await task.save();
      await task.populate(this.taskPopulate());
      return { message: 'Đã giao nhiệm vụ cho cán bộ.', data: task };
    }

    if (!dto.departmentId) {
      throw new BadRequestException('Vui lòng chọn đội nhận nhiệm vụ.');
    }
    const child = await this.requireById(
      this.departmentModel,
      dto.departmentId,
      'Không tìm thấy đơn vị nhận.',
    );
    if (String(child.parentId ?? '') !== String(task.ownerDepartmentId)) {
      throw new BadRequestException(
        'Chỉ được giao cho đơn vị con trực tiếp.',
      );
    }
    if (!task.sheetId) {
      throw new BadRequestException('Nhiệm vụ thiếu sheet Form 1.');
    }
    const parentSheet = await this.requireById(
      this.sheetModel,
      String(task.sheetId),
      'Không tìm thấy Form KPI.',
    );

    const childSheet = await this.ensureSheetForDepartment(
      String(child._id),
      String(parentSheet.periodId),
      dto.childTemplateId ?? String(parentSheet.templateId),
    );

    task.assignmentTargetType = AssignmentTargetType.CHILD_DEPARTMENT;
    task.targetDepartmentId = child._id;
    task.assigneeId = undefined;
    await task.save();

    let childTask = await this.taskModel.findOne({
      parentTaskId: task._id,
      ownerDepartmentId: child._id,
    });
    if (!childTask) {
      childTask = await this.taskModel.create({
        sheetId: childSheet._id,
        ownerDepartmentId: child._id,
        parentTaskId: task._id,
        contentId: task.contentId,
        title: task.title,
        description: task.description ?? '',
        dueDate: task.dueDate,
        reportDueDate: task.reportDueDate,
        product: task.product,
        standardScore: task.standardScore,
        note: task.note ?? '',
        fieldValues: { ...(task.fieldValues ?? {}) },
        origin: TaskOrigin.FROM_PARENT,
        sourceMasterFormId: task.sourceMasterFormId,
        indicatorCode: task.indicatorCode,
        indicatorWeight: task.indicatorWeight,
        assignmentTargetType: AssignmentTargetType.UNASSIGNED,
        status: TaskStatus.ASSIGNED,
        createdBy: new Types.ObjectId(user.uid),
      });
    }
    await task.populate(this.taskPopulate());
    await childTask.populate(this.taskPopulate());
    return {
      message: 'Đã giao nhiệm vụ xuống đơn vị con.',
      data: { parentTask: task, childTask },
    };
  }

  // ── Handoffs (Form 2 / 3) ────────────────────────────────

  async createHandoff(dto: CreateUnitHandoffDto, user: JwtPayloadUser) {
    this.assertCanAccessDepartment(user, dto.sourceDepartmentId);
    if (dto.sourceDepartmentId === dto.targetDepartmentId) {
      throw new BadRequestException('Không thể giao cho chính đơn vị mình.');
    }

    const [source, target] = await Promise.all([
      this.requireById(
        this.departmentModel,
        dto.sourceDepartmentId,
        'Không tìm thấy đơn vị chủ trì.',
      ),
      this.requireById(
        this.departmentModel,
        dto.targetDepartmentId,
        'Không tìm thấy đơn vị nhận.',
      ),
    ]);

    await this.assertPeerDepartments(source, target);
    await this.requireById(
      this.workContentModel,
      dto.contentId,
      'Không tìm thấy nội dung công việc.',
    );

    if (dto.periodId) {
      await this.requireById(
        this.periodModel,
        dto.periodId,
        'Không tìm thấy kỳ KPI.',
      );
    }
    if (dto.sourceTaskId) {
      const sourceTask = await this.requireById(
        this.taskModel,
        dto.sourceTaskId,
        'Không tìm thấy nhiệm vụ nguồn.',
      );
      if (
        sourceTask.ownerDepartmentId &&
        String(sourceTask.ownerDepartmentId) !== dto.sourceDepartmentId
      ) {
        throw new BadRequestException(
          'Nhiệm vụ nguồn không thuộc đơn vị chủ trì.',
        );
      }
    }

    const data = await this.handoffModel.create({
      sourceDepartmentId: new Types.ObjectId(dto.sourceDepartmentId),
      targetDepartmentId: new Types.ObjectId(dto.targetDepartmentId),
      periodId: dto.periodId
        ? new Types.ObjectId(dto.periodId)
        : undefined,
      contentId: new Types.ObjectId(dto.contentId),
      title: dto.title.trim(),
      description: dto.description?.trim() ?? '',
      dueDate: new Date(dto.dueDate),
      product: dto.product.trim(),
      standardScore: dto.standardScore,
      sourceTaskId: dto.sourceTaskId
        ? new Types.ObjectId(dto.sourceTaskId)
        : undefined,
      note: dto.note?.trim() ?? '',
      status: dto.status ?? UnitHandoffStatus.SENT,
      createdBy: new Types.ObjectId(user.uid),
    });
    await this.populateHandoff(data);
    return { message: 'Đã giao nhiệm vụ sang đơn vị ngang cấp.', data };
  }

  async listHandoffs(query: UnitHandoffListQueryDto, user: JwtPayloadUser) {
    if (!query.departmentId) {
      throw new BadRequestException('Vui lòng chọn đơn vị làm việc.');
    }
    this.assertCanAccessDepartment(user, query.departmentId);

    const filter: Record<string, unknown> = {};
    const deptId = new Types.ObjectId(query.departmentId);
    if (query.direction === 'in') {
      filter.targetDepartmentId = deptId;
    } else {
      // default Form 2 outbound
      filter.sourceDepartmentId = deptId;
    }
    if (query.periodId) filter.periodId = new Types.ObjectId(query.periodId);
    if (query.status) filter.status = query.status;

    return this.paginate(
      this.handoffModel,
      filter,
      query,
      { createdAt: -1 },
      this.handoffPopulate(),
    );
  }

  async acceptHandoff(
    id: string,
    dto: AcceptUnitHandoffDto,
    user: JwtPayloadUser,
  ) {
    const handoff = await this.requireById(
      this.handoffModel,
      id,
      'Không tìm thấy nhiệm vụ giao ngang.',
    );
    this.assertCanAccessDepartment(user, String(handoff.targetDepartmentId));

    if (handoff.status !== UnitHandoffStatus.SENT) {
      throw new BadRequestException(
        'Chỉ nhận được nhiệm vụ đang ở trạng thái đã gửi.',
      );
    }

    let sheet: UnitKpiSheetDocument;
    if (dto.sheetId) {
      sheet = await this.requireById(
        this.sheetModel,
        dto.sheetId,
        'Không tìm thấy Form KPI.',
      );
      if (String(sheet.departmentId) !== String(handoff.targetDepartmentId)) {
        throw new BadRequestException(
          'Form KPI không thuộc đơn vị tiếp nhận.',
        );
      }
    } else {
      const periodId =
        dto.periodId ??
        (handoff.periodId ? String(handoff.periodId) : undefined);
      if (!periodId) {
        throw new BadRequestException(
          'Cần chọn kỳ KPI để đưa nhiệm vụ vào Form 1.',
        );
      }
      const templateId =
        dto.templateId ?? (await this.resolveDefaultTemplateId());
      sheet = await this.ensureSheetForDepartment(
        String(handoff.targetDepartmentId),
        periodId,
        templateId,
      );
    }

    const task = await this.taskModel.create({
      sheetId: sheet._id,
      ownerDepartmentId: sheet.departmentId,
      contentId: handoff.contentId,
      title: handoff.title,
      description: handoff.description ?? '',
      dueDate: handoff.dueDate,
      product: handoff.product,
      standardScore: handoff.standardScore,
      note: handoff.note ?? '',
      fieldValues: {},
      origin: TaskOrigin.FROM_HANDOFF,
      sourceHandoffId: handoff._id,
      assignmentTargetType: AssignmentTargetType.UNASSIGNED,
      status: TaskStatus.ASSIGNED,
      createdBy: new Types.ObjectId(user.uid),
    });

    handoff.status = UnitHandoffStatus.ACCEPTED;
    handoff.acceptedTaskId = task._id;
    handoff.acceptedBy = new Types.ObjectId(user.uid);
    handoff.acceptedAt = new Date();
    if (!handoff.periodId) handoff.periodId = sheet.periodId;
    await handoff.save();

    await this.populateHandoff(handoff);
    await task.populate(this.taskPopulate());
    return {
      message: 'Đã tiếp nhận và đưa vào Form KPI.',
      data: { handoff, task },
    };
  }

  async rejectHandoff(
    id: string,
    dto: RejectUnitHandoffDto,
    user: JwtPayloadUser,
  ) {
    const handoff = await this.requireById(
      this.handoffModel,
      id,
      'Không tìm thấy nhiệm vụ giao ngang.',
    );
    this.assertCanAccessDepartment(user, String(handoff.targetDepartmentId));
    if (handoff.status !== UnitHandoffStatus.SENT) {
      throw new BadRequestException('Chỉ từ chối được nhiệm vụ đang chờ nhận.');
    }
    handoff.status = UnitHandoffStatus.REJECTED;
    handoff.rejectReason = dto.rejectReason?.trim() ?? '';
    await handoff.save();
    await this.populateHandoff(handoff);
    return { message: 'Đã từ chối nhiệm vụ.', data: handoff };
  }

  async cancelHandoff(id: string, user: JwtPayloadUser) {
    const handoff = await this.requireById(
      this.handoffModel,
      id,
      'Không tìm thấy nhiệm vụ giao ngang.',
    );
    this.assertCanAccessDepartment(user, String(handoff.sourceDepartmentId));
    if (
      handoff.status !== UnitHandoffStatus.SENT &&
      handoff.status !== UnitHandoffStatus.DRAFT
    ) {
      throw new BadRequestException(
        'Chỉ huỷ được khi bên nhận chưa tiếp nhận.',
      );
    }
    handoff.status = UnitHandoffStatus.CANCELLED;
    await handoff.save();
    await this.populateHandoff(handoff);
    return { message: 'Đã huỷ giao nhiệm vụ.', data: handoff };
  }

  /** Đơn vị làm việc theo scope role của user. */
  async listMyWorkingDepartments(user: JwtPayloadUser) {
    if (this.isSuperAdmin(user)) {
      const data = await this.departmentModel
        .find({ isActive: true })
        .sort({ sortOrder: 1, name: 1 });
      return { data };
    }
    const ids = this.scopedDepartmentIds(user);
    if (!ids.length) return { data: [] };
    const data = await this.departmentModel
      .find({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        isActive: true,
      })
      .sort({ sortOrder: 1, name: 1 });
    return { data };
  }

  /** Peer units cùng cha — dùng cho dropdown Form 2. */
  async listPeerDepartments(departmentId: string, user: JwtPayloadUser) {
    this.assertCanAccessDepartment(user, departmentId);
    const dept = await this.requireById(
      this.departmentModel,
      departmentId,
      'Không tìm thấy đơn vị.',
    );
    const peers = await this.departmentModel
      .find({
        parentId: dept.parentId ?? null,
        _id: { $ne: dept._id },
        isActive: true,
      })
      .sort({ sortOrder: 1, name: 1 });
    return { data: peers };
  }

  /** Đơn vị con trực tiếp — giao dọc phòng → đội. */
  async listChildDepartments(departmentId: string, user: JwtPayloadUser) {
    this.assertCanAccessDepartment(user, departmentId);
    const children = await this.departmentModel
      .find({
        parentId: new Types.ObjectId(departmentId),
        isActive: true,
      })
      .sort({ sortOrder: 1, name: 1 });
    return { data: children };
  }

  // ── Helpers ──────────────────────────────────────────────

  private async ensureSheetForDepartment(
    departmentId: string,
    periodId: string,
    templateId: string,
  ): Promise<UnitKpiSheetDocument> {
    const existing = await this.sheetModel.findOne({
      departmentId: new Types.ObjectId(departmentId),
      periodId: new Types.ObjectId(periodId),
    });
    if (existing) return existing;

    await this.requireById(
      this.templateModel,
      templateId,
      'Không tìm thấy biểu mẫu.',
    );
    return this.sheetModel.create({
      departmentId: new Types.ObjectId(departmentId),
      periodId: new Types.ObjectId(periodId),
      templateId: new Types.ObjectId(templateId),
      status: UnitKpiSheetStatus.ACTIVE,
    });
  }

  private async resolveDefaultTemplateId(): Promise<string> {
    const template = await this.templateModel
      .findOne({ isActive: true })
      .sort({ updatedAt: -1 });
    if (!template) {
      throw new BadRequestException(
        'Chưa có biểu mẫu KPI — vui lòng cấu hình template trước.',
      );
    }
    return String(template._id);
  }

  private async assertPeerDepartments(
    source: DepartmentDocument,
    target: DepartmentDocument,
  ) {
    const sourceParent = source.parentId ? String(source.parentId) : null;
    const targetParent = target.parentId ? String(target.parentId) : null;
    if (sourceParent !== targetParent) {
      throw new BadRequestException(
        'Chỉ được giao ngang cho đơn vị cùng cấp (cùng đơn vị cha).',
      );
    }
    if (source.levelId && target.levelId) {
      const [sourceLevel, targetLevel] = await Promise.all([
        this.levelModel.findById(source.levelId).lean(),
        this.levelModel.findById(target.levelId).lean(),
      ]);
      if (
        sourceLevel &&
        targetLevel &&
        String(sourceLevel._id) !== String(targetLevel._id)
      ) {
        throw new BadRequestException(
          'Đơn vị nhận phải cùng cấp với đơn vị chủ trì.',
        );
      }
    }
  }

  private isSuperAdmin(user: JwtPayloadUser): boolean {
    return (user.role ?? []).some((r) => r.roleCode === RoleCode.SUPER_ADMIN);
  }

  private scopedDepartmentIds(user: JwtPayloadUser): string[] {
    const ids = new Set<string>();
    for (const assignment of user.role ?? []) {
      if (
        assignment.roleCode === RoleCode.SUPER_ADMIN ||
        !assignment.scopeDepartmentId
      ) {
        continue;
      }
      ids.add(assignment.scopeDepartmentId);
    }
    return [...ids];
  }

  private scopedDepartmentObjectIds(user: JwtPayloadUser): Types.ObjectId[] {
    return this.scopedDepartmentIds(user).map((id) => new Types.ObjectId(id));
  }

  private assertCanAccessDepartment(
    user: JwtPayloadUser,
    departmentId: string,
  ) {
    if (this.isSuperAdmin(user)) return;
    const scoped = this.scopedDepartmentIds(user);
    if (!scoped.includes(departmentId)) {
      throw new ForbiddenException(
        'Bạn không có quyền thao tác trên đơn vị này.',
      );
    }
  }

  private sheetPopulate() {
    return [
      { path: 'departmentId', select: 'code name parentId levelId' },
      { path: 'periodId', select: 'code name startDate endDate' },
      { path: 'templateId', select: 'code name isActive' },
    ];
  }

  private populateSheet(sheet: UnitKpiSheetDocument) {
    return sheet.populate(this.sheetPopulate());
  }

  private handoffPopulate() {
    return [
      { path: 'sourceDepartmentId', select: 'code name' },
      { path: 'targetDepartmentId', select: 'code name' },
      { path: 'periodId', select: 'code name' },
      {
        path: 'contentId',
        select: 'code name groupId',
        populate: { path: 'groupId', select: 'code name' },
      },
      { path: 'createdBy', select: 'username fullName' },
      { path: 'acceptedBy', select: 'username fullName' },
      { path: 'acceptedTaskId', select: 'title status sheetId' },
    ];
  }

  private populateHandoff(handoff: UnitHandoffDocument) {
    return handoff.populate(this.handoffPopulate());
  }

  private taskPopulate() {
    return [
      {
        path: 'contentId',
        select: 'code name groupId',
        populate: { path: 'groupId', select: 'code name' },
      },
      { path: 'assigneeId', select: 'username fullName departmentId' },
      { path: 'createdBy', select: 'username fullName' },
      { path: 'ownerDepartmentId', select: 'code name' },
      { path: 'targetDepartmentId', select: 'code name' },
      { path: 'sheetId', select: 'departmentId periodId status' },
    ];
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
