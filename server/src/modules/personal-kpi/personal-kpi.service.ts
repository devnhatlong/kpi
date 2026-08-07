import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { RoleCode } from '@/common/enums/role-code.enum';
import { Axis, AxisDocument } from '@/modules/kpi-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentDocument,
} from '@/modules/kpi-form-config/schemas/work-content.schema';
import {
  FormTemplate,
  FormTemplateDocument,
} from '@/modules/kpi-form-config/schemas/form-template.schema';
import { FormTemplatesService } from '@/modules/kpi-form-config/form-templates.service';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  CreatePersonalKpiBatchDto,
  CreatePersonalKpiDto,
  ForwardPersonalKpiDto,
  PersonalKpiBoardQueryDto,
  PersonalKpiListQueryDto,
  PersonalKpiReportsQueryDto,
  ReviewPersonalKpiDto,
  ReviewerEditPersonalKpiDto,
  SubmitPersonalKpiDto,
  UpdatePersonalKpiDto,
} from './dto/personal-kpi.dto';
import {
  PersonalKpiItem,
  PersonalKpiItemDocument,
  PersonalKpiReviewStatus,
} from './schemas/personal-kpi-item.schema';
import {
  PersonalKpiSubmission,
  PersonalKpiSubmissionDocument,
} from './schemas/personal-kpi-submission.schema';
import { isYmd, serverDateYmd, shiftYmd } from './personal-kpi.time';

/** Cán bộ chỉ sửa/gửi được nhiệm vụ ở hai trạng thái này. */
const OWNER_EDITABLE: PersonalKpiReviewStatus[] = ['DRAFT', 'RETURNED'];

/** Bậc vai trò tăng dần - dùng để biết ai là cấp trên. */
const ROLE_LADDER: RoleCode[] = [
  RoleCode.STAFF,
  RoleCode.MANAGER,
  RoleCode.UNIT_ADMIN,
  RoleCode.SUPER_ADMIN,
];

/** Nhãn cột để hiển thị trong lịch sử sửa. */
const CONTENT_FIELD_LABELS: Record<string, string> = {
  title: 'Tên nhiệm vụ',
  deadline: 'Thời hạn',
  product: 'Sản phẩm',
  standardScore: 'Điểm chuẩn',
  executingUnit: 'Đơn vị thực hiện',
  progressPercent: 'KPI tiến độ %',
  progressSelfScore: 'Điểm tự chấm tiến độ',
  qualityPercent: 'KPI chất lượng %',
  qualitySelfScore: 'Điểm tự chấm chất lượng',
  resultPassed: 'Đạt',
  resultFailed: 'Không đạt',
  note: 'Ghi chú',
};

const BOARD_MAX_ROWS = 2000;

type ActorInfo = {
  id: Types.ObjectId;
  name: string;
  departmentId: Types.ObjectId | null;
};

@Injectable()
export class PersonalKpiService {
  constructor(
    @InjectModel(PersonalKpiItem.name)
    private readonly itemModel: Model<PersonalKpiItemDocument>,
    @InjectModel(PersonalKpiSubmission.name)
    private readonly submissionModel: Model<PersonalKpiSubmissionDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(FormTemplate.name)
    private readonly formTemplateModel: Model<FormTemplateDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly formTemplatesService: FormTemplatesService,
  ) {}

  // ============================================================ cán bộ nhập

  async createMany(ownerId: string, batch: CreatePersonalKpiBatchDto) {
    if (!batch.items?.length) {
      throw new BadRequestException('Chưa có nhiệm vụ nào để lưu.');
    }
    const actor = await this.requireActor(ownerId);
    const reportDate = this.resolveReportDate(batch.reportDate);

    const created: Types.ObjectId[] = [];
    for (const dto of batch.items) {
      const { axis, workContent } = await this.requireAxisAndContent(
        dto.axisId,
        dto.workContentId,
      );
      const doc = await this.itemModel.create({
        ...this.mapContent(dto),
        ownerId: actor.id,
        ownerDepartmentId: actor.departmentId,
        reportDate,
        axisId: axis._id,
        workContentId: workContent._id,
        title: dto.title.trim(),
        reviewStatus: 'DRAFT' as const,
        holderLevel: 0,
      });
      created.push(doc._id as Types.ObjectId);
    }

    const data = await this.itemModel
      .find({ _id: { $in: created } })
      .sort({ createdAt: 1 })
      .populate('axisId', 'code name description')
      .populate('workContentId', 'code name description');

    return {
      message:
        data.length > 1
          ? `Đã lưu ${data.length} nhiệm vụ nháp.`
          : 'Đã lưu nháp.',
      data,
    };
  }

  /** Cán bộ sửa nhiệm vụ của mình khi còn nháp hoặc bị trả lại. */
  async update(ownerId: string, id: string, dto: UpdatePersonalKpiDto) {
    const item = await this.requireOwned(ownerId, id);
    if (!OWNER_EDITABLE.includes(item.reviewStatus)) {
      throw new BadRequestException(
        'Nhiệm vụ đã gửi lên - không sửa được. Chờ cấp trên duyệt hoặc trả lại.',
      );
    }
    if (item.holderLevel > 0) {
      throw new BadRequestException(
        'Nhiệm vụ đang ở cấp trên - không sửa được.',
      );
    }

    if (dto.axisId !== undefined || dto.workContentId !== undefined) {
      const { axis, workContent } = await this.requireAxisAndContent(
        dto.axisId ?? String(item.axisId),
        dto.workContentId ?? String(item.workContentId),
      );
      item.axisId = axis._id;
      item.workContentId = workContent._id;
    }

    this.applyContent(item, dto);

    // Sửa xong là hết "bị trả lại", quay về nháp để gửi lại.
    item.reviewStatus = 'DRAFT';
    item.returnReason = '';
    await item.save();
    await item.populate([
      { path: 'axisId', select: 'code name description' },
      { path: 'workContentId', select: 'code name description' },
    ]);

    return { message: 'Đã lưu nháp.', data: item };
  }

  async remove(ownerId: string, id: string) {
    const item = await this.requireOwned(ownerId, id);
    if (!OWNER_EDITABLE.includes(item.reviewStatus) || item.holderLevel > 0) {
      throw new BadRequestException('Nhiệm vụ đã gửi - không xoá được.');
    }
    await item.deleteOne();
    return { message: 'Đã xoá nhiệm vụ.' };
  }

  async findOne(ownerId: string, id: string) {
    const item = await this.requireOwned(ownerId, id, true);
    return { message: 'OK', data: item };
  }

  async findMine(ownerId: string, query: PersonalKpiListQueryDto = {}) {
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter: Record<string, unknown> = { ownerId: owner };

    if (query.reportDate) {
      filter.reportDate = this.requireYmd(query.reportDate, 'reportDate');
    }
    if (query.status) filter.reviewStatus = query.status;
    if (query.axisId) {
      filter.axisId = this.requireObjectId(query.axisId, 'Trục');
    }
    if (query.q?.trim()) filter.title = this.likeRegex(query.q);

    const [data, total] = await Promise.all([
      this.itemModel
        .find(filter)
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('axisId', 'code name description')
        .populate('workContentId', 'code name description')
        .populate('lastDecidedById', 'fullName username'),
      this.itemModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  /** Danh sách báo cáo theo ngày của chính mình. */
  async findReports(ownerId: string, query: PersonalKpiReportsQueryDto) {
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const match: Record<string, unknown> = { ownerId: owner };
    if (query.status) match.reviewStatus = query.status;
    if (query.q?.trim()) match.title = this.likeRegex(query.q);

    const range: Record<string, string> = {};
    if (query.fromDate) range.$gte = this.requireYmd(query.fromDate, 'fromDate');
    if (query.toDate) range.$lte = this.requireYmd(query.toDate, 'toDate');
    if (Object.keys(range).length) match.reportDate = range;

    // Phân trang ngay trong pipeline, không kéo hết ngày về rồi cắt.
    const [result] = await this.itemModel.aggregate<{
      rows: Array<Record<string, unknown>>;
      total: Array<{ count: number }>;
    }>([
      { $match: match },
      {
        $group: {
          _id: '$reportDate',
          taskCount: { $sum: 1 },
          draftCount: this.countIf('DRAFT'),
          pendingCount: this.countIf('PENDING'),
          approvedCount: this.countIf('APPROVED'),
          returnedCount: this.countIf('RETURNED'),
          createdAt: { $min: '$createdAt' },
          updatedAt: { $max: '$updatedAt' },
          lastSentAt: { $max: '$lastSentAt' },
        },
      },
      { $sort: { _id: -1 } },
      {
        $facet: {
          rows: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $addFields: { reportDate: '$_id' } },
            { $project: { _id: 0 } },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    return buildPaginatedResponse(
      result?.rows ?? [],
      result?.total?.[0]?.count ?? 0,
      page,
      limit,
    );
  }

  async getDashboardSummary(ownerId: string) {
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const today = serverDateYmd();
    const lookbackDays = 60;
    const fromDate = shiftYmd(today, -(lookbackDays - 1));

    const [statusRows, dailyRows] = await Promise.all([
      this.itemModel.aggregate<{ _id: string; count: number }>([
        { $match: { ownerId: owner } },
        { $group: { _id: '$reviewStatus', count: { $sum: 1 } } },
      ]),
      this.itemModel.aggregate<{
        _id: string;
        taskCount: number;
        draftCount: number;
        sentCount: number;
      }>([
        {
          $match: {
            ownerId: owner,
            reportDate: { $gte: fromDate, $lte: today },
          },
        },
        {
          $group: {
            _id: '$reportDate',
            taskCount: { $sum: 1 },
            draftCount: this.countIf('DRAFT'),
            sentCount: {
              $sum: {
                $cond: [{ $ne: ['$reviewStatus', 'DRAFT'] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

    const statusMap = new Map(statusRows.map((row) => [row._id, row.count]));
    const byDate = new Map(dailyRows.map((row) => [row._id, row]));
    const todayStats = byDate.get(today);

    // Chuỗi ngày có lập báo cáo; hôm nay chưa lập thì tính từ hôm qua để không
    // phá chuỗi giữa ngày.
    let cursor = (todayStats?.taskCount ?? 0) > 0 ? today : shiftYmd(today, -1);
    let streakDays = 0;
    for (let i = 0; i < lookbackDays; i += 1) {
      const day = byDate.get(cursor);
      if (!day || day.taskCount <= 0) break;
      streakDays += 1;
      cursor = shiftYmd(cursor, -1);
    }

    const weekWindowDays = 7;
    let weekReportedDays = 0;
    for (let i = 0; i < weekWindowDays; i += 1) {
      const day = byDate.get(shiftYmd(today, -i));
      if (day && day.sentCount > 0) weekReportedDays += 1;
    }

    return {
      message: 'OK',
      data: {
        today,
        streakDays,
        weekReportedDays,
        weekWindowDays,
        todayTaskCount: todayStats?.taskCount ?? 0,
        todayDraftCount: todayStats?.draftCount ?? 0,
        pendingSentCount: statusMap.get('PENDING') ?? 0,
        rejectedCount: statusMap.get('RETURNED') ?? 0,
        approvedCount: statusMap.get('APPROVED') ?? 0,
      },
    };
  }

  // =========================================================== gửi lên trên

  async listRecipients(userId: string, q?: string) {
    const data = await this.findRecipientsUp(userId, q);
    return { message: 'OK', data };
  }

  /** Cán bộ gửi báo cáo ngày của chính mình lên cấp trên (lượt cấp 1). */
  async submit(
    userId: string,
    reportDate: string,
    dto: SubmitPersonalKpiDto,
  ) {
    const date = this.requireYmd(reportDate, 'reportDate');
    const actor = await this.requireActor(userId);
    const target = await this.requireValidRecipient(userId, dto.recipientId);
    const note = this.requireNote(dto.note);

    const filter: Record<string, unknown> = {
      ownerId: actor.id,
      reportDate: date,
      holderLevel: 0,
      reviewStatus: { $in: OWNER_EDITABLE },
    };
    if (dto.itemIds?.length) {
      filter._id = {
        $in: dto.itemIds.map((id) => this.requireObjectId(id, 'Nhiệm vụ')),
      };
    }

    const items = await this.itemModel.find(filter);
    if (!items.length) {
      throw new BadRequestException(
        'Không có nhiệm vụ nháp hoặc bị trả lại nào để gửi trong ngày này.',
      );
    }
    if (dto.itemIds?.length && items.length !== dto.itemIds.length) {
      throw new BadRequestException(
        'Một số nhiệm vụ không gửi được - không thuộc báo cáo này hoặc đã gửi rồi.',
      );
    }
    const missingTitle = items.find((item) => !item.title.trim());
    if (missingTitle) {
      throw new BadRequestException(
        'Có nhiệm vụ chưa đặt tên - hãy sửa trước khi gửi.',
      );
    }

    // Chốt mẫu bảng ở lần gửi đầu tiên để báo cáo không méo khi mẫu bị sửa.
    await this.stampTemplates(items);
    await this.assertRequiredColumnsFilled(items);

    return this.createSubmission({
      level: 1,
      sender: actor,
      target,
      note,
      reportDate: date,
      items,
      sourceSubmissionIds: [],
      message: (count) =>
        `Đã gửi ${count} nhiệm vụ tới ${target.name}.`,
    });
  }

  /** Cấp trên gửi tiếp các nhiệm vụ đang giữ lên cấp cao hơn. */
  async forward(userId: string, dto: ForwardPersonalKpiDto) {
    const actor = await this.requireActor(userId);
    const target = await this.requireValidRecipient(userId, dto.recipientId);
    const note = this.requireNote(dto.note);

    const ids = dto.itemIds.map((id) => this.requireObjectId(id, 'Nhiệm vụ'));
    const items = await this.itemModel.find({
      _id: { $in: ids },
      currentRecipientId: actor.id,
      holderLevel: { $gte: 1 },
      reviewStatus: { $in: ['APPROVED', 'RETURNED'] },
    });

    if (!items.length) {
      throw new BadRequestException(
        'Không có nhiệm vụ nào gửi lên được. Phải duyệt trước khi gửi tiếp.',
      );
    }
    if (items.length !== ids.length) {
      throw new BadRequestException(
        'Một số nhiệm vụ chưa duyệt hoặc không nằm ở chỗ bạn.',
      );
    }

    // Mỗi nhiệm vụ đi lên đúng một bậc so với vị trí hiện tại của nó.
    const levels = new Set(items.map((item) => item.holderLevel));
    if (levels.size > 1) {
      throw new BadRequestException(
        'Các nhiệm vụ đang ở khác cấp nhau - gửi từng nhóm một.',
      );
    }
    const dates = new Set(items.map((item) => item.reportDate));
    if (dates.size > 1) {
      throw new BadRequestException(
        'Các nhiệm vụ thuộc nhiều ngày báo cáo - gửi từng ngày một.',
      );
    }

    const currentLevel = items[0]!.holderLevel;
    const sourceSubmissionIds = [
      ...new Set(
        items
          .map((item) => item.currentSubmissionId)
          .filter((id): id is Types.ObjectId => Boolean(id))
          .map((id) => String(id)),
      ),
    ].map((id) => new Types.ObjectId(id));

    return this.createSubmission({
      level: currentLevel + 1,
      sender: actor,
      target,
      note,
      reportDate: items[0]!.reportDate,
      items,
      sourceSubmissionIds,
      message: (count) =>
        `Đã gửi ${count} nhiệm vụ lên ${target.name}.`,
    });
  }

  // ============================================================ cấp trên duyệt

  /** Duyệt hoặc trả lại nhiều dòng đã tích trong bảng tổng. */
  async review(userId: string, dto: ReviewPersonalKpiDto) {
    const actor = await this.requireActor(userId);
    const ids = dto.itemIds.map((id) => this.requireObjectId(id, 'Nhiệm vụ'));

    const items = await this.itemModel.find({
      _id: { $in: ids },
      currentRecipientId: actor.id,
      reviewStatus: 'PENDING',
    });
    if (!items.length) {
      throw new BadRequestException('Không có nhiệm vụ nào đang chờ bạn duyệt.');
    }

    const now = new Date();

    if (dto.decision === 'APPROVE') {
      await this.itemModel.updateMany(
        { _id: { $in: items.map((item) => item._id) } },
        {
          $set: {
            reviewStatus: 'APPROVED',
            returnReason: '',
            lastDecidedById: actor.id,
            lastDecidedAt: now,
          },
        },
      );
      await this.closeSubmissionsIfSettled(items);
      return {
        message: `Đã duyệt ${items.length} nhiệm vụ.`,
        data: { count: items.length },
      };
    }

    const reason = dto.reason?.trim() ?? '';
    if (!reason) {
      throw new BadRequestException('Lý do trả lại là bắt buộc.');
    }

    // Trả lại rơi về đúng người đã gửi lượt đó, không nhảy thẳng xuống cán bộ.
    for (const item of items) {
      const backTo = item.lastSenderId ?? item.ownerId;
      const backDept = item.lastSenderDepartmentId ?? item.ownerDepartmentId;
      item.reviewStatus = 'RETURNED';
      item.returnReason = reason;
      item.lastDecidedById = actor.id;
      item.lastDecidedAt = now;
      item.holderLevel = Math.max(0, item.holderLevel - 1);
      item.currentRecipientId = backTo;
      item.currentRecipientDepartmentId = backDept;
      await item.save();
    }
    await this.closeSubmissionsIfSettled(items);

    return {
      message: `Đã trả lại ${items.length} nhiệm vụ.`,
      data: { count: items.length },
    };
  }

  /** Cấp trên sửa nội dung nhiệm vụ đang nằm ở tay mình - luôn lưu vết. */
  async reviewerEdit(
    userId: string,
    id: string,
    dto: ReviewerEditPersonalKpiDto,
  ) {
    const actor = await this.requireActor(userId);
    const item = await this.itemModel.findOne({
      _id: this.requireObjectId(id, 'Nhiệm vụ'),
      currentRecipientId: actor.id,
    });
    if (!item) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ ở chỗ bạn.');
    }
    if (item.holderLevel < 1) {
      throw new BadRequestException(
        'Nhiệm vụ đang ở chỗ cán bộ - để cán bộ tự sửa.',
      );
    }

    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Lý do sửa là bắt buộc.');
    }

    const changes = this.diffContent(item, dto);
    if (!changes.length) {
      throw new BadRequestException('Không có thay đổi nào để lưu.');
    }

    this.applyContent(item, dto);
    item.edits.push({
      byId: actor.id,
      byName: actor.name,
      byDepartmentId: actor.departmentId,
      level: item.holderLevel,
      changes,
      reason,
      at: new Date(),
    });
    await item.save();

    return {
      message: `Đã sửa ${changes.length} trường và lưu vết.`,
      data: item,
    };
  }

  // ======================================================= bảng tổng theo trục

  /**
   * Bảng tổng của cấp trên: mọi nhiệm vụ đang nằm ở tay mình, gom
   * Trục → Nội dung công việc → dòng, kèm bộ cột của mẫu đã khoá lúc gửi.
   *
   * Tách khối theo (trục, phiên bản mẫu): mẫu đổi giữa chừng thì các dòng cũ
   * vẫn dựng đúng bảng của thời điểm gửi thay vì bị méo theo mẫu mới.
   */
  async board(userId: string, query: PersonalKpiBoardQueryDto) {
    const actor = await this.requireActor(userId);

    const filter: Record<string, unknown> = { currentRecipientId: actor.id };
    filter.reviewStatus = query.status
      ? query.status
      : query.includeDecided
        ? { $in: ['PENDING', 'APPROVED', 'RETURNED'] }
        : 'PENDING';

    if (query.reportDate) {
      filter.reportDate = this.requireYmd(query.reportDate, 'reportDate');
    } else {
      const range: Record<string, string> = {};
      if (query.fromDate) {
        range.$gte = this.requireYmd(query.fromDate, 'fromDate');
      }
      if (query.toDate) range.$lte = this.requireYmd(query.toDate, 'toDate');
      if (Object.keys(range).length) filter.reportDate = range;
    }

    if (query.axisId) filter.axisId = this.requireObjectId(query.axisId, 'Trục');
    if (query.senderId) {
      filter.lastSenderId = this.requireObjectId(query.senderId, 'Người gửi');
    }
    if (query.ownerId) {
      filter.ownerId = this.requireObjectId(query.ownerId, 'Cán bộ');
    }
    if (query.q?.trim()) filter.title = this.likeRegex(query.q);

    const rows = await this.itemModel
      .find(filter)
      .sort({ reportDate: -1, axisId: 1, workContentId: 1, createdAt: 1 })
      .limit(BOARD_MAX_ROWS)
      .populate('axisId', 'code name sortOrder')
      .populate('workContentId', 'code name sortOrder')
      .populate('ownerId', 'fullName username')
      .populate('ownerDepartmentId', 'code name')
      .populate('lastSenderId', 'fullName username')
      .populate('lastSenderDepartmentId', 'code name');

    const blocks = new Map<
      string,
      {
        axisId: string;
        axisCode: string;
        axisName: string;
        formTemplateId: string | null;
        formTemplateVersion: number | null;
        groups: Map<
          string,
          {
            workContentId: string;
            workContentCode: string;
            workContentName: string;
            rows: PersonalKpiItemDocument[];
          }
        >;
      }
    >();

    for (const row of rows) {
      const axis = row.axisId as unknown as {
        _id: Types.ObjectId;
        code?: string;
        name?: string;
      };
      const content = row.workContentId as unknown as {
        _id: Types.ObjectId;
        code?: string;
        name?: string;
      };
      const axisId = String(axis?._id ?? row.axisId);
      const version = row.formTemplateVersion ?? null;
      const blockKey = `${axisId}:${version ?? 'live'}`;

      let block = blocks.get(blockKey);
      if (!block) {
        block = {
          axisId,
          axisCode: axis?.code ?? '',
          axisName: axis?.name ?? '',
          formTemplateId: row.formTemplateId ? String(row.formTemplateId) : null,
          formTemplateVersion: version,
          groups: new Map(),
        };
        blocks.set(blockKey, block);
      }

      const contentId = String(content?._id ?? row.workContentId);
      let group = block.groups.get(contentId);
      if (!group) {
        group = {
          workContentId: contentId,
          workContentCode: content?.code ?? '',
          workContentName: content?.name ?? '',
          rows: [],
        };
        block.groups.set(contentId, group);
      }
      group.rows.push(row);
    }

    const axes = await Promise.all(
      [...blocks.values()].map(async (block) => ({
        axisId: block.axisId,
        axisCode: block.axisCode,
        axisName: block.axisName,
        template: await this.resolveBoardTemplate(
          block.axisId,
          block.formTemplateId,
          block.formTemplateVersion,
        ),
        groups: [...block.groups.values()],
      })),
    );

    const counts = { pending: 0, approved: 0, returned: 0 };
    for (const row of rows) {
      if (row.reviewStatus === 'PENDING') counts.pending += 1;
      else if (row.reviewStatus === 'APPROVED') counts.approved += 1;
      else if (row.reviewStatus === 'RETURNED') counts.returned += 1;
    }

    return {
      message: 'OK',
      data: {
        axes,
        counts,
        rowCount: rows.length,
        truncated: rows.length >= BOARD_MAX_ROWS,
      },
    };
  }

  /** Lịch sử một nhiệm vụ: đã đi qua những lượt gửi nào, ai sửa gì. */
  async history(userId: string, id: string) {
    const itemId = this.requireObjectId(id, 'Nhiệm vụ');
    const actor = await this.requireActor(userId);

    const item = await this.itemModel
      .findById(itemId)
      .populate('axisId', 'code name')
      .populate('workContentId', 'code name')
      .populate('ownerId', 'fullName username');
    if (!item) throw new NotFoundException('Không tìm thấy nhiệm vụ.');

    const submissions = await this.submissionModel
      .find({ itemIds: itemId })
      .sort({ level: 1, createdAt: 1 });

    const involved =
      String(item.ownerId?._id ?? item.ownerId) === String(actor.id) ||
      String(item.currentRecipientId ?? '') === String(actor.id) ||
      submissions.some(
        (row) =>
          String(row.senderId) === String(actor.id) ||
          String(row.recipientId) === String(actor.id),
      );
    if (!involved) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    }

    return { message: 'OK', data: { item, submissions } };
  }

  /** Các lượt gửi đến tôi - dùng cho danh sách gọn bên cạnh bảng tổng. */
  async inboxSubmissions(
    userId: string,
    query: PersonalKpiReportsQueryDto,
  ) {
    const actor = await this.requireActor(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter: Record<string, unknown> = { recipientId: actor.id };

    const range: Record<string, string> = {};
    if (query.fromDate) range.$gte = this.requireYmd(query.fromDate, 'fromDate');
    if (query.toDate) range.$lte = this.requireYmd(query.toDate, 'toDate');
    if (Object.keys(range).length) filter.reportDate = range;

    const [data, total] = await Promise.all([
      this.submissionModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.submissionModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  // ================================================================= nội bộ

  private countIf(status: PersonalKpiReviewStatus) {
    return { $sum: { $cond: [{ $eq: ['$reviewStatus', status] }, 1, 0] } };
  }

  private likeRegex(value: string) {
    const escaped = value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }

  /**
   * Ghi một lượt gửi rồi đẩy toàn bộ nhiệm vụ sang người nhận.
   * Validate xong mới ghi, để không có lượt gửi dở dang.
   */
  private async createSubmission(input: {
    level: number;
    sender: ActorInfo;
    target: ActorInfo;
    note: string;
    reportDate: string;
    items: PersonalKpiItemDocument[];
    sourceSubmissionIds: Types.ObjectId[];
    message: (count: number) => string;
  }) {
    const { level, sender, target, note, reportDate, items } = input;
    const itemIds = items.map((item) => item._id as Types.ObjectId);
    const now = new Date();

    const submission = await this.submissionModel.create({
      reportDate,
      level,
      senderId: sender.id,
      senderName: sender.name,
      senderDepartmentId: sender.departmentId,
      recipientId: target.id,
      recipientName: target.name,
      recipientDepartmentId: target.departmentId,
      itemIds,
      sourceSubmissionIds: input.sourceSubmissionIds,
      note,
      status: 'PENDING' as const,
    });

    await this.itemModel.updateMany(
      { _id: { $in: itemIds } },
      {
        $set: {
          reviewStatus: 'PENDING',
          returnReason: '',
          holderLevel: level,
          currentRecipientId: target.id,
          currentRecipientDepartmentId: target.departmentId,
          currentSubmissionId: submission._id,
          lastSenderId: sender.id,
          lastSenderDepartmentId: sender.departmentId,
          lastSentAt: now,
        },
      },
    );

    return {
      message: input.message(items.length),
      data: {
        submissionId: String(submission._id),
        reportDate,
        level,
        sentCount: items.length,
        recipientId: String(target.id),
        recipientName: target.name,
      },
    };
  }

  /** Lượt gửi không còn nhiệm vụ nào chờ duyệt thì đánh dấu đã xử lý xong. */
  private async closeSubmissionsIfSettled(items: PersonalKpiItemDocument[]) {
    const ids = [
      ...new Set(
        items
          .map((item) => item.currentSubmissionId)
          .filter((id): id is Types.ObjectId => Boolean(id))
          .map((id) => String(id)),
      ),
    ];

    for (const id of ids) {
      const submissionId = new Types.ObjectId(id);
      const stillPending = await this.itemModel.countDocuments({
        currentSubmissionId: submissionId,
        reviewStatus: 'PENDING',
      });
      if (stillPending === 0) {
        await this.submissionModel.updateOne(
          { _id: submissionId },
          { $set: { status: 'REVIEWED' } },
        );
      }
    }
  }

  /** Chốt mẫu bảng cho các nhiệm vụ chưa từng gửi. */
  private async stampTemplates(items: PersonalKpiItemDocument[]) {
    const axisIds = [
      ...new Set(
        items
          .filter((item) => !item.formTemplateId)
          .map((item) => String(item.axisId)),
      ),
    ];
    if (!axisIds.length) return;

    const templates = await this.formTemplateModel.find({
      axisIds: { $in: axisIds.map((id) => new Types.ObjectId(id)) },
      isActive: true,
    });

    const byAxis = new Map<string, FormTemplateDocument>();
    for (const template of templates) {
      for (const axisId of template.axisIds) {
        byAxis.set(String(axisId), template);
      }
    }

    for (const item of items) {
      if (item.formTemplateId) continue;
      const template = byAxis.get(String(item.axisId));
      if (!template) continue;
      item.formTemplateId = template._id as Types.ObjectId;
      item.formTemplateVersion = template.version ?? 1;
      await item.save();
    }
  }

  /**
   * Cột super admin tích "bắt buộc" trong mẫu phải có dữ liệu trước khi gửi.
   * Kiểm ở đây chứ không chỉ ở client, vì cờ required chỉ có nghĩa khi server
   * thật sự chặn.
   */
  private async assertRequiredColumnsFilled(
    items: PersonalKpiItemDocument[],
  ) {
    const templateIds = [
      ...new Set(
        items
          .map((item) => item.formTemplateId)
          .filter((id): id is Types.ObjectId => Boolean(id))
          .map((id) => String(id)),
      ),
    ];
    if (!templateIds.length) return;

    const templates = await this.formTemplateModel.find({
      _id: { $in: templateIds.map((id) => new Types.ObjectId(id)) },
    });
    const byId = new Map(templates.map((row) => [String(row._id), row]));

    const problems: string[] = [];
    for (const item of items) {
      const template = byId.get(String(item.formTemplateId ?? ''));
      if (!template) continue;

      const missing = template.columns
        .filter(
          (column) =>
            column.visible &&
            column.required &&
            column.semanticKey !== 'stt' &&
            this.isColumnEmpty(item, column.semanticKey, column.key),
        )
        .map((column) => column.title);

      if (missing.length) {
        problems.push(`"${item.title}": ${missing.join(', ')}`);
      }
    }

    if (problems.length) {
      throw new BadRequestException(
        `Chưa nhập cột bắt buộc - ${problems.join('; ')}.`,
      );
    }
  }

  private isColumnEmpty(
    item: PersonalKpiItemDocument,
    semanticKey: string,
    columnKey: string,
  ): boolean {
    switch (semanticKey) {
      case 'task_title':
        return !item.title?.trim();
      case 'deadline':
        return !item.deadline?.trim();
      case 'product':
        return !item.product?.trim();
      case 'standard_score':
        return item.standardScore == null;
      case 'executing_unit':
        return !item.executingUnit?.trim();
      case 'progress_percent':
        return item.progressPercent == null;
      case 'progress_self_score':
        return item.progressSelfScore == null;
      case 'quality_percent':
        return item.qualityPercent == null;
      case 'quality_self_score':
        return item.qualitySelfScore == null;
      case 'result_passed':
        return item.resultPassed !== true;
      case 'result_failed':
        return item.resultFailed !== true;
      case 'note':
        return !item.note?.trim();
      case 'evidence_files':
        return !item.evidenceFiles?.length;
      case 'work_content':
        return !item.workContentId;
      default:
        return !String(item.fieldValues?.[columnKey] ?? '').trim();
    }
  }

  private async resolveBoardTemplate(
    axisId: string,
    formTemplateId: string | null,
    version: number | null,
  ) {
    if (formTemplateId && version) {
      const resolved = await this.formTemplatesService.resolveVersion(
        formTemplateId,
        version,
      );
      if (resolved) return resolved;
    }

    // Nhiệm vụ chưa chốt mẫu (chưa từng gửi) -> lấy mẫu đang gán cho trục.
    const live = await this.formTemplateModel.findOne({
      axisIds: new Types.ObjectId(axisId),
      isActive: true,
    });
    if (!live) return null;
    return {
      code: live.code,
      name: live.name,
      version: live.version ?? 1,
      columns: live.columns,
      headerGroups: live.headerGroups,
    };
  }

  /**
   * Cấp trên nhận được báo cáo: người đang hoạt động, thuộc đơn vị của tôi
   * hoặc một đơn vị tổ tiên, và giữ vai trò cao hơn vai trò cao nhất của tôi.
   * Bám cây đơn vị nên không lọt người ngoài nhánh.
   */
  private async findRecipientsUp(userId: string, q?: string) {
    const me = await this.userModel.findById(userId);
    if (!me) throw new NotFoundException('Không tìm thấy người dùng.');
    if (!me.departmentId) {
      throw new BadRequestException(
        'Tài khoản chưa gắn đơn vị - không xác định được cấp trên để gửi.',
      );
    }

    const dept = await this.departmentModel.findById(me.departmentId);
    if (!dept) throw new BadRequestException('Đơn vị công tác không tồn tại.');

    const myRank = Math.max(
      -1,
      ...(me.roleAssignments ?? []).map((item) =>
        ROLE_LADDER.indexOf(item.roleCode as RoleCode),
      ),
    );
    const higherRoles = ROLE_LADDER.slice(myRank + 1);
    if (!higherRoles.length) {
      return { higherRoles: [], people: [] };
    }

    const scopeIds = [me.departmentId, ...(dept.ancestors ?? [])].map(
      (id) => new Types.ObjectId(String(id)),
    );

    const filter: Record<string, unknown> = {
      isActive: true,
      _id: { $ne: me._id },
      departmentId: { $in: scopeIds },
      'roleAssignments.roleCode': { $in: higherRoles },
    };
    if (q?.trim()) {
      const regex = this.likeRegex(q);
      filter.$or = [{ fullName: regex }, { username: regex }];
    }

    const found = await this.userModel
      .find(filter)
      .select('fullName username departmentId roleAssignments position')
      .populate('departmentId', 'code name')
      .sort({ fullName: 1, username: 1 })
      .lean();

    const people = found.map((user) => {
      const userDept =
        user.departmentId && typeof user.departmentId === 'object'
          ? (user.departmentId as { _id?: Types.ObjectId; code?: string; name?: string })
          : null;
      return {
        id: String(user._id),
        fullName: user.fullName?.trim() || user.username,
        username: user.username,
        position: user.position ?? '',
        departmentId: userDept?._id ? String(userDept._id) : null,
        departmentCode: userDept?.code ?? '',
        departmentName: userDept?.name ?? 'Chưa gắn đơn vị',
        roleCodes: (user.roleAssignments ?? []).map((item) => item.roleCode),
      };
    });

    return { higherRoles, people };
  }

  private async requireValidRecipient(
    userId: string,
    recipientId: string,
  ): Promise<ActorInfo> {
    const id = recipientId?.trim();
    if (!id || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Người nhận không hợp lệ.');
    }

    const allowed = await this.findRecipientsUp(userId);
    if (!allowed.people.some((person) => person.id === id)) {
      throw new BadRequestException(
        'Người nhận không phải cấp trên trong nhánh đơn vị của bạn.',
      );
    }

    const recipient = await this.userModel.findById(id);
    if (!recipient || !recipient.isActive) {
      throw new BadRequestException('Người nhận không tồn tại hoặc đã khoá.');
    }

    return {
      id: recipient._id as Types.ObjectId,
      name: recipient.fullName?.trim() || recipient.username,
      departmentId: recipient.departmentId
        ? new Types.ObjectId(String(recipient.departmentId))
        : null,
    };
  }

  private async requireActor(userId: string): Promise<ActorInfo> {
    const user = await this.userModel
      .findById(this.requireObjectId(userId, 'Người dùng'))
      .select('fullName username departmentId');
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    return {
      id: user._id as Types.ObjectId,
      name: user.fullName?.trim() || user.username,
      departmentId: user.departmentId
        ? new Types.ObjectId(String(user.departmentId))
        : null,
    };
  }

  private requireNote(note?: string) {
    const value = note?.trim() ?? '';
    if (!value) throw new BadRequestException('Nội dung gửi là bắt buộc.');
    if (value.length > 1000) {
      throw new BadRequestException('Nội dung gửi tối đa 1000 ký tự.');
    }
    return value;
  }

  private mapContent(dto: CreatePersonalKpiDto) {
    return {
      deadline: dto.deadline?.trim() ?? '',
      product: dto.product?.trim() ?? '',
      standardScore: dto.standardScore ?? 0,
      executingUnit: dto.executingUnit?.trim() ?? '',
      progressPercent: dto.progressPercent ?? null,
      progressSelfScore: dto.progressSelfScore ?? null,
      qualityPercent: dto.qualityPercent ?? null,
      qualitySelfScore: dto.qualitySelfScore ?? null,
      ...this.resolveResultPair(dto.resultPassed, dto.resultFailed),
      note: dto.note?.trim() ?? '',
      evidenceFiles: dto.evidenceFiles ?? [],
      fieldValues: dto.fieldValues ?? {},
    };
  }

  /**
   * Đạt / Không đạt loại trừ nhau: tích một bên thì bên kia tự tắt.
   * Không cho lưu trạng thái vừa đạt vừa không đạt dù client gửi kiểu gì.
   */
  private resolveResultPair(
    passed: boolean | null | undefined,
    failed: boolean | null | undefined,
  ): { resultPassed: boolean | null; resultFailed: boolean | null } {
    if (passed) return { resultPassed: true, resultFailed: false };
    if (failed) return { resultPassed: false, resultFailed: true };
    if (passed === undefined && failed === undefined) {
      return { resultPassed: null, resultFailed: null };
    }
    return { resultPassed: null, resultFailed: null };
  }

  private applyContent(
    item: PersonalKpiItemDocument,
    dto: UpdatePersonalKpiDto | ReviewerEditPersonalKpiDto,
  ) {
    if (dto.title !== undefined) item.title = dto.title.trim();
    if (dto.deadline !== undefined) item.deadline = dto.deadline.trim();
    if (dto.product !== undefined) item.product = dto.product.trim();
    if (dto.standardScore !== undefined) item.standardScore = dto.standardScore;
    if (dto.executingUnit !== undefined) {
      item.executingUnit = dto.executingUnit.trim();
    }
    if (dto.progressPercent !== undefined) {
      item.progressPercent = dto.progressPercent;
    }
    if (dto.progressSelfScore !== undefined) {
      item.progressSelfScore = dto.progressSelfScore;
    }
    if (dto.qualityPercent !== undefined) {
      item.qualityPercent = dto.qualityPercent;
    }
    if (dto.qualitySelfScore !== undefined) {
      item.qualitySelfScore = dto.qualitySelfScore;
    }
    if (dto.resultPassed !== undefined || dto.resultFailed !== undefined) {
      const pair = this.resolveResultPair(
        dto.resultPassed ?? (dto.resultFailed ? false : item.resultPassed),
        dto.resultFailed ?? (dto.resultPassed ? false : item.resultFailed),
      );
      item.resultPassed = pair.resultPassed;
      item.resultFailed = pair.resultFailed;
    }
    if (dto.note !== undefined) item.note = dto.note.trim();
    if (dto.evidenceFiles !== undefined) {
      item.evidenceFiles = dto.evidenceFiles;
    }
    if (dto.fieldValues !== undefined) {
      item.fieldValues = { ...item.fieldValues, ...dto.fieldValues };
      item.markModified('fieldValues');
    }
  }

  /** Trường nào thực sự đổi - dùng để ghi lịch sử sửa của cấp trên. */
  private diffContent(
    item: PersonalKpiItemDocument,
    dto: ReviewerEditPersonalKpiDto,
  ) {
    const changes: Array<{
      field: string;
      label: string;
      from: unknown;
      to: unknown;
    }> = [];

    const compare = (field: keyof typeof CONTENT_FIELD_LABELS, next: unknown) => {
      if (next === undefined) return;
      const current = (item as unknown as Record<string, unknown>)[field];
      const normalized =
        typeof next === 'string' ? next.trim() : (next as unknown);
      if (String(current ?? '') === String(normalized ?? '')) return;
      changes.push({
        field,
        label: CONTENT_FIELD_LABELS[field] ?? field,
        from: current ?? null,
        to: normalized ?? null,
      });
    };

    compare('title', dto.title);
    compare('deadline', dto.deadline);
    compare('product', dto.product);
    compare('standardScore', dto.standardScore);
    compare('executingUnit', dto.executingUnit);
    compare('progressPercent', dto.progressPercent);
    compare('progressSelfScore', dto.progressSelfScore);
    compare('qualityPercent', dto.qualityPercent);
    compare('qualitySelfScore', dto.qualitySelfScore);
    compare('resultPassed', dto.resultPassed);
    compare('resultFailed', dto.resultFailed);
    compare('note', dto.note);

    for (const [key, next] of Object.entries(dto.fieldValues ?? {})) {
      const current = item.fieldValues?.[key];
      if (String(current ?? '') === String(next ?? '')) continue;
      changes.push({
        field: `fieldValues.${key}`,
        label: key,
        from: current ?? null,
        to: next ?? null,
      });
    }

    return changes;
  }

  private resolveReportDate(value?: string) {
    if (!value?.trim()) return serverDateYmd();
    return this.requireYmd(value.trim(), 'Ngày báo cáo');
  }

  private requireYmd(value: string, label: string) {
    if (!isYmd(value)) {
      throw new BadRequestException(`${label} phải là YYYY-MM-DD.`);
    }
    return value;
  }

  private async requireOwned(
    ownerId: string,
    id: string,
    withPopulate = false,
  ) {
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const query = this.itemModel.findOne({
      _id: this.requireObjectId(id, 'Nhiệm vụ'),
      ownerId: owner,
    });
    if (withPopulate) {
      query
        .populate('axisId', 'code name description')
        .populate('workContentId', 'code name description');
    }
    const item = await query;
    if (!item) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    return item;
  }

  private async requireAxisAndContent(axisId: string, workContentId: string) {
    const [axis, workContent] = await Promise.all([
      this.axisModel.findById(this.requireObjectId(axisId, 'Trục')),
      this.workContentModel.findById(
        this.requireObjectId(workContentId, 'Nội dung công việc'),
      ),
    ]);
    if (!axis) throw new BadRequestException('Trục không tồn tại.');
    if (!workContent) {
      throw new BadRequestException('Nội dung công việc không tồn tại.');
    }
    if (String(workContent.axisId) !== String(axis._id)) {
      throw new BadRequestException(
        'Nội dung công việc không thuộc trục đã chọn.',
      );
    }
    return { axis, workContent };
  }

  private requireObjectId(id: string, label: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`${label} không hợp lệ.`);
    }
    return new Types.ObjectId(id);
  }
}
