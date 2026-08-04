import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { Axis, AxisDocument } from '@/modules/kpi-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentDocument,
} from '@/modules/kpi-form-config/schemas/work-content.schema';
import {
  CreatePersonalKpiBatchDto,
  CreatePersonalKpiDto,
  PersonalKpiListQueryDto,
  PersonalKpiReportsQueryDto,
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
} from './personal-kpi.time';

const EDITABLE: PersonalKpiStatus[] = ['DRAFT', 'REJECTED'];

@Injectable()
export class PersonalKpiService {
  constructor(
    @InjectModel(PersonalKpiItem.name)
    private readonly itemModel: Model<PersonalKpiItemDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
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
    this.assertEditable(item);

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

    item.status = 'DRAFT';
    item.rejectReason = '';

    await item.save();
    await item.populate([
      { path: 'axisId', select: 'code name description' },
      { path: 'workContentId', select: 'code name description' },
    ]);

    return { message: 'Đã lưu nháp.', data: item };
  }

  async send(ownerId: string, id: string) {
    const item = await this.requireOwned(ownerId, id);
    this.assertEditable(item);
    if (!item.title.trim()) {
      throw new BadRequestException(
        'Nhiệm vụ chưa có tên — hãy sửa trước khi gửi.',
      );
    }

    item.status = 'SENT';
    item.sentAt = new Date();
    item.rejectReason = '';
    await item.save();
    await item.populate([
      { path: 'axisId', select: 'code name description' },
      { path: 'workContentId', select: 'code name description' },
    ]);

    return { message: 'Đã gửi nhiệm vụ.', data: item };
  }

  async sendReport(ownerId: string, reportDate: string) {
    if (!isYmd(reportDate)) {
      throw new BadRequestException('reportDate phải là YYYY-MM-DD.');
    }
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const filter: Record<string, unknown> = {
      ownerId: owner,
      status: { $in: EDITABLE },
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
    };

    const items = await this.itemModel.find(filter);
    if (items.length === 0) {
      throw new BadRequestException(
        'Không có nhiệm vụ nháp/từ chối nào để gửi trong ngày này.',
      );
    }

    const invalid = items.find((item) => !item.title.trim());
    if (invalid) {
      throw new BadRequestException(
        'Có nhiệm vụ chưa có tên — hãy sửa nháp trước khi gửi báo cáo.',
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
        },
      },
    );

    return {
      message: `Đã gửi ${items.length} nhiệm vụ của báo cáo ngày ${reportDate}.`,
      data: { reportDate, sentCount: items.length },
    };
  }

  async remove(ownerId: string, id: string) {
    const item = await this.requireOwned(ownerId, id);
    this.assertEditable(item);
    await item.deleteOne();
    return { message: 'Đã xoá nhiệm vụ.' };
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
          ? 'Đã gửi — không sửa/xoá trực tiếp.'
          : 'Nhiệm vụ đã hoàn thành — không sửa/xoá được.',
      );
    }
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
