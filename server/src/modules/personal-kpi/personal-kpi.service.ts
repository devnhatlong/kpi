import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { RoleCode } from '@/common/enums/role-code.enum';
import { Axis, AxisDocument } from '@/modules/kpi-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentDocument,
} from '@/modules/kpi-form-config/schemas/work-content.schema';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  CreatePersonalKpiBatchDto,
  CreatePersonalKpiDto,
  PersonalKpiInboxQueryDto,
  PersonalKpiListQueryDto,
  PersonalKpiReportsQueryDto,
  RejectPersonalKpiDto,
  SendPersonalKpiDto,
  UpdatePersonalKpiDto,
} from './dto/personal-kpi.dto';
import {
  PERSONAL_KPI_STATUSES,
  PersonalKpiItem,
  PersonalKpiItemDocument,
  PersonalKpiStatus,
} from './schemas/personal-kpi-item.schema';
import {
  KPI_TIMEZONE,
  isYmd,
  serverDateYmd,
  shiftYmd,
} from './personal-kpi.time';

const EDITABLE: PersonalKpiStatus[] = ['DRAFT', 'REJECTED'];
const SEND_NOTE_MAX = 1000;

/** Bậc role tăng dần - gửi cho đúng 1 bậc trên. */
const ROLE_LADDER: RoleCode[] = [
  RoleCode.STAFF,
  RoleCode.MANAGER,
  RoleCode.UNIT_ADMIN,
  RoleCode.SUPER_ADMIN,
];

const ROLE_LABEL: Record<RoleCode, string> = {
  [RoleCode.STAFF]: 'Staff',
  [RoleCode.MANAGER]: 'Manager',
  [RoleCode.UNIT_ADMIN]: 'Unit Admin',
  [RoleCode.SUPER_ADMIN]: 'Super Admin',
};

@Injectable()
export class PersonalKpiService {
  constructor(
    @InjectModel(PersonalKpiItem.name)
    private readonly itemModel: Model<PersonalKpiItemDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
  ) {}

  async createMany(ownerId: string, batch: CreatePersonalKpiBatchDto) {
    const items = batch.items;
    if (!items?.length) {
      throw new BadRequestException('Chưa có nhiệm vụ nào để lưu.');
    }
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const reportDate = this.resolveReportDate(batch.reportDate);
    const created: PersonalKpiItemDocument[] = [];

    for (const dto of items) {
      const { axis, workContent } = await this.requireAxisAndContent(
        dto.axisId,
        dto.workContentId,
      );
      const doc = await this.itemModel.create(
        this.mapCreateFields(dto, owner, axis._id, workContent._id, reportDate),
      );
      created.push(doc);
    }

    const data = await this.itemModel
      .find({ _id: { $in: created.map((d) => d._id) } })
      .sort({ createdAt: -1 })
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

  /**
   * Tóm tắt dashboard KPI cá nhân:
   * - streak: chuỗi ngày có lập báo cáo (có nhiệm vụ)
   * - week: số ngày trong 7 ngày gần nhất đã từng gửi
   * - hôm nay: số NV + nháp
   * - chờ duyệt (SENT) / trả lại (REJECTED) toàn cục — việc cần theo dõi
   */
  async getDashboardSummary(ownerId: string) {
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const today = serverDateYmd();
    const lookbackDays = 60;
    const fromDate = shiftYmd(today, -(lookbackDays - 1));
    const reportDateExpr = {
      $ifNull: [
        '$reportDate',
        {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
            timezone: KPI_TIMEZONE,
          },
        },
      ],
    };

    const [statusRows, dailyRows] = await Promise.all([
      this.itemModel.aggregate<{ _id: string; count: number }>([
        { $match: { ownerId: owner } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.itemModel.aggregate<{
        _id: string;
        taskCount: number;
        draftCount: number;
        submittedCount: number;
      }>([
        { $match: { ownerId: owner } },
        { $addFields: { reportDateResolved: reportDateExpr } },
        {
          $match: {
            reportDateResolved: { $gte: fromDate, $lte: today },
          },
        },
        {
          $group: {
            _id: '$reportDateResolved',
            taskCount: { $sum: 1 },
            draftCount: {
              $sum: { $cond: [{ $eq: ['$status', 'DRAFT'] }, 1, 0] },
            },
            submittedCount: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['SENT', 'REJECTED', 'COMPLETED']] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const statusMap = new Map(
      statusRows.map((row) => [row._id, row.count] as const),
    );
    const pendingSentCount = statusMap.get('SENT') ?? 0;
    const rejectedCount = statusMap.get('REJECTED') ?? 0;

    const byDate = new Map(
      dailyRows.map((row) => [
        row._id,
        {
          taskCount: row.taskCount,
          draftCount: row.draftCount,
          submittedCount: row.submittedCount,
        },
      ]),
    );

    const todayStats = byDate.get(today) ?? {
      taskCount: 0,
      draftCount: 0,
      submittedCount: 0,
    };

    // Chuỗi: nếu hôm nay chưa lập thì tạm tính từ hôm qua (không phá chuỗi giữa ngày).
    let streakCursor =
      todayStats.taskCount > 0 ? today : shiftYmd(today, -1);
    let streakDays = 0;
    for (let i = 0; i < lookbackDays; i += 1) {
      const day = byDate.get(streakCursor);
      if (!day || day.taskCount <= 0) break;
      streakDays += 1;
      streakCursor = shiftYmd(streakCursor, -1);
    }

    const weekWindowDays = 7;
    let weekReportedDays = 0;
    for (let i = 0; i < weekWindowDays; i += 1) {
      const ymd = shiftYmd(today, -i);
      const day = byDate.get(ymd);
      if (day && day.submittedCount > 0) weekReportedDays += 1;
    }

    return {
      message: 'OK',
      data: {
        today,
        streakDays,
        weekReportedDays,
        weekWindowDays,
        todayTaskCount: todayStats.taskCount,
        todayDraftCount: todayStats.draftCount,
        pendingSentCount,
        rejectedCount,
      },
    };
  }

  async findReports(ownerId: string, query: PersonalKpiReportsQueryDto) {
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    if (query.fromDate && !isYmd(query.fromDate)) {
      throw new BadRequestException('fromDate phải là YYYY-MM-DD.');
    }
    if (query.toDate && !isYmd(query.toDate)) {
      throw new BadRequestException('toDate phải là YYYY-MM-DD.');
    }
    if (
      query.status &&
      !PERSONAL_KPI_STATUSES.includes(query.status as PersonalKpiStatus)
    ) {
      throw new BadRequestException('Trạng thái không hợp lệ.');
    }

    const reportDateExpr = {
      $ifNull: [
        '$reportDate',
        {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
            timezone: KPI_TIMEZONE,
          },
        },
      ],
    };

    const preMatch: Record<string, unknown> = { ownerId: owner };
    if (query.status) preMatch.status = query.status;
    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      preMatch.title = new RegExp(escaped, 'i');
    }

    const dateRange: Record<string, string> = {};
    if (query.fromDate) dateRange.$gte = query.fromDate;
    if (query.toDate) dateRange.$lte = query.toDate;

    const datePipeline: PipelineStage[] = [
      { $match: preMatch },
      { $addFields: { reportDateResolved: reportDateExpr } },
    ];
    if (Object.keys(dateRange).length) {
      datePipeline.push({ $match: { reportDateResolved: dateRange } });
    }
    datePipeline.push({ $group: { _id: '$reportDateResolved' } });

    const dateDocs = await this.itemModel.aggregate<{ _id: string }>(
      datePipeline,
    );
    const dates = dateDocs.map((d) => d._id).filter(Boolean).sort().reverse();
    const total = dates.length;
    const pageDates = dates.slice(skip, skip + limit);

    if (pageDates.length === 0) {
      return buildPaginatedResponse([], total, page, limit);
    }

    const summary = await this.itemModel.aggregate([
      { $match: { ownerId: owner } },
      { $addFields: { reportDateResolved: reportDateExpr } },
      { $match: { reportDateResolved: { $in: pageDates } } },
      {
        $group: {
          _id: '$reportDateResolved',
          taskCount: { $sum: 1 },
          draftCount: {
            $sum: { $cond: [{ $eq: ['$status', 'DRAFT'] }, 1, 0] },
          },
          sentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'SENT'] }, 1, 0] },
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] },
          },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
          },
          createdAt: { $min: '$createdAt' },
          updatedAt: { $max: '$updatedAt' },
          lastSentAt: { $max: '$sentAt' },
        },
      },
      {
        $project: {
          _id: 0,
          reportDate: '$_id',
          taskCount: 1,
          draftCount: 1,
          sentCount: 1,
          rejectedCount: 1,
          completedCount: 1,
          createdAt: 1,
          updatedAt: 1,
          lastSentAt: 1,
        },
      },
    ]);

    const byDate = new Map(
      summary.map((row: { reportDate: string }) => [row.reportDate, row]),
    );
    const data = pageDates
      .map((date) => byDate.get(date))
      .filter(Boolean);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findMine(ownerId: string, query: PersonalKpiListQueryDto = {}) {
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = { ownerId: owner };

    if (query.reportDate) {
      if (!isYmd(query.reportDate)) {
        throw new BadRequestException('reportDate phải là YYYY-MM-DD.');
      }
      filter.$or = [
        { reportDate: query.reportDate },
        {
          reportDate: { $exists: false },
          $expr: {
            $eq: [
              {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: KPI_TIMEZONE,
                },
              },
              query.reportDate,
            ],
          },
        },
      ];
    }

    if (query.status) {
      if (!PERSONAL_KPI_STATUSES.includes(query.status as PersonalKpiStatus)) {
        throw new BadRequestException('Trạng thái không hợp lệ.');
      }
      filter.status = query.status;
    }

    if (query.axisId) {
      if (!Types.ObjectId.isValid(query.axisId)) {
        throw new BadRequestException('Trục không hợp lệ.');
      }
      filter.axisId = new Types.ObjectId(query.axisId);
    }

    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = new RegExp(escaped, 'i');
    }

    const [data, total] = await Promise.all([
      this.itemModel
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('axisId', 'code name description')
        .populate('workContentId', 'code name description'),
      this.itemModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(ownerId: string, id: string) {
    const item = await this.requireOwned(ownerId, id, true);
    return { message: 'OK', data: item };
  }

  async update(ownerId: string, id: string, dto: UpdatePersonalKpiDto) {
    const item = await this.requireOwned(ownerId, id);
    await this.assertResubmittableInReport(item);

    if (dto.axisId !== undefined || dto.workContentId !== undefined) {
      const axisId = dto.axisId ?? String(item.axisId);
      const workContentId = dto.workContentId ?? String(item.workContentId);
      const { axis, workContent } = await this.requireAxisAndContent(
        axisId,
        workContentId,
      );
      item.axisId = axis._id;
      item.workContentId = workContent._id;
    }

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
    if (dto.note !== undefined) item.note = dto.note.trim();
    if (dto.evidenceFiles !== undefined) {
      item.evidenceFiles = dto.evidenceFiles;
    }

    if (!item.reportDate) {
      item.reportDate = serverDateYmd(item.createdAt ?? new Date());
    }

    // Giữ Trả lại đến khi gửi lại - không đổi thành Nháp khi sửa.
    if (item.status !== 'REJECTED') {
      item.status = 'DRAFT';
      item.rejectReason = '';
    }

    await item.save();
    await item.populate([
      { path: 'axisId', select: 'code name description' },
      { path: 'workContentId', select: 'code name description' },
    ]);

    return { message: 'Đã lưu nháp.', data: item };
  }

  async listRecipients(ownerId: string, q?: string) {
    const data = await this.findRecipientsOneLevelUp(ownerId, q);
    return { message: 'OK', data };
  }

  /** Báo cáo gửi đến tôi - gom theo người gửi + ngày */
  async findInboxReports(
    recipientId: string,
    query: PersonalKpiReportsQueryDto,
  ) {
    const recipient = this.requireObjectId(recipientId, 'Người nhận');
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    if (query.fromDate && !isYmd(query.fromDate)) {
      throw new BadRequestException('fromDate phải là YYYY-MM-DD.');
    }
    if (query.toDate && !isYmd(query.toDate)) {
      throw new BadRequestException('toDate phải là YYYY-MM-DD.');
    }
    if (
      query.status &&
      !PERSONAL_KPI_STATUSES.includes(query.status as PersonalKpiStatus)
    ) {
      throw new BadRequestException('Trạng thái không hợp lệ.');
    }

    const reportDateExpr = {
      $ifNull: [
        '$reportDate',
        {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$createdAt',
            timezone: KPI_TIMEZONE,
          },
        },
      ],
    };

    const preMatch: Record<string, unknown> = {
      recipientId: recipient,
      status: { $ne: 'DRAFT' },
    };
    if (query.status) preMatch.status = query.status;
    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      preMatch.title = new RegExp(escaped, 'i');
    }

    const dateRange: Record<string, string> = {};
    if (query.fromDate) dateRange.$gte = query.fromDate;
    if (query.toDate) dateRange.$lte = query.toDate;

    const keysPipeline: PipelineStage[] = [
      { $match: preMatch },
      { $addFields: { reportDateResolved: reportDateExpr } },
    ];
    if (Object.keys(dateRange).length) {
      keysPipeline.push({ $match: { reportDateResolved: dateRange } });
    }
    keysPipeline.push({
      $group: {
        _id: {
          ownerId: '$ownerId',
          reportDate: '$reportDateResolved',
        },
      },
    });

    const keyDocs = await this.itemModel.aggregate<{
      _id: { ownerId: Types.ObjectId; reportDate: string };
    }>(keysPipeline);

    const keys = keyDocs
      .map((row) => row._id)
      .filter((row) => row?.reportDate && row?.ownerId)
      .sort((a, b) => {
        const byDate = String(b.reportDate).localeCompare(String(a.reportDate));
        if (byDate !== 0) return byDate;
        return String(b.ownerId).localeCompare(String(a.ownerId));
      });

    const total = keys.length;
    const pageKeys = keys.slice(skip, skip + limit);
    if (pageKeys.length === 0) {
      return buildPaginatedResponse([], total, page, limit);
    }

    const summary = await this.itemModel.aggregate([
      { $match: preMatch },
      { $addFields: { reportDateResolved: reportDateExpr } },
      {
        $match: {
          $or: pageKeys.map((key) => ({
            ownerId: key.ownerId,
            reportDateResolved: key.reportDate,
          })),
        },
      },
      {
        $group: {
          _id: {
            ownerId: '$ownerId',
            reportDate: '$reportDateResolved',
          },
          taskCount: { $sum: 1 },
          sentCount: {
            $sum: { $cond: [{ $eq: ['$status', 'SENT'] }, 1, 0] },
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'REJECTED'] }, 1, 0] },
          },
          completedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] },
          },
          createdAt: { $min: '$createdAt' },
          updatedAt: { $max: '$updatedAt' },
          lastSentAt: { $max: '$sentAt' },
          sendNote: { $last: '$sendNote' },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id.ownerId',
          foreignField: '_id',
          as: 'owner',
        },
      },
      {
        $addFields: {
          ownerDoc: { $arrayElemAt: ['$owner', 0] },
        },
      },
      {
        $project: {
          _id: 0,
          ownerId: { $toString: '$_id.ownerId' },
          reportDate: '$_id.reportDate',
          ownerName: {
            $ifNull: [
              { $trim: { input: '$ownerDoc.fullName' } },
              '$ownerDoc.username',
            ],
          },
          ownerUsername: '$ownerDoc.username',
          taskCount: 1,
          sentCount: 1,
          rejectedCount: 1,
          completedCount: 1,
          createdAt: 1,
          updatedAt: 1,
          lastSentAt: 1,
          sendNote: 1,
        },
      },
    ]);

    const byKey = new Map(
      summary.map((row: { ownerId: string; reportDate: string }) => [
        `${row.ownerId}:${row.reportDate}`,
        row,
      ]),
    );
    const data = pageKeys
      .map((key) => byKey.get(`${String(key.ownerId)}:${key.reportDate}`))
      .filter(Boolean);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findInbox(recipientId: string, query: PersonalKpiInboxQueryDto = {}) {
    const recipient = this.requireObjectId(recipientId, 'Người nhận');
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {
      recipientId: recipient,
      status: { $ne: 'DRAFT' },
    };

    if (query.ownerId) {
      filter.ownerId = this.requireObjectId(query.ownerId, 'Người gửi');
    }

    if (query.reportDate) {
      if (!isYmd(query.reportDate)) {
        throw new BadRequestException('reportDate phải là YYYY-MM-DD.');
      }
      filter.$or = [
        { reportDate: query.reportDate },
        {
          reportDate: { $exists: false },
          $expr: {
            $eq: [
              {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: KPI_TIMEZONE,
                },
              },
              query.reportDate,
            ],
          },
        },
      ];
    }

    if (query.status) {
      if (!PERSONAL_KPI_STATUSES.includes(query.status as PersonalKpiStatus)) {
        throw new BadRequestException('Trạng thái không hợp lệ.');
      }
      filter.status = query.status;
    }

    if (query.axisId) {
      if (!Types.ObjectId.isValid(query.axisId)) {
        throw new BadRequestException('Trục không hợp lệ.');
      }
      filter.axisId = new Types.ObjectId(query.axisId);
    }

    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = new RegExp(escaped, 'i');
    }

    const [data, total] = await Promise.all([
      this.itemModel
        .find(filter)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('ownerId', 'fullName username departmentId')
        .populate('axisId', 'code name description')
        .populate('workContentId', 'code name description'),
      this.itemModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async complete(recipientId: string, id: string) {
    const item = await this.requireReceived(recipientId, id, true);
    if (item.status !== 'SENT') {
      throw new BadRequestException(
        'Chỉ hoàn thành được nhiệm vụ đang ở trạng thái Đã gửi.',
      );
    }
    item.status = 'COMPLETED';
    item.rejectReason = '';
    await item.save();
    return { message: 'Đã duyệt hoàn thành.', data: item };
  }

  async reject(recipientId: string, id: string, dto: RejectPersonalKpiDto) {
    const item = await this.requireReceived(recipientId, id, true);
    if (item.status !== 'SENT') {
      throw new BadRequestException(
        'Chỉ trả lại được nhiệm vụ đang ở trạng thái Đã gửi.',
      );
    }
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Lý do trả lại là bắt buộc.');
    }
    item.status = 'REJECTED';
    item.rejectReason = reason;
    await item.save();
    return { message: 'Đã trả lại nhiệm vụ.', data: item };
  }

  async completeInboxReport(
    recipientId: string,
    ownerId: string,
    reportDate: string,
  ) {
    const items = await this.findInboxSentItems(
      recipientId,
      ownerId,
      reportDate,
    );
    if (items.length === 0) {
      throw new BadRequestException(
        'Không có nhiệm vụ Đã gửi nào để duyệt trong báo cáo này.',
      );
    }
    await this.itemModel.updateMany(
      { _id: { $in: items.map((item) => item._id) } },
      { $set: { status: 'COMPLETED', rejectReason: '' } },
    );
    return {
      message: `Đã duyệt hoàn thành ${items.length} nhiệm vụ.`,
      data: { completedCount: items.length, reportDate, ownerId },
    };
  }

  async rejectInboxReport(
    recipientId: string,
    ownerId: string,
    reportDate: string,
    dto: RejectPersonalKpiDto,
  ) {
    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Lý do trả lại là bắt buộc.');
    }
    const items = await this.findInboxSentItems(
      recipientId,
      ownerId,
      reportDate,
    );
    if (items.length === 0) {
      throw new BadRequestException(
        'Không có nhiệm vụ Đã gửi nào để trả lại trong báo cáo này.',
      );
    }
    await this.itemModel.updateMany(
      { _id: { $in: items.map((item) => item._id) } },
      { $set: { status: 'REJECTED', rejectReason: reason } },
    );
    return {
      message: `Đã trả lại ${items.length} nhiệm vụ.`,
      data: { rejectedCount: items.length, reportDate, ownerId },
    };
  }

  async send(ownerId: string, id: string, dto: SendPersonalKpiDto) {
    const item = await this.requireOwned(ownerId, id);
    await this.assertResubmittableInReport(item);
    if (!item.title.trim()) {
      throw new BadRequestException(
        'Nhiệm vụ chưa có tên - hãy sửa trước khi gửi.',
      );
    }

    const target = await this.requireValidSendTarget(ownerId, dto);
    const sendNote = this.normalizeSendNote(dto.note);

    item.status = 'SENT';
    item.sentAt = new Date();
    item.rejectReason = '';
    item.recipientId = target.recipientId;
    item.recipientDepartmentId = target.recipientDepartmentId;
    item.recipientName = target.recipientName;
    item.sendNote = sendNote;
    await item.save();
    await item.populate([
      { path: 'axisId', select: 'code name description' },
      { path: 'workContentId', select: 'code name description' },
      { path: 'recipientId', select: 'fullName username departmentId' },
      { path: 'recipientDepartmentId', select: 'code name' },
    ]);

    return { message: 'Đã gửi nhiệm vụ.', data: item };
  }

  async sendReport(
    ownerId: string,
    reportDate: string,
    dto: SendPersonalKpiDto,
  ) {
    if (!isYmd(reportDate)) {
      throw new BadRequestException('reportDate phải là YYYY-MM-DD.');
    }
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const target = await this.requireValidSendTarget(ownerId, dto);
    const sendNote = this.normalizeSendNote(dto.note);
    const dateOr = this.reportDateOrFilter(reportDate);
    const hasRejected = Boolean(
      await this.itemModel.exists({
        ownerId: owner,
        status: 'REJECTED',
        $or: dateOr,
      }),
    );
    const allowedStatuses = hasRejected ? (['REJECTED'] as const) : EDITABLE;
    const filter: Record<string, unknown> = {
      ownerId: owner,
      status: { $in: [...allowedStatuses] },
      $or: dateOr,
    };

    if (dto.itemIds?.length) {
      filter._id = {
        $in: dto.itemIds.map((id) => this.requireObjectId(id, 'Nhiệm vụ')),
      };
    }

    const items = await this.itemModel.find(filter);
    if (items.length === 0) {
      throw new BadRequestException(
        hasRejected
          ? 'Không có nhiệm vụ Trả lại nào để gửi lại.'
          : 'Không có nhiệm vụ nháp/trả lại nào để gửi trong ngày này.',
      );
    }
    if (dto.itemIds?.length && items.length !== dto.itemIds.length) {
      throw new BadRequestException(
        hasRejected
          ? 'Chỉ gửi được đúng nhiệm vụ Trả lại trong báo cáo này.'
          : 'Một số nhiệm vụ không thể gửi (không thuộc báo cáo hoặc không còn Nháp/Trả lại).',
      );
    }

    const invalid = items.find((item) => !item.title.trim());
    if (invalid) {
      throw new BadRequestException(
        'Có nhiệm vụ chưa có tên - hãy sửa trước khi gửi báo cáo.',
      );
    }

    const now = new Date();
    await this.itemModel.updateMany(
      { _id: { $in: items.map((item) => item._id) } },
      {
        $set: {
          status: 'SENT',
          sentAt: now,
          rejectReason: '',
          recipientId: target.recipientId,
          recipientDepartmentId: target.recipientDepartmentId,
          recipientName: target.recipientName,
          sendNote,
        },
      },
    );

    return {
      message: hasRejected
        ? `Đã gửi lại ${items.length} nhiệm vụ Trả lại tới ${target.recipientName}.`
        : `Đã gửi ${items.length} nhiệm vụ tới ${target.recipientName}.`,
      data: {
        reportDate,
        sentCount: items.length,
        recipientId: target.recipientId
          ? String(target.recipientId)
          : null,
        recipientDepartmentId: target.recipientDepartmentId
          ? String(target.recipientDepartmentId)
          : null,
        recipientName: target.recipientName,
      },
    };
  }

  async remove(ownerId: string, id: string) {
    const item = await this.requireOwned(ownerId, id);
    this.assertEditable(item);
    await item.deleteOne();
    return { message: 'Đã xoá nhiệm vụ.' };
  }

  private normalizeSendNote(note?: string) {
    const value = note?.trim() ?? '';
    if (!value) {
      throw new BadRequestException('Nội dung gửi là bắt buộc.');
    }
    if (value.length > SEND_NOTE_MAX) {
      throw new BadRequestException(
        `Nội dung gửi tối đa ${SEND_NOTE_MAX} ký tự.`,
      );
    }
    return value;
  }

  private resolveTargetRole(roleCodes: string[]): RoleCode | null {
    const indexes = roleCodes
      .map((code) => ROLE_LADDER.indexOf(code as RoleCode))
      .filter((index) => index >= 0);
    if (indexes.length === 0) return null;
    // Lấy role thấp nhất của user → bậc trên 1 cấp
    const lowest = Math.min(...indexes);
    return ROLE_LADDER[lowest + 1] ?? null;
  }

  private async findRecipientsOneLevelUp(ownerId: string, q?: string) {
    const staff = await this.userModel.findById(ownerId);
    if (!staff) throw new NotFoundException('Không tìm thấy người dùng.');
    if (!staff.departmentId) {
      throw new BadRequestException(
        'Tài khoản chưa gắn đơn vị - không xác định được người nhận cấp trên.',
      );
    }

    const roleCodes = (staff.roleAssignments ?? []).map(
      (item) => item.roleCode,
    );
    const targetRole = this.resolveTargetRole(roleCodes);
    if (!targetRole) {
      throw new BadRequestException(
        'Không xác định được role cấp trên để gửi báo cáo.',
      );
    }

    const dept = await this.departmentModel.findById(staff.departmentId);
    if (!dept) {
      throw new BadRequestException('Đơn vị công tác không tồn tại.');
    }

    // Manager/UnitAdmin có scope bao phủ đơn vị staff hoặc tổ tiên
    const coveringIds = [
      staff.departmentId,
      ...(dept.ancestors ?? []),
    ].map((id) => new Types.ObjectId(String(id)));

    const filter: Record<string, unknown> = {
      isActive: true,
      _id: { $ne: staff._id },
      roleAssignments: {
        $elemMatch: {
          roleCode: targetRole,
          $or: [
            { scopeDepartmentId: null },
            { scopeDepartmentId: { $in: coveringIds } },
          ],
        },
      },
    };

    if (q?.trim()) {
      const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ fullName: regex }, { username: regex }];
    }

    const recipients = await this.userModel
      .find(filter)
      .select('fullName username departmentId roleAssignments')
      .populate('departmentId', 'code name')
      .sort({ fullName: 1, username: 1 })
      .lean();

    const people = recipients.map((user) => {
      const userDept =
        user.departmentId && typeof user.departmentId === 'object'
          ? (user.departmentId as {
              _id?: Types.ObjectId;
              code?: string;
              name?: string;
            })
          : null;
      return {
        id: String(user._id),
        fullName: user.fullName?.trim() || user.username,
        username: user.username,
        departmentId: userDept?._id
          ? String(userDept._id)
          : user.departmentId
            ? String(user.departmentId)
            : null,
        departmentCode: userDept?.code ?? '',
        departmentName: userDept?.name ?? 'Chưa gắn đơn vị',
        roleCode: targetRole,
      };
    });

    return {
      targetRole,
      targetRoleLabel: ROLE_LABEL[targetRole],
      people,
    };
  }

  private async requireValidSendTarget(
    ownerId: string,
    dto: SendPersonalKpiDto,
  ) {
    const recipientId = dto.recipientId?.trim() || '';
    if (!recipientId) {
      throw new BadRequestException('Vui lòng chọn người nhận.');
    }
    if (!Types.ObjectId.isValid(recipientId)) {
      throw new BadRequestException('Người nhận không hợp lệ.');
    }

    const allowed = await this.findRecipientsOneLevelUp(ownerId);
    const person = allowed.people.find((item) => item.id === recipientId);
    if (!person) {
      throw new BadRequestException(
        `Người nhận không hợp lệ hoặc không phải ${allowed.targetRoleLabel} trong phạm vi của bạn.`,
      );
    }

    const recipient = await this.userModel.findById(recipientId);
    if (!recipient || !recipient.isActive) {
      throw new BadRequestException(
        'Người nhận không tồn tại hoặc đã khoá.',
      );
    }

    return {
      recipientId: recipient._id as Types.ObjectId,
      recipientDepartmentId: recipient.departmentId
        ? new Types.ObjectId(String(recipient.departmentId))
        : null,
      recipientName: recipient.fullName?.trim() || recipient.username,
    };
  }

  private resolveReportDate(value?: string) {
    if (!value?.trim()) return serverDateYmd();
    const date = value.trim();
    if (!isYmd(date)) {
      throw new BadRequestException('Ngày báo cáo phải là YYYY-MM-DD.');
    }
    return date;
  }

  private mapCreateFields(
    dto: CreatePersonalKpiDto,
    ownerId: Types.ObjectId,
    axisId: Types.ObjectId,
    workContentId: Types.ObjectId,
    reportDate: string,
  ) {
    return {
      ownerId,
      reportDate,
      status: 'DRAFT' as const,
      axisId,
      workContentId,
      title: dto.title.trim(),
      deadline: dto.deadline?.trim() ?? '',
      product: dto.product?.trim() ?? '',
      standardScore: dto.standardScore,
      executingUnit: dto.executingUnit?.trim() ?? '',
      progressPercent: dto.progressPercent ?? null,
      progressSelfScore: dto.progressSelfScore ?? null,
      qualityPercent: dto.qualityPercent ?? null,
      qualitySelfScore: dto.qualitySelfScore ?? null,
      note: dto.note?.trim() ?? '',
      evidenceFiles: dto.evidenceFiles ?? [],
      sentAt: null,
      rejectReason: '',
    };
  }

  private assertEditable(item: PersonalKpiItemDocument) {
    if (!EDITABLE.includes(item.status)) {
      throw new ForbiddenException(
        item.status === 'SENT'
          ? 'Đã gửi - không sửa/xoá trực tiếp.'
          : 'Nhiệm vụ đã hoàn thành - không sửa/xoá được.',
      );
    }
  }

  private reportDateOrFilter(reportDate: string) {
    return [
      { reportDate },
      {
        reportDate: { $exists: false },
        $expr: {
          $eq: [
            {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt',
                timezone: KPI_TIMEZONE,
              },
            },
            reportDate,
          ],
        },
      },
    ];
  }

  private resolveItemReportDate(item: PersonalKpiItemDocument) {
    if (item.reportDate && isYmd(item.reportDate)) return item.reportDate;
    return serverDateYmd(item.createdAt ?? new Date());
  }

  /**
   * Khi báo cáo còn nhiệm vụ Trả lại: chỉ sửa/gửi lại đúng nhiệm vụ Trả lại.
   */
  private async assertResubmittableInReport(item: PersonalKpiItemDocument) {
    this.assertEditable(item);
    if (item.status === 'REJECTED') return;

    const reportDate = this.resolveItemReportDate(item);
    const hasRejected = await this.itemModel.exists({
      ownerId: item.ownerId,
      status: 'REJECTED',
      $or: this.reportDateOrFilter(reportDate),
    });
    if (hasRejected) {
      throw new BadRequestException(
        'Báo cáo còn nhiệm vụ Trả lại - chỉ được sửa/gửi lại đúng nhiệm vụ đã trả lại.',
      );
    }
  }

  private async findInboxSentItems(
    recipientId: string,
    ownerId: string,
    reportDate: string,
  ) {
    if (!isYmd(reportDate)) {
      throw new BadRequestException('reportDate phải là YYYY-MM-DD.');
    }
    const recipient = this.requireObjectId(recipientId, 'Người nhận');
    const owner = this.requireObjectId(ownerId, 'Người gửi');
    return this.itemModel.find({
      recipientId: recipient,
      ownerId: owner,
      status: 'SENT',
      $or: [
        { reportDate },
        {
          reportDate: { $exists: false },
          $expr: {
            $eq: [
              {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                  timezone: KPI_TIMEZONE,
                },
              },
              reportDate,
            ],
          },
        },
      ],
    });
  }

  private async requireReceived(
    recipientId: string,
    id: string,
    withPopulate = false,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    }
    const recipient = this.requireObjectId(recipientId, 'Người nhận');
    const query = this.itemModel.findOne({
      _id: id,
      recipientId: recipient,
      status: { $ne: 'DRAFT' },
    });
    if (withPopulate) {
      query
        .populate('ownerId', 'fullName username departmentId')
        .populate('axisId', 'code name description')
        .populate('workContentId', 'code name description');
    }
    const item = await query;
    if (!item) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ gửi đến bạn.');
    }
    return item;
  }

  private async requireOwned(
    ownerId: string,
    id: string,
    withPopulate = false,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    }
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const query = this.itemModel.findOne({ _id: id, ownerId: owner });
    if (withPopulate) {
      query
        .populate('axisId', 'code name description')
        .populate('workContentId', 'code name description');
    }
    const item = await query;
    if (!item) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    }
    return item;
  }

  private async requireAxisAndContent(axisId: string, workContentId: string) {
    if (!Types.ObjectId.isValid(axisId)) {
      throw new BadRequestException('Trục không hợp lệ.');
    }
    if (!Types.ObjectId.isValid(workContentId)) {
      throw new BadRequestException('Nội dung công việc không hợp lệ.');
    }
    const [axis, workContent] = await Promise.all([
      this.axisModel.findById(axisId),
      this.workContentModel.findById(workContentId),
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
