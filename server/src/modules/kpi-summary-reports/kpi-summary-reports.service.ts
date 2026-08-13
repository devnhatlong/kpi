import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import { PersonalKpiService } from '@/modules/personal-kpi/personal-kpi.service';
import { isYmd } from '@/modules/personal-kpi/personal-kpi.time';
import {
  PersonalKpiItem,
  PersonalKpiItemDocument,
} from '@/modules/personal-kpi/schemas/personal-kpi-item.schema';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  ChangeSummaryItemsDto,
  CreateSummaryReportDto,
  SummaryCandidatesQueryDto,
  SummaryReportListQueryDto,
  UpdateSummaryReportDto,
} from './dto/kpi-summary-report.dto';
import {
  KpiSummaryReport,
  KpiSummaryReportDocument,
} from './schemas/kpi-summary-report.schema';

/** Trần số dòng của kho nhiệm vụ, khớp bảng tổng để hai màn hình cùng nhịp. */
const CANDIDATES_MAX_ROWS = 2000;

/** Một báo cáo tổng ôm quá số này thì file xuất ra cũng không ai đọc nổi. */
const MAX_ITEMS_PER_REPORT = 2000;

type ActorScope = {
  id: Types.ObjectId;
  name: string;
  departmentId: Types.ObjectId | null;
  /** Đơn vị của tôi + toàn bộ đơn vị con, dùng để chặn lấy việc ngoài nhánh. */
  departmentIds: Types.ObjectId[];
};

@Injectable()
export class KpiSummaryReportsService {
  constructor(
    @InjectModel(KpiSummaryReport.name)
    private readonly reportModel: Model<KpiSummaryReportDocument>,
    @InjectModel(PersonalKpiItem.name)
    private readonly itemModel: Model<PersonalKpiItemDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly personalKpiService: PersonalKpiService,
  ) {}

  // ==================================================== kho nhiệm vụ để nhặt

  /**
   * Nhiệm vụ đã hoàn thành mà tôi được phép đưa vào báo cáo, gom theo trục.
   * Không phân trang: báo cáo tổng phải nhìn được cả kỳ một lượt mới tích chọn
   * có nghĩa, nên chặn bằng trần dòng và báo `truncated` thay vì cắt trang.
   */
  async candidates(userId: string, query: SummaryCandidatesQueryDto) {
    const actor = await this.resolveScope(userId);
    const filter = await this.buildCandidateFilter(actor, query);

    const rows = await this.itemModel
      .find(filter)
      .sort({ reportDate: -1, axisId: 1, workContentId: 1, createdAt: 1 })
      .limit(CANDIDATES_MAX_ROWS)
      .populate('axisId', 'code name description sortOrder')
      .populate('workContentId', 'code name description sortOrder')
      .populate('ownerId', 'fullName username')
      .populate('ownerDepartmentId', 'code name')
      .populate('lastSenderId', 'fullName username')
      .populate('lastSenderDepartmentId', 'code name');

    const axes = await this.personalKpiService.groupRowsByAxis(rows);

    return {
      message: 'OK',
      data: {
        axes,
        rowCount: rows.length,
        truncated: rows.length >= CANDIDATES_MAX_ROWS,
        scope: {
          departmentId: actor.departmentId ? String(actor.departmentId) : null,
          departmentCount: actor.departmentIds.length,
        },
      },
    };
  }

  // ============================================================== báo cáo tổng

  async create(userId: string, dto: CreateSummaryReportDto) {
    const actor = await this.resolveScope(userId);
    const title = this.requireTitle(dto.title);
    const { fromDate, toDate } = this.requirePeriod(dto.fromDate, dto.toDate);
    const itemIds = await this.requireEligibleItems(actor, dto.itemIds);

    const report = await this.reportModel.create({
      title,
      fromDate,
      toDate,
      note: dto.note?.trim() ?? '',
      ownerId: actor.id,
      ownerName: actor.name,
      ownerDepartmentId: actor.departmentId,
      itemIds,
      itemCount: itemIds.length,
      status: 'DRAFT' as const,
    });

    return {
      message: `Đã tạo báo cáo tổng với ${itemIds.length} nhiệm vụ.`,
      data: report,
    };
  }

  async findAll(userId: string, query: SummaryReportListQueryDto) {
    const actor = await this.resolveScope(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 10);

    const filter: Record<string, unknown> = { ownerId: actor.id };
    if (query.status) filter.status = query.status;
    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.title = new RegExp(escaped, 'i');
    }

    const [data, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .select('-itemIds')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.reportModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  /** Chi tiết: thông tin báo cáo + các nhiệm vụ đã gom theo trục. */
  async findOne(userId: string, id: string) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireOwned(actor, id);

    const rows = await this.itemModel
      .find({ _id: { $in: report.itemIds } })
      .sort({ reportDate: -1, axisId: 1, workContentId: 1, createdAt: 1 })
      .populate('axisId', 'code name description sortOrder')
      .populate('workContentId', 'code name description sortOrder')
      .populate('ownerId', 'fullName username')
      .populate('ownerDepartmentId', 'code name')
      .populate('lastSenderId', 'fullName username')
      .populate('lastSenderDepartmentId', 'code name');

    const axes = await this.personalKpiService.groupRowsByAxis(rows);

    // Nhiệm vụ bị xoá khỏi hệ thống sau khi đã đưa vào báo cáo thì đếm hụt -
    // nói thẳng ra thay vì âm thầm hiển thị ít hơn con số đã lưu.
    const missingCount = report.itemIds.length - rows.length;

    return {
      message: 'OK',
      data: {
        report: this.toReportSummary(report),
        axes,
        rowCount: rows.length,
        missingCount,
      },
    };
  }

  async update(userId: string, id: string, dto: UpdateSummaryReportDto) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireDraft(actor, id);

    if (dto.title !== undefined) report.title = this.requireTitle(dto.title);
    if (dto.note !== undefined) report.note = dto.note.trim();
    if (dto.fromDate !== undefined || dto.toDate !== undefined) {
      const { fromDate, toDate } = this.requirePeriod(
        dto.fromDate ?? report.fromDate,
        dto.toDate ?? report.toDate,
      );
      report.fromDate = fromDate;
      report.toDate = toDate;
    }
    if (dto.itemIds !== undefined) {
      const itemIds = await this.requireEligibleItems(actor, dto.itemIds);
      report.itemIds = itemIds;
      report.itemCount = itemIds.length;
    }

    await report.save();
    return { message: 'Đã lưu báo cáo tổng.', data: report };
  }

  /** Nhặt thêm nhiệm vụ vào báo cáo nháp, bỏ qua dòng đã có sẵn. */
  async addItems(userId: string, id: string, dto: ChangeSummaryItemsDto) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireDraft(actor, id);

    const existing = new Set(report.itemIds.map((item) => String(item)));
    const incoming = await this.requireEligibleItems(actor, dto.itemIds);
    const added = incoming.filter((item) => !existing.has(String(item)));

    if (!added.length) {
      return {
        message: 'Các nhiệm vụ này đã có trong báo cáo.',
        data: { added: 0, itemCount: report.itemCount },
      };
    }

    const next = [...report.itemIds, ...added];
    this.assertItemLimit(next.length);
    report.itemIds = next;
    report.itemCount = next.length;
    await report.save();

    return {
      message: `Đã thêm ${added.length} nhiệm vụ vào "${report.title}".`,
      data: { added: added.length, itemCount: report.itemCount },
    };
  }

  async removeItems(userId: string, id: string, dto: ChangeSummaryItemsDto) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireDraft(actor, id);

    const drop = new Set(dto.itemIds.map((item) => String(item)));
    const next = report.itemIds.filter((item) => !drop.has(String(item)));
    const removed = report.itemIds.length - next.length;
    if (!removed) {
      throw new BadRequestException('Không có nhiệm vụ nào trong báo cáo để bỏ.');
    }

    report.itemIds = next;
    report.itemCount = next.length;
    await report.save();

    return {
      message: `Đã bỏ ${removed} nhiệm vụ khỏi báo cáo.`,
      data: { removed, itemCount: report.itemCount },
    };
  }

  /** Chốt báo cáo: khoá danh sách nhiệm vụ, từ đây chỉ xem và xuất file. */
  async finalize(userId: string, id: string) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireDraft(actor, id);

    if (!report.itemIds.length) {
      throw new BadRequestException(
        'Báo cáo chưa có nhiệm vụ nào - chọn nhiệm vụ trước khi chốt.',
      );
    }

    report.status = 'FINALIZED';
    report.finalizedById = actor.id;
    report.finalizedAt = new Date();
    await report.save();

    return { message: 'Đã chốt báo cáo tổng.', data: report };
  }

  /** Mở lại báo cáo đã chốt để sửa tiếp - chỉ người lập mới mở được. */
  async reopen(userId: string, id: string) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireOwned(actor, id);

    if (report.status !== 'FINALIZED') {
      throw new BadRequestException('Báo cáo đang ở trạng thái nháp.');
    }

    report.status = 'DRAFT';
    report.finalizedById = null;
    report.finalizedAt = null;
    await report.save();

    return { message: 'Đã mở lại báo cáo để sửa.', data: report };
  }

  async remove(userId: string, id: string) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireDraft(actor, id);
    await report.deleteOne();
    return { message: 'Đã xoá báo cáo tổng.', data: { id } };
  }

  // ================================================================== nội bộ

  /**
   * Người lập đứng ở đâu và với tới được những đơn vị nào.
   * Nhánh đơn vị lấy qua `ancestors` nên một truy vấn là ra cả cây con, không
   * phải đệ quy theo parentId.
   */
  private async resolveScope(userId: string): Promise<ActorScope> {
    const user = await this.userModel
      .findById(this.requireObjectId(userId, 'Người dùng'))
      .select('fullName username departmentId');
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');

    const departmentId = user.departmentId
      ? new Types.ObjectId(String(user.departmentId))
      : null;

    let departmentIds: Types.ObjectId[] = [];
    if (departmentId) {
      const branch = await this.departmentModel
        .find({ $or: [{ _id: departmentId }, { ancestors: departmentId }] })
        .select('_id');
      departmentIds = branch.map((row) => row._id as Types.ObjectId);
    }

    return {
      id: user._id as Types.ObjectId,
      name: user.fullName?.trim() || user.username,
      departmentId,
      departmentIds,
    };
  }

  /**
   * Điều kiện lọc kho nhiệm vụ.
   * Luôn kèm rào phạm vi: việc của cán bộ trong nhánh đơn vị của tôi, hoặc việc
   * đang nằm ở tay tôi (có trường hợp cấp dưới ngoài nhánh gửi thẳng lên).
   */
  private async buildCandidateFilter(
    actor: ActorScope,
    query: SummaryCandidatesQueryDto,
  ): Promise<Record<string, unknown>> {
    const and: Record<string, unknown>[] = [
      {
        $or: [
          ...(actor.departmentIds.length
            ? [{ ownerDepartmentId: { $in: actor.departmentIds } }]
            : []),
          { currentRecipientId: actor.id },
        ],
      },
    ];

    if (query.fromDate || query.toDate) {
      const range: Record<string, string> = {};
      if (query.fromDate) {
        range.$gte = this.requireYmd(query.fromDate, 'fromDate');
      }
      if (query.toDate) range.$lte = this.requireYmd(query.toDate, 'toDate');
      and.push({ reportDate: range });
    }

    if (query.axisId) {
      and.push({ axisId: this.requireObjectId(query.axisId, 'Trục') });
    }
    if (query.workContentId) {
      and.push({
        workContentId: this.requireObjectId(
          query.workContentId,
          'Nội dung công việc',
        ),
      });
    }
    if (query.departmentId) {
      const dept = this.requireObjectId(query.departmentId, 'Đơn vị');
      if (!actor.departmentIds.some((id) => id.equals(dept))) {
        throw new BadRequestException(
          'Đơn vị không nằm trong nhánh bạn quản lý.',
        );
      }
      and.push({ ownerDepartmentId: dept });
    }
    if (query.ownerId) {
      and.push({ ownerId: this.requireObjectId(query.ownerId, 'Cán bộ') });
    }
    if (query.q?.trim()) {
      and.push(this.personalKpiService.contentMatches(query.q));
    }

    if (query.excludeUsed) {
      const used = await this.usedItemIds(actor, query.reportId);
      if (used.length) and.push({ _id: { $nin: used } });
    }

    return { reviewStatus: 'COMPLETED', $and: and };
  }

  /**
   * Nhiệm vụ đã nằm trong báo cáo khác CỦA TÔI.
   * Chỉ xét báo cáo của chính người lập: báo cáo của người khác không phải việc
   * của màn hình này, mà chặn theo toàn hệ thống thì hai người cùng cấp sẽ khoá
   * chân nhau một cách khó hiểu.
   */
  private async usedItemIds(actor: ActorScope, exceptReportId?: string) {
    const filter: Record<string, unknown> = { ownerId: actor.id };
    if (exceptReportId) {
      filter._id = {
        $ne: this.requireObjectId(exceptReportId, 'Báo cáo'),
      };
    }

    const reports = await this.reportModel.find(filter).select('itemIds');
    const ids = new Map<string, Types.ObjectId>();
    for (const report of reports) {
      for (const item of report.itemIds) {
        ids.set(String(item), item);
      }
    }
    return [...ids.values()];
  }

  /**
   * Lọc danh sách id client gửi lên: bỏ trùng, giữ thứ tự tích, và chỉ nhận
   * nhiệm vụ ĐÃ HOÀN THÀNH nằm trong phạm vi của tôi. Kiểm ở server chứ không
   * tin client, vì gọi thẳng API là nhét được id bất kỳ vào báo cáo.
   */
  private async requireEligibleItems(actor: ActorScope, raw: string[]) {
    const wanted = new Map<string, Types.ObjectId>();
    for (const value of raw) {
      const id = this.requireObjectId(value, 'Nhiệm vụ');
      wanted.set(String(id), id);
    }
    if (!wanted.size) {
      throw new BadRequestException('Chưa chọn nhiệm vụ nào.');
    }
    this.assertItemLimit(wanted.size);

    const scopeFilter = await this.buildCandidateFilter(actor, {});
    const found = await this.itemModel
      .find({ $and: [scopeFilter, { _id: { $in: [...wanted.values()] } }] })
      .select('_id');
    const allowed = new Set(found.map((row) => String(row._id)));

    const rejected = [...wanted.keys()].filter((id) => !allowed.has(id));
    if (rejected.length) {
      throw new BadRequestException(
        `${rejected.length} nhiệm vụ không hợp lệ - chỉ nhận việc đã hoàn thành trong phạm vi đơn vị bạn quản lý.`,
      );
    }

    return [...wanted.values()];
  }

  private assertItemLimit(count: number) {
    if (count > MAX_ITEMS_PER_REPORT) {
      throw new BadRequestException(
        `Một báo cáo tổng tối đa ${MAX_ITEMS_PER_REPORT} nhiệm vụ - hãy tách theo kỳ hoặc theo đơn vị.`,
      );
    }
  }

  private async requireOwned(actor: ActorScope, id: string) {
    const report = await this.reportModel.findOne({
      _id: this.requireObjectId(id, 'Báo cáo'),
      ownerId: actor.id,
    });
    if (!report) throw new NotFoundException('Không tìm thấy báo cáo tổng.');
    return report;
  }

  private async requireDraft(actor: ActorScope, id: string) {
    const report = await this.requireOwned(actor, id);
    if (report.status !== 'DRAFT') {
      throw new BadRequestException(
        'Báo cáo đã chốt - mở lại báo cáo trước khi sửa.',
      );
    }
    return report;
  }

  private toReportSummary(report: KpiSummaryReportDocument) {
    return {
      _id: String(report._id),
      title: report.title,
      fromDate: report.fromDate,
      toDate: report.toDate,
      note: report.note,
      ownerId: String(report.ownerId),
      ownerName: report.ownerName,
      status: report.status,
      itemCount: report.itemCount,
      finalizedAt: report.finalizedAt,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
    };
  }

  private requireTitle(value: string) {
    const title = value?.trim() ?? '';
    if (!title) throw new BadRequestException('Tên báo cáo là bắt buộc.');
    if (title.length > 300) {
      throw new BadRequestException('Tên báo cáo tối đa 300 ký tự.');
    }
    return title;
  }

  /** Kỳ báo cáo để trống được, nhưng khai thì phải đúng dạng và đúng chiều. */
  private requirePeriod(fromDate?: string, toDate?: string) {
    const from = fromDate?.trim()
      ? this.requireYmd(fromDate.trim(), 'Từ ngày')
      : '';
    const to = toDate?.trim() ? this.requireYmd(toDate.trim(), 'Đến ngày') : '';
    if (from && to && from > to) {
      throw new BadRequestException('Từ ngày phải trước hoặc bằng đến ngày.');
    }
    return { fromDate: from, toDate: to };
  }

  private requireYmd(value: string, label: string) {
    if (!isYmd(value)) {
      throw new BadRequestException(`${label} phải là YYYY-MM-DD.`);
    }
    return value;
  }

  private requireObjectId(id: string, label: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException(`${label} không hợp lệ.`);
    }
    return new Types.ObjectId(id);
  }
}
