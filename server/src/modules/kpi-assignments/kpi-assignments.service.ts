import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { RoleCode } from '@/common/enums/role-code.enum';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import {
  DepartmentLevel,
  DepartmentLevelDocument,
} from '@/modules/department-levels/schemas/department-level.schema';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import { Axis, AxisDocument } from '@/modules/kpi-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentDocument,
} from '@/modules/kpi-form-config/schemas/work-content.schema';
import {
  ScoreGroup,
  ScoreGroupDocument,
} from '@/modules/kpi-form-config/schemas/score-group.schema';
import {
  KpiScopeConfigService,
  type EffectiveScope,
} from '@/modules/kpi-scope-config/kpi-scope-config.service';
import {
  ApproveKpiAssignmentDto,
  CreateKpiAssignmentBatchDto,
  CreateKpiAssignmentDto,
  DelegateKpiAssignmentDto,
  IssuedAssignmentQueryDto,
  ReceivedAssignmentQueryDto,
  RejectKpiAssignmentDto,
  ReportKpiAssignmentDto,
} from './dto/kpi-assignment.dto';
import {
  ASSIGNMENT_STATUSES,
  KpiAssignment,
  KpiAssignmentDocument,
  OPEN_STATUSES,
  type AssignmentStatus,
  type HolderType,
} from './schemas/kpi-assignment.schema';

/**
 * Vai trò được thay mặt đơn vị nhận / giao / duyệt nhiệm vụ của đơn vị.
 *
 * Dùng enum chứ không gõ chuỗi: thêm vai trò mới mà quên danh sách này thì
 * người giữ vai trò đó im lặng mất quyền thay mặt đơn vị, không lỗi gì để lần.
 */
const UNIT_ROLE_CODES: string[] = [
  RoleCode.SUPER_ADMIN,
  RoleCode.UNIT_ADMIN,
  RoleCode.VICE_UNIT_ADMIN,
  RoleCode.MANAGER,
];

const LIST_POPULATE = [
  { path: 'axisId', select: 'code name' },
  { path: 'workContentId', select: 'code name' },
  {
    path: 'scoreGroupId',
    select: 'code name minScore maxScore maxInclusive',
  },
  { path: 'issuerId', select: 'fullName username' },
  { path: 'issuerDepartmentId', select: 'code name' },
  { path: 'holderDepartmentId', select: 'code name' },
  { path: 'holderUserId', select: 'fullName username' },
  { path: 'lastAssignedById', select: 'fullName username' },
  { path: 'lastAssignedByDepartmentId', select: 'code name' },
];

type Actor = {
  userId: Types.ObjectId;
  departmentId: Types.ObjectId | null;
  /** Được thay mặt đơn vị (không phải cán bộ thường). */
  actsForUnit: boolean;
  /** Phạm vi giao việc gộp từ các vai trò đang giữ. */
  scope: EffectiveScope;
};

type ResolvedTarget = {
  type: HolderType;
  id: Types.ObjectId;
};

/** Tiền tố "Dòng N:" cho lỗi trong bảng giao hàng loạt. */
function rowPrefix(row?: number) {
  return row ? `Dòng ${row}: ` : '';
}

@Injectable()
export class KpiAssignmentsService {
  constructor(
    @InjectModel(KpiAssignment.name)
    private readonly assignmentModel: Model<KpiAssignmentDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(DepartmentLevel.name)
    private readonly departmentLevelModel: Model<DepartmentLevelDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(ScoreGroup.name)
    private readonly scoreGroupModel: Model<ScoreGroupDocument>,
    private readonly scopeConfigService: KpiScopeConfigService,
  ) {}

  // ---------------------------------------------------------------- tạo & giao

  /**
   * Giao nhiều nhiệm vụ trong một lần.
   * Kiểm tra hết mọi dòng rồi mới ghi - sai một dòng thì không ghi dòng nào,
   * tránh giao dở dang.
   */
  async create(
    userId: string,
    roleCodes: string[],
    dto: CreateKpiAssignmentBatchDto,
  ) {
    const actor = await this.resolveActor(userId, roleCodes);
    if (!actor.scope.isEnabled) {
      throw new ForbiddenException(
        'Vai trò của bạn chưa được cấu hình quyền giao KPI.',
      );
    }
    const batchId = randomUUID();
    const now = new Date();
    const docs: Record<string, unknown>[] = [];

    for (const [index, item] of dto.items.entries()) {
      const row = index + 1;
      await this.requireCatalog(
        item.axisId,
        item.workContentId,
        item.scoreGroupId,
        row,
      );

      const targets = await this.resolveTargets(actor, item, row);
      if (!targets.length) {
        throw new BadRequestException(`Dòng ${row}: chưa chọn nơi nhận.`);
      }

      const note = item.note?.trim() ?? '';
      const base = {
        axisId: new Types.ObjectId(item.axisId),
        workContentId: new Types.ObjectId(item.workContentId),
        title: item.title.trim(),
        product: item.product?.trim() ?? '',
        scoreGroupId: new Types.ObjectId(item.scoreGroupId),
        deadline: item.deadline?.trim() ?? '',
        note,
        issuerId: actor.userId,
        issuerDepartmentId: actor.departmentId,
        batchId,
        requireApproval: actor.scope.requireApproval,
        lastAssignedById: actor.userId,
        lastAssignedByDepartmentId: actor.departmentId,
        status: 'ASSIGNED' as const,
      };

      for (const target of targets) {
        docs.push({
          ...base,
          holderType: target.type,
          holderDepartmentId: target.type === 'DEPARTMENT' ? target.id : null,
          holderUserId: target.type === 'USER' ? target.id : null,
          trail: [
            {
              toType: target.type,
              toDepartmentId: target.type === 'DEPARTMENT' ? target.id : null,
              toUserId: target.type === 'USER' ? target.id : null,
              byUserId: actor.userId,
              byDepartmentId: actor.departmentId,
              note,
              at: now,
            },
          ],
        });
      }
    }

    const data = await this.assignmentModel.insertMany(docs);
    return {
      message: `Đã giao ${dto.items.length} nhiệm vụ, tạo ${data.length} bản ghi giao việc.`,
      data: {
        batchId,
        taskCount: dto.items.length,
        count: data.length,
      },
    };
  }

  /** Giao tiếp xuống - đổi nơi giữ, không sinh nhiệm vụ mới. */
  async delegate(
    userId: string,
    roleCodes: string[],
    id: string,
    dto: DelegateKpiAssignmentDto,
  ) {
    const actor = await this.resolveActor(userId, roleCodes);
    const item = await this.requireById(id);

    if (item.holderType !== 'DEPARTMENT') {
      throw new BadRequestException(
        'Nhiệm vụ đang giao cho cán bộ - không giao tiếp xuống được.',
      );
    }
    if (!actor.actsForUnit) {
      throw new ForbiddenException('Bạn không có quyền giao nhiệm vụ.');
    }
    if (
      !actor.departmentId ||
      String(item.holderDepartmentId) !== String(actor.departmentId)
    ) {
      throw new ForbiddenException(
        'Nhiệm vụ không thuộc đơn vị bạn - không giao tiếp được.',
      );
    }
    if (!OPEN_STATUSES.includes(item.status)) {
      throw new BadRequestException(
        item.status === 'SUBMITTED'
          ? 'Nhiệm vụ đã gửi lên - chờ duyệt xong mới thao tác tiếp.'
          : 'Nhiệm vụ đã duyệt - không giao lại được.',
      );
    }

    if (!actor.scope.isEnabled) {
      throw new ForbiddenException(
        'Vai trò của bạn chưa được cấu hình quyền giao KPI.',
      );
    }

    const target = await this.resolveDelegateTarget(actor, dto);

    item.holderType = target.type;
    item.holderDepartmentId = target.type === 'DEPARTMENT' ? target.id : null;
    item.holderUserId = target.type === 'USER' ? target.id : null;
    item.lastAssignedById = actor.userId;
    item.lastAssignedByDepartmentId = actor.departmentId;
    item.requireApproval = actor.scope.requireApproval;
    item.status = 'ASSIGNED';
    // Nơi giữ mới bắt đầu lại từ đầu.
    item.progressPercent = null;
    item.qualityPercent = null;
    item.selfScore = null;
    item.resultNote = '';
    item.evidenceFiles = [];
    item.submittedAt = null;
    item.rejectReason = '';
    item.trail.push({
      toType: target.type,
      toDepartmentId: target.type === 'DEPARTMENT' ? target.id : null,
      toUserId: target.type === 'USER' ? target.id : null,
      byUserId: actor.userId,
      byDepartmentId: actor.departmentId,
      note: dto.note?.trim() ?? '',
      at: new Date(),
    });

    await item.save();
    return { message: 'Đã giao tiếp nhiệm vụ xuống.', data: item };
  }

  // ------------------------------------------------------------- thực hiện

  async start(userId: string, roleCodes: string[], id: string) {
    const actor = await this.resolveActor(userId, roleCodes);
    const item = await this.requireHeldByActor(actor, id);
    if (item.status === 'APPROVED') {
      throw new BadRequestException('Nhiệm vụ đã duyệt.');
    }
    if (item.status === 'SUBMITTED') {
      throw new BadRequestException('Nhiệm vụ đã gửi lên, đang chờ duyệt.');
    }
    item.status = 'IN_PROGRESS';
    await item.save();
    return { message: 'Đã nhận thực hiện nhiệm vụ.', data: item };
  }

  async report(
    userId: string,
    roleCodes: string[],
    id: string,
    dto: ReportKpiAssignmentDto,
  ) {
    const actor = await this.resolveActor(userId, roleCodes);
    const item = await this.requireHeldByActor(actor, id);
    this.assertReportable(item.status);

    if (dto.progressPercent !== undefined) {
      item.progressPercent = dto.progressPercent;
    }
    if (dto.qualityPercent !== undefined) {
      item.qualityPercent = dto.qualityPercent;
    }
    if (dto.selfScore !== undefined) item.selfScore = dto.selfScore;
    if (dto.resultNote !== undefined) item.resultNote = dto.resultNote.trim();
    if (dto.evidenceFiles !== undefined) {
      item.evidenceFiles = dto.evidenceFiles;
    }
    if (item.status === 'ASSIGNED') item.status = 'IN_PROGRESS';

    await item.save();
    return { message: 'Đã lưu kết quả thực hiện.', data: item };
  }

  async submit(userId: string, roleCodes: string[], id: string) {
    const actor = await this.resolveActor(userId, roleCodes);
    const item = await this.requireHeldByActor(actor, id);
    this.assertReportable(item.status);

    item.submittedAt = new Date();
    item.rejectReason = '';

    // Cấp giao đã tắt yêu cầu duyệt -> gửi lên là xong luôn.
    if (!item.requireApproval) {
      item.status = 'APPROVED';
      item.approvedAt = new Date();
      item.approvedScore = item.selfScore ?? 0;
      await item.save();
      return { message: 'Đã gửi và hoàn thành nhiệm vụ.', data: item };
    }

    item.status = 'SUBMITTED';
    await item.save();
    return { message: 'Đã gửi kết quả lên cấp giao.', data: item };
  }

  // ---------------------------------------------------------------- duyệt

  async approve(
    userId: string,
    roleCodes: string[],
    id: string,
    dto: ApproveKpiAssignmentDto,
  ) {
    const actor = await this.resolveActor(userId, roleCodes);
    const item = await this.requireAssignedByActor(actor, id);
    if (item.status !== 'SUBMITTED') {
      throw new BadRequestException('Chỉ duyệt được nhiệm vụ đã gửi lên.');
    }

    item.status = 'APPROVED';
    item.approvedById = actor.userId;
    item.approvedAt = new Date();
    item.approvedScore = dto.approvedScore ?? item.selfScore ?? 0;
    item.rejectReason = '';
    await item.save();
    return { message: 'Đã duyệt nhiệm vụ.', data: item };
  }

  async reject(
    userId: string,
    roleCodes: string[],
    id: string,
    dto: RejectKpiAssignmentDto,
  ) {
    const actor = await this.resolveActor(userId, roleCodes);
    const item = await this.requireAssignedByActor(actor, id);
    if (item.status !== 'SUBMITTED') {
      throw new BadRequestException('Chỉ trả lại được nhiệm vụ đã gửi lên.');
    }

    item.status = 'REJECTED';
    item.rejectReason = dto.reason.trim();
    item.submittedAt = null;
    await item.save();
    return { message: 'Đã trả lại nhiệm vụ.', data: item };
  }

  // ---------------------------------------------------------------- danh sách

  /** Nhiệm vụ đang nằm ở chỗ tôi. */
  async findReceived(
    userId: string,
    roleCodes: string[],
    query: ReceivedAssignmentQueryDto,
  ) {
    const actor = await this.resolveActor(userId, roleCodes);
    const holderOr: Record<string, unknown>[] = [{ holderUserId: actor.userId }];
    if (actor.actsForUnit && actor.departmentId) {
      holderOr.push({ holderDepartmentId: actor.departmentId });
    }
    return this.paginate({ $or: holderOr }, query);
  }

  /** Nhiệm vụ tôi ban hành hoặc tôi đã giao tiếp xuống. */
  async findIssued(
    userId: string,
    roleCodes: string[],
    query: IssuedAssignmentQueryDto,
  ) {
    const actor = await this.resolveActor(userId, roleCodes);
    const or: Record<string, unknown>[] = [
      { issuerId: actor.userId },
      { lastAssignedById: actor.userId },
    ];
    if (actor.actsForUnit && actor.departmentId) {
      or.push({ issuerDepartmentId: actor.departmentId });
      or.push({ lastAssignedByDepartmentId: actor.departmentId });
    }

    const filter: Record<string, unknown> = { $or: or };
    if (query.batchId) filter.batchId = query.batchId;
    return this.paginate(filter, query);
  }

  async findOne(userId: string, roleCodes: string[], id: string) {
    const actor = await this.resolveActor(userId, roleCodes);
    const item = await this.requireById(id);
    if (!this.canSee(actor, item)) {
      throw new ForbiddenException('Bạn không xem được nhiệm vụ này.');
    }
    await item.populate(LIST_POPULATE);
    return item;
  }

  /** Nơi nhận hợp lệ cho một người giao - dùng dựng dropdown. */
  async findTargets(userId: string, roleCodes: string[]) {
    const actor = await this.resolveActor(userId, roleCodes);
    const scopes = actor.scope.scopes;

    // Trả cả cây con để dựng dạng thư mục; canReceive bám theo phạm vi mà vai
    // trò của người giao được cấu hình.
    const found = await this.departmentModel
      .find({
        ...(actor.departmentId
          ? scopes.has('OWN_UNIT')
            ? {
                $or: [
                  { ancestors: actor.departmentId },
                  { _id: actor.departmentId },
                ],
              }
            : { ancestors: actor.departmentId }
          : {}),
        isActive: true,
      })
      .select('code name parentId depth ancestors levelId')
      .populate('levelId', 'code name rank')
      .sort({ depth: 1, sortOrder: 1, name: 1 });

    const parentIds = new Set(
      found.map((item) => String(item.parentId ?? '')).filter(Boolean),
    );
    const unitLevelIds = await this.getKpiUnitLevelIds();
    const levelIdOf = (item: (typeof found)[number]) => {
      const level = item.levelId as unknown as { _id?: unknown } | null;
      return level?._id ? String(level._id) : String(item.levelId ?? '');
    };
    const unitIds = new Set(
      found
        .filter((item) => this.isUnitLevel(levelIdOf(item), unitLevelIds))
        .map((item) => String(item._id)),
    );

    const departments = found.map((item) => {
      const level = item.levelId as unknown as { name?: string } | null;
      const isUnit = unitIds.has(String(item._id));
      const isOwn = String(item._id) === String(actor.departmentId ?? '');
      const direct =
        !isOwn &&
        this.isEffectiveDirectChild(item, actor.departmentId, unitIds);

      return {
        _id: item._id,
        code: item.code,
        name: item.name,
        parentId: item.parentId ?? null,
        depth: item.depth,
        levelName: level?.name ?? '',
        hasChildren: parentIds.has(String(item._id)),
        /** Cấp gom nhóm thì chỉ để xem, không nhận việc. */
        isUnit,
        canReceive:
          isUnit &&
          (isOwn
            ? scopes.has('OWN_UNIT')
            : direct
              ? scopes.has('CHILD_UNITS')
              : scopes.has('DESCENDANT_UNITS')),
      };
    });

    const directChildCount = departments.filter(
      (item) => item.canReceive,
    ).length;
    const canAssignToUsers =
      scopes.has('USERS_IN_OWN_UNIT') ||
      scopes.has('USERS_IN_SUB_UNITS') ||
      scopes.has('SELF');

    const departmentIds = found.map((item) => item._id);
    const userFilter = actor.departmentId
      ? {
          departmentId: { $in: [actor.departmentId, ...departmentIds] },
          isActive: true,
        }
      : { isActive: true };

    const foundUsers = canAssignToUsers
      ? await this.userModel
          .find(userFilter)
          .select('fullName username departmentId position')
          .populate('departmentId', 'code name')
          .sort({ fullName: 1 })
      : [];

    const users = foundUsers.map((item) => {
      const dept = item.departmentId as unknown as { _id?: unknown } | null;
      const deptId = dept?._id
        ? String(dept._id)
        : String(item.departmentId ?? '');
      const isSelf = String(item._id) === String(actor.userId);
      const inOwnUnit = deptId === String(actor.departmentId ?? '');

      return {
        _id: item._id,
        fullName: item.fullName,
        username: item.username,
        position: item.position,
        departmentId: item.departmentId,
        canReceive: isSelf
          ? scopes.has('SELF')
          : inOwnUnit
            ? scopes.has('USERS_IN_OWN_UNIT')
            : scopes.has('USERS_IN_SUB_UNITS'),
      };
    });

    const ownDepartment = actor.departmentId
      ? await this.departmentModel
          .findById(actor.departmentId)
          .select('code name levelId')
          .populate('levelId', 'code name rank')
      : null;

    const level = ownDepartment?.levelId as unknown as
      | { name?: string }
      | undefined;

    return {
      data: {
        departments,
        users,
        // Cho UI nói rõ người giao đang đứng ở đâu và với tới được tới đâu.
        scope: {
          departmentId: ownDepartment?._id ?? null,
          departmentName: ownDepartment?.name ?? 'Toàn hệ thống',
          departmentCode: ownDepartment?.code ?? '',
          levelName: level?.name ?? '',
          directChildCount,
          canAssignToUsers,
          isEnabled: actor.scope.isEnabled,
          requireApproval: actor.scope.requireApproval,
          scopes: [...actor.scope.scopes],
        },
      },
    };
  }

  // ---------------------------------------------------------------- nội bộ

  private async paginate(
    filter: Record<string, unknown>,
    query: ReceivedAssignmentQueryDto,
  ) {
    const finalFilter: Record<string, unknown> = { ...filter };
    if (query.status && ASSIGNMENT_STATUSES.includes(query.status as never)) {
      finalFilter.status = query.status;
    }
    if (query.axisId) finalFilter.axisId = new Types.ObjectId(query.axisId);
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      finalFilter.title = new RegExp(escaped, 'i');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.assignmentModel
        .find(finalFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(LIST_POPULATE),
      this.assignmentModel.countDocuments(finalFilter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  private async resolveActor(
    userId: string,
    roleCodes: string[],
  ): Promise<Actor> {
    const user = await this.userModel.findById(userId).select('departmentId');
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    return {
      userId: user._id,
      departmentId: user.departmentId
        ? new Types.ObjectId(String(user.departmentId))
        : null,
      actsForUnit: roleCodes.some((code) => UNIT_ROLE_CODES.includes(code)),
      scope: await this.scopeConfigService.getEffectiveScope(roleCodes),
    };
  }

  private async requireById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    }
    const item = await this.assignmentModel.findById(id);
    if (!item) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    return item;
  }

  /** Nhiệm vụ đang nằm ở chỗ actor - mới được thực hiện / báo cáo. */
  private async requireHeldByActor(actor: Actor, id: string) {
    const item = await this.requireById(id);
    const heldByMe =
      item.holderType === 'USER' &&
      String(item.holderUserId) === String(actor.userId);
    const heldByMyUnit =
      item.holderType === 'DEPARTMENT' &&
      actor.actsForUnit &&
      !!actor.departmentId &&
      String(item.holderDepartmentId) === String(actor.departmentId);

    if (!heldByMe && !heldByMyUnit) {
      throw new ForbiddenException('Nhiệm vụ này không nằm ở chỗ bạn.');
    }
    return item;
  }

  /** Actor là nơi đã giao cho người đang giữ - mới được duyệt / trả lại. */
  private async requireAssignedByActor(actor: Actor, id: string) {
    const item = await this.requireById(id);
    const byMe = String(item.lastAssignedById) === String(actor.userId);
    const byMyUnit =
      actor.actsForUnit &&
      !!actor.departmentId &&
      String(item.lastAssignedByDepartmentId) === String(actor.departmentId);

    if (!byMe && !byMyUnit) {
      throw new ForbiddenException(
        'Chỉ nơi đã giao nhiệm vụ mới duyệt được kết quả.',
      );
    }
    return item;
  }

  private canSee(actor: Actor, item: KpiAssignmentDocument) {
    const ids = [
      item.holderUserId,
      item.issuerId,
      item.lastAssignedById,
      item.approvedById,
    ];
    if (ids.some((value) => value && String(value) === String(actor.userId))) {
      return true;
    }
    if (!actor.actsForUnit || !actor.departmentId) return false;
    const deptIds = [
      item.holderDepartmentId,
      item.issuerDepartmentId,
      item.lastAssignedByDepartmentId,
    ];
    return deptIds.some(
      (value) => value && String(value) === String(actor.departmentId),
    );
  }

  private assertReportable(status: AssignmentStatus) {
    if (status === 'SUBMITTED') {
      throw new BadRequestException('Nhiệm vụ đã gửi lên, đang chờ duyệt.');
    }
    if (status === 'APPROVED') {
      throw new BadRequestException('Nhiệm vụ đã duyệt - không sửa được nữa.');
    }
  }

  private async requireCatalog(
    axisId: string,
    workContentId: string,
    scoreGroupId: string,
    row?: number,
  ) {
    const at = rowPrefix(row);
    const [axis, content, scoreGroup] = await Promise.all([
      this.axisModel.findById(axisId),
      this.workContentModel.findById(workContentId),
      this.scoreGroupModel.findById(scoreGroupId),
    ]);
    if (!axis) throw new BadRequestException(`${at}trục không tồn tại.`);
    if (!content) {
      throw new BadRequestException(`${at}nội dung công việc không tồn tại.`);
    }
    if (String(content.axisId) !== String(axis._id)) {
      throw new BadRequestException(
        `${at}nội dung công việc không thuộc trục đã chọn.`,
      );
    }
    if (!scoreGroup || !scoreGroup.isActive) {
      throw new BadRequestException(`${at}nhóm điểm không tồn tại hoặc đã ngừng.`);
    }
  }

  private async assertValidDepartmentTarget(
    actor: Actor,
    targetId: Types.ObjectId,
    row?: number,
  ) {
    const at = rowPrefix(row);
    const fromDepartmentId = actor.departmentId;
    const target = await this.departmentModel.findById(targetId);
    if (!target) {
      throw new BadRequestException(`${at}đơn vị nhận không tồn tại.`);
    }

    // Cấp gom nhóm (Khối) nhận thì nhiệm vụ nằm chết, không ai xử lý.
    const unitLevelIds = await this.getKpiUnitLevelIds();
    if (!this.isUnitLevel(target.levelId, unitLevelIds)) {
      throw new BadRequestException(
        target.levelId
          ? `${at}"${target.name}" là cấp gom nhóm, không nhận nhiệm vụ - giao cho đơn vị bên trong nó.`
          : `${at}"${target.name}" chưa gán cấp đơn vị nên chưa biết có nhận nhiệm vụ hay không - vào Tổ chức › Đơn vị gán cấp cho nó.`,
      );
    }

    const isOwnUnit = String(target._id) === String(fromDepartmentId ?? '');
    if (isOwnUnit) {
      if (!actor.scope.scopes.has('OWN_UNIT')) {
        throw new BadRequestException(
          `${at}vai trò của bạn không được giao cho chính đơn vị mình.`,
        );
      }
      return target;
    }

    if (fromDepartmentId) {
      const under = (target.ancestors ?? []).some(
        (value) => String(value) === String(fromDepartmentId),
      );
      if (!under) {
        throw new BadRequestException(
          `${at}đơn vị "${target.name}" không nằm dưới đơn vị bạn.`,
        );
      }
    }

    const chain = await this.departmentModel
      .find({ _id: { $in: target.ancestors ?? [] } })
      .select('_id levelId');
    const unitIds = new Set(
      chain
        .filter((item) => this.isUnitLevel(item.levelId, unitLevelIds))
        .map((item) => String(item._id)),
    );
    const direct = this.isEffectiveDirectChild(target, fromDepartmentId, unitIds);

    if (direct) {
      if (!actor.scope.scopes.has('CHILD_UNITS')) {
        throw new BadRequestException(
          `${at}vai trò của bạn không được giao xuống đơn vị cấp dưới.`,
        );
      }
    } else if (!actor.scope.scopes.has('DESCENDANT_UNITS')) {
      throw new BadRequestException(
        `${at}đơn vị "${target.name}" không phải cấp liền kề - vai trò của bạn chưa được phép giao vượt cấp.`,
      );
    }

    return target;
  }

  private async assertValidUserTarget(
    actor: Actor,
    targetUserId: Types.ObjectId,
    row?: number,
  ) {
    const at = rowPrefix(row);
    const fromDepartmentId = actor.departmentId;
    const target = await this.userModel
      .findById(targetUserId)
      .select('fullName username departmentId isActive');
    if (!target || !target.isActive) {
      throw new BadRequestException(`${at}cán bộ nhận không tồn tại.`);
    }

    const who = target.fullName ?? target.username;

    if (String(target._id) === String(actor.userId)) {
      if (!actor.scope.scopes.has('SELF')) {
        throw new BadRequestException(
          `${at}vai trò của bạn không được tự giao nhiệm vụ cho bản thân.`,
        );
      }
      return target;
    }

    if (!fromDepartmentId) {
      if (!actor.scope.scopes.has('USERS_IN_SUB_UNITS')) {
        throw new BadRequestException(
          `${at}vai trò của bạn không được giao thẳng cho cán bộ.`,
        );
      }
      return target;
    }

    if (!target.departmentId) {
      throw new BadRequestException(`${at}cán bộ "${who}" chưa gán đơn vị.`);
    }

    if (String(target.departmentId) === String(fromDepartmentId)) {
      if (!actor.scope.scopes.has('USERS_IN_OWN_UNIT')) {
        throw new BadRequestException(
          `${at}vai trò của bạn không được giao cho cán bộ trong đơn vị.`,
        );
      }
      return target;
    }

    const dept = await this.departmentModel.findById(target.departmentId);
    const under = (dept?.ancestors ?? []).some(
      (value) => String(value) === String(fromDepartmentId),
    );
    if (!under) {
      throw new BadRequestException(
        `${at}cán bộ "${who}" không thuộc đơn vị cấp dưới của bạn.`,
      );
    }
    if (!actor.scope.scopes.has('USERS_IN_SUB_UNITS')) {
      throw new BadRequestException(
        `${at}vai trò của bạn không được giao thẳng cho cán bộ ở đơn vị cấp dưới.`,
      );
    }
    return target;
  }

  private async resolveTargets(
    actor: Actor,
    dto: CreateKpiAssignmentDto,
    row: number,
  ): Promise<ResolvedTarget[]> {
    const targets: ResolvedTarget[] = [];
    const seen = new Set<string>();
    const push = (target: ResolvedTarget) => {
      const key = `${target.type}:${String(target.id)}`;
      if (seen.has(key)) return;
      seen.add(key);
      targets.push(target);
    };

    for (const rawId of dto.targets.departmentIds ?? []) {
      const id = new Types.ObjectId(rawId);
      await this.assertValidDepartmentTarget(actor, id, row);
      push({ type: 'DEPARTMENT', id });
    }

    for (const rawId of dto.targets.userIds ?? []) {
      const id = new Types.ObjectId(rawId);
      await this.assertValidUserTarget(actor, id, row);
      push({ type: 'USER', id });
    }

    return targets;
  }

  /**
   * Các cấp đơn vị nhận KPI (Phòng, Xã...). Cấp không bật cờ chỉ để gom nhóm.
   * Chưa cấp nào được bật thì coi như mọi cấp đều nhận được, để hệ thống vẫn
   * dùng được trước khi super admin cấu hình.
   */
  private async getKpiUnitLevelIds(): Promise<Set<string> | null> {
    const levels = await this.departmentLevelModel
      .find({ isKpiUnit: true, isActive: true })
      .select('_id');
    if (!levels.length) return null;
    return new Set(levels.map((item) => String(item._id)));
  }

  private isUnitLevel(
    levelId: unknown,
    unitLevelIds: Set<string> | null,
  ): boolean {
    if (!unitLevelIds) return true;
    return !!levelId && unitLevelIds.has(String(levelId));
  }

  /**
   * Cấp liền kề tính theo ĐƠN VỊ NHẬN ĐƯỢC, không theo cây thuần:
   * Tỉnh → Khối (gom) → Phòng thì Phòng mới là cấp liền kề thật sự của Tỉnh,
   * vì Khối không nhận được. Không có luật này thì giao Tỉnh → Phòng lúc nào
   * cũng bị coi là vượt cấp.
   */
  private isEffectiveDirectChild(
    dept: { ancestors?: Types.ObjectId[] },
    fromDepartmentId: Types.ObjectId | null,
    unitIds: Set<string>,
  ): boolean {
    const chain = (dept.ancestors ?? []).map((value) => String(value));
    const fromId = fromDepartmentId ? String(fromDepartmentId) : null;
    if (fromId && !chain.includes(fromId)) return false;

    // Các đơn vị nằm giữa người giao và đơn vị nhận.
    const between = fromId ? chain.slice(chain.indexOf(fromId) + 1) : chain;

    // Có đơn vị nhận được nào chen giữa -> phải qua nó trước.
    return !between.some((id) => unitIds.has(id));
  }

  private async resolveDelegateTarget(
    actor: Actor,
    dto: DelegateKpiAssignmentDto,
  ): Promise<{ type: HolderType; id: Types.ObjectId }> {
    if (dto.targetType === 'DEPARTMENT') {
      if (!dto.targetDepartmentId) {
        throw new BadRequestException('Chưa chọn đơn vị nhận.');
      }
      const id = new Types.ObjectId(dto.targetDepartmentId);
      await this.assertValidDepartmentTarget(actor, id);
      return { type: 'DEPARTMENT', id };
    }

    if (!dto.targetUserId) {
      throw new BadRequestException('Chưa chọn cán bộ nhận.');
    }
    const id = new Types.ObjectId(dto.targetUserId);
    await this.assertValidUserTarget(actor, id);
    return { type: 'USER', id };
  }
}
