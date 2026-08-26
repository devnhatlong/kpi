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
import { Axis, AxisDocument } from '@/modules/kpi-form-config/schemas/axis.schema';
import {
  Criterion,
  CriterionDocument,
} from '@/modules/kpi-form-config/schemas/criterion.schema';
import {
  FormTemplate,
  FormTemplateDocument,
} from '@/modules/kpi-form-config/schemas/form-template.schema';
import { PersonalKpiService } from '@/modules/personal-kpi/personal-kpi.service';
import { isYmd } from '@/modules/personal-kpi/personal-kpi.time';
import {
  PersonalKpiItem,
  PersonalKpiItemDocument,
} from '@/modules/personal-kpi/schemas/personal-kpi-item.schema';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  ChangeSummaryItemsDto,
  CreateSummaryManualItemDto,
  CreateSummaryReportDto,
  SaveSummaryCriteriaDto,
  SendSummaryReportDto,
  SummaryCandidatesQueryDto,
  SummaryReportListQueryDto,
  UpdateSummaryReportDto,
} from './dto/kpi-summary-report.dto';
import {
  KpiSummaryLogType,
  KpiSummaryReport,
  KpiSummaryReportDocument,
  KpiSummaryReportStatus,
} from './schemas/kpi-summary-report.schema';

/** Trần số dòng của kho nhiệm vụ, khớp bảng tổng để hai màn hình cùng nhịp. */
const CANDIDATES_MAX_ROWS = 2000;

/** Một báo cáo tổng hợp ôm quá số này thì file xuất ra cũng không ai đọc nổi. */
const MAX_ITEMS_PER_REPORT = 2000;

/** Nhật ký giữ lại bấy nhiêu mục gần nhất - đủ tra, không phình vô hạn. */
const MAX_LOGS = 200;

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
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
    @InjectModel(Criterion.name)
    private readonly criterionModel: Model<CriterionDocument>,
    @InjectModel(FormTemplate.name)
    private readonly formTemplateModel: Model<FormTemplateDocument>,
    private readonly personalKpiService: PersonalKpiService,
  ) {}

  // ==================================================== kho nhiệm vụ để nhặt

  /**
   * Nhiệm vụ đã hoàn thành mà tôi được phép đưa vào báo cáo, gom theo trục.
   * Không phân trang: báo cáo tổng hợp phải nhìn được cả kỳ một lượt mới tích
   * chọn có nghĩa, nên chặn bằng trần dòng và báo `truncated` thay vì cắt trang.
   */
  async candidates(userId: string, query: SummaryCandidatesQueryDto) {
    const actor = await this.resolveScope(userId);
    const filter = await this.buildCandidateFilter(actor, query);

    const rows = await this.itemModel
      .find(filter)
      .sort({ reportDate: -1, axisId: 1, workContentId: 1, createdAt: 1 })
      .limit(CANDIDATES_MAX_ROWS)
      .populate('axisId', 'code name description sortOrder maxScore')
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

  // ========================================================= báo cáo tổng hợp

  async create(userId: string, dto: CreateSummaryReportDto) {
    const actor = await this.resolveScope(userId);
    const title = this.requireTitle(dto.title);
    const { fromDate, toDate } = this.requirePeriod(dto.fromDate, dto.toDate);
    const scope = await this.resolveReportScope(actor, dto.scopeDepartmentId);
    const itemIds = await this.requireEligibleItems(actor, dto.itemIds ?? [], {
      allowEmpty: true,
    });

    const report = await this.reportModel.create({
      title,
      fromDate,
      toDate,
      note: dto.note?.trim() ?? '',
      ownerId: actor.id,
      ownerName: actor.name,
      ownerDepartmentId: actor.departmentId,
      scopeDepartmentId: scope.id,
      scopeName: scope.name,
      itemIds,
      itemCount: itemIds.length,
      manualItems: [],
      logs: [
        {
          type: 'CREATE' as const,
          message: itemIds.length
            ? `Khởi tạo báo cáo tổng hợp với ${itemIds.length} nhiệm vụ`
            : 'Khởi tạo báo cáo tổng hợp',
          byId: actor.id,
          byName: actor.name,
          at: new Date(),
        },
      ],
      status: 'DRAFT' as const,
    });

    return {
      message: `Đã tạo báo cáo tổng hợp với ${itemIds.length} nhiệm vụ.`,
      data: this.toReportSummary(report),
    };
  }

  async findAll(userId: string, query: SummaryReportListQueryDto) {
    const actor = await this.resolveScope(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 10);

    /*
      Hai ngăn tách bạch: báo cáo TÔI lập, và báo cáo CẤP DƯỚI TRÌNH LÊN tôi.
      Trộn chung một danh sách thì người dùng không biết bản nào mình phải soạn
      tiếp, bản nào đang chờ mình quyết.
    */
    const filter: Record<string, unknown> =
      query.scope === 'incoming'
        ? {
            // Bản ghi cũ chưa có holderIds thì vẫn tra theo người nhận.
            $or: [{ holderIds: actor.id }, { sentToId: actor.id }],
            ownerId: { $ne: actor.id },
          }
        : { ownerId: actor.id };
    if (query.status) filter.status = this.statusFilter(query.status);
    if (query.q?.trim()) {
      const escaped = query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'i');
      // Tìm cả theo phạm vi: người lập nhớ "báo cáo của Phòng Tham mưu" nhiều
      // hơn là nhớ đúng tên đã đặt.
      filter.$or = [{ title: pattern }, { scopeName: pattern }];
    }

    const [data, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .select('-itemIds -logs')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.reportModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(
      data.map((report) => this.toReportSummary(report)),
      total,
      page,
      limit,
    );
  }

  /** Đếm cho dòng "N báo cáo · M đã gửi" và cho huy hiệu hộp thư đến. */
  async stats(userId: string) {
    const actor = await this.resolveScope(userId);
    const [total, draft, incoming, incomingPending] = await Promise.all([
      this.reportModel.countDocuments({ ownerId: actor.id }),
      this.reportModel.countDocuments({ ownerId: actor.id, status: 'DRAFT' }),
      this.reportModel.countDocuments({
        $or: [{ holderIds: actor.id }, { sentToId: actor.id }],
        ownerId: { $ne: actor.id },
      }),
      // Chỉ bản đang chờ mình quyết mới đáng gắn số lên menu.
      this.reportModel.countDocuments({
        sentToId: actor.id,
        status: 'SENT',
      }),
    ]);

    return {
      message: 'OK',
      data: {
        total,
        draft,
        sent: total - draft,
        incoming,
        incomingPending,
      },
    };
  }

  /** Chi tiết: thông tin báo cáo + các nhiệm vụ đã gom theo trục. */
  async findOne(userId: string, id: string) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireVisible(actor, id);

    const rows = await this.itemModel
      .find({ _id: { $in: report.itemIds } })
      .sort({ reportDate: -1, axisId: 1, workContentId: 1, createdAt: 1 })
      .populate('axisId', 'code name description sortOrder maxScore')
      .populate('workContentId', 'code name description sortOrder')
      .populate('ownerId', 'fullName username')
      .populate('ownerDepartmentId', 'code name')
      .populate('lastSenderId', 'fullName username')
      .populate('lastSenderDepartmentId', 'code name');

    const axes = await this.personalKpiService.groupRowsByAxis(rows);

    // Nhiệm vụ bị xoá khỏi hệ thống sau khi đã đưa vào báo cáo thì đếm hụt -
    // nói thẳng ra thay vì âm thầm hiển thị ít hơn con số đã lưu.
    const missingCount = report.itemIds.length - rows.length;

    /*
      Điểm khối A của từng cán bộ, lấy bản mới nhất ĐÃ GỬI trong kỳ. Trả kèm
      chứ không trộn thẳng vào `criteriaScores`: chỉ huy phải phân biệt được
      đâu là số mang lên từ báo cáo cá nhân và đâu là số mình đã sửa đè ở đây.

      Ô nào chỉ huy đã chấm lại lúc duyệt bảng (`reviewValues`) thì lấy số đó,
      còn lại mới lấy số cán bộ tự chấm - nếu không thì người duyệt phải chấm
      hai lần cùng một bảng, một lần ở báo cáo cá nhân, một lần ở đây.
    */
    const ownerIds = [
      ...new Set(rows.map((row) => String(row.ownerId?._id ?? row.ownerId))),
    ]
      .filter((value) => Types.ObjectId.isValid(value))
      .map((value) => new Types.ObjectId(value));
    const selfSheets = await this.personalKpiService.latestCriteriaSheets(
      ownerIds,
      report.fromDate,
      report.toDate,
    );
    const selfCriteriaScores = [...selfSheets].flatMap(([ownerId, sheetRows]) =>
      sheetRows.map((row) => ({
        subjectId: ownerId,
        criterionId: String(row.criterionId),
        criterionName: row.criterionName ?? '',
        maxScore: row.maxScore ?? 0,
        fieldValues: { ...(row.fieldValues ?? {}), ...(row.reviewValues ?? {}) },
        catalogValues: {
          ...(row.catalogValues ?? {}),
          ...(row.reviewCatalogValues ?? {}),
        },
        /** Số cán bộ tự khai, giữ nguyên để đối chiếu với số đã chốt ở trên. */
        selfFieldValues: row.fieldValues ?? {},
        selfCatalogValues: row.catalogValues ?? {},
        scoredByReviewer: Object.keys(row.reviewValues ?? {}).length > 0,
      })),
    );

    return {
      message: 'OK',
      data: {
        report: this.toReportSummary(report),
        axes,
        rowCount: rows.length,
        missingCount,
        selfCriteriaScores,
      },
    };
  }

  async update(userId: string, id: string, dto: UpdateSummaryReportDto) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireEditable(actor, id);
    const changes: string[] = [];

    if (dto.title !== undefined) {
      const title = this.requireTitle(dto.title);
      if (title !== report.title) changes.push(`tên báo cáo → "${title}"`);
      report.title = title;
    }
    if (dto.note !== undefined) report.note = dto.note.trim();
    if (dto.scopeDepartmentId !== undefined) {
      const scope = await this.resolveReportScope(actor, dto.scopeDepartmentId);
      if (scope.name !== report.scopeName) {
        changes.push(`phạm vi → ${scope.name || 'không đặt'}`);
      }
      report.scopeDepartmentId = scope.id;
      report.scopeName = scope.name;
    }
    if (dto.fromDate !== undefined || dto.toDate !== undefined) {
      const { fromDate, toDate } = this.requirePeriod(
        dto.fromDate ?? report.fromDate,
        dto.toDate ?? report.toDate,
      );
      if (fromDate !== report.fromDate || toDate !== report.toDate) {
        changes.push('kỳ báo cáo');
      }
      report.fromDate = fromDate;
      report.toDate = toDate;
    }
    if (dto.itemIds !== undefined) {
      const itemIds = await this.requireEligibleItems(actor, dto.itemIds, {
        allowEmpty: true,
      });
      report.itemIds = itemIds;
      report.itemCount = itemIds.length;
      changes.push(`danh sách nhiệm vụ (${itemIds.length})`);
    }

    if (changes.length) {
      this.pushLog(report, actor, 'UPDATE', `Sửa ${changes.join(', ')}`);
    }
    await report.save();
    return { message: 'Đã lưu báo cáo tổng hợp.', data: this.toReportSummary(report) };
  }

  /** Nhặt thêm nhiệm vụ vào báo cáo đang soạn, bỏ qua dòng đã có sẵn. */
  async addItems(userId: string, id: string, dto: ChangeSummaryItemsDto) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireEditable(actor, id);

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
    this.pushLog(
      report,
      actor,
      'ADD_ITEMS',
      `Đưa ${added.length} nhiệm vụ đã hoàn thành vào báo cáo`,
    );
    await report.save();

    return {
      message: `Đã thêm ${added.length} nhiệm vụ vào "${report.title}".`,
      data: { added: added.length, itemCount: report.itemCount },
    };
  }

  async removeItems(userId: string, id: string, dto: ChangeSummaryItemsDto) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireEditable(actor, id);

    const drop = new Set(dto.itemIds.map((item) => String(item)));
    const next = report.itemIds.filter((item) => !drop.has(String(item)));
    const removed = report.itemIds.length - next.length;
    if (!removed) {
      throw new BadRequestException(
        'Không có nhiệm vụ nào trong báo cáo để bỏ.',
      );
    }

    report.itemIds = next;
    report.itemCount = next.length;
    this.pushLog(
      report,
      actor,
      'REMOVE_ITEMS',
      `Bỏ ${removed} nhiệm vụ khỏi báo cáo`,
    );
    await report.save();

    return {
      message: `Đã bỏ ${removed} nhiệm vụ khỏi báo cáo.`,
      data: { removed, itemCount: report.itemCount },
    };
  }

  // ======================================================= nhiệm vụ tự nhập

  /**
   * Việc không đi qua KPI cá nhân vẫn phải có mặt trong báo cáo tổng hợp.
   * Chép thẳng nội dung vào báo cáo: không có bản ghi gốc nào để trỏ tới, nên
   * cũng không có gì để đồng bộ về sau.
   */
  async addManualItem(
    userId: string,
    id: string,
    dto: CreateSummaryManualItemDto,
  ) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireEditable(actor, id);

    const title = dto.title?.trim() ?? '';
    if (!title) throw new BadRequestException('Tên nhiệm vụ là bắt buộc.');

    let axisId: Types.ObjectId | null = null;
    let axisName = '';
    if (dto.axisId) {
      const axis = await this.axisModel
        .findById(this.requireObjectId(dto.axisId, 'Trục'))
        .select('name code');
      if (!axis) throw new BadRequestException('Trục không tồn tại.');
      axisId = axis._id as Types.ObjectId;
      axisName = axis.name?.trim() || axis.code;
    }

    this.assertItemLimit(report.itemCount + report.manualItems.length + 1);
    report.manualItems.push({
      title,
      note: dto.note?.trim() ?? '',
      axisId,
      axisName,
      ownerName: dto.ownerName?.trim() ?? '',
      departmentName: dto.departmentName?.trim() ?? '',
      score: dto.score ?? null,
      createdAt: new Date(),
    });
    this.pushLog(report, actor, 'ADD_MANUAL', `Thêm nhiệm vụ tự nhập "${title}"`);
    await report.save();

    return {
      message: 'Đã thêm nhiệm vụ tự nhập.',
      data: this.toReportSummary(report),
    };
  }

  /**
   * Sửa một dòng tự nhập ngay trong báo cáo.
   *
   * Dòng này không có bản ghi KPI nào đứng sau nên sửa ở đây là sửa đúng nguồn
   * - không đụng gì tới nhiệm vụ của cán bộ.
   */
  async updateManualItem(
    userId: string,
    id: string,
    manualId: string,
    dto: CreateSummaryManualItemDto,
  ) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireEditable(actor, id);

    const target = this.requireObjectId(manualId, 'Nhiệm vụ tự nhập');
    const current = report.manualItems.find(
      (item) =>
        String((item as { _id?: Types.ObjectId })._id) === String(target),
    );
    if (!current) {
      throw new BadRequestException('Không tìm thấy nhiệm vụ tự nhập này.');
    }

    const title = dto.title?.trim() ?? '';
    if (!title) throw new BadRequestException('Tên nhiệm vụ là bắt buộc.');

    let axisId: Types.ObjectId | null = null;
    let axisName = '';
    if (dto.axisId) {
      const axis = await this.axisModel
        .findById(this.requireObjectId(dto.axisId, 'Trục'))
        .select('name code');
      if (!axis) throw new BadRequestException('Trục không tồn tại.');
      axisId = axis._id as Types.ObjectId;
      axisName = axis.name?.trim() || axis.code;
    }

    current.title = title;
    current.note = dto.note?.trim() ?? '';
    current.axisId = axisId;
    current.axisName = axisName;
    current.ownerName = dto.ownerName?.trim() ?? '';
    current.departmentName = dto.departmentName?.trim() ?? '';
    current.score = dto.score ?? null;
    report.markModified('manualItems');

    this.pushLog(report, actor, 'UPDATE', `Sửa nhiệm vụ tự nhập "${title}"`);
    await report.save();

    return {
      message: 'Đã sửa nhiệm vụ tự nhập.',
      data: this.toReportSummary(report),
    };
  }

  async removeManualItem(userId: string, id: string, manualId: string) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireEditable(actor, id);

    const target = this.requireObjectId(manualId, 'Nhiệm vụ tự nhập');
    const before = report.manualItems.length;
    const removed = report.manualItems.find(
      (item) => String((item as { _id?: Types.ObjectId })._id) === String(target),
    );
    report.manualItems = report.manualItems.filter(
      (item) => String((item as { _id?: Types.ObjectId })._id) !== String(target),
    );
    if (report.manualItems.length === before) {
      throw new BadRequestException('Không tìm thấy nhiệm vụ tự nhập này.');
    }

    this.pushLog(
      report,
      actor,
      'REMOVE_MANUAL',
      `Bỏ nhiệm vụ tự nhập "${removed?.title ?? ''}"`,
    );
    await report.save();

    return {
      message: 'Đã bỏ nhiệm vụ tự nhập.',
      data: this.toReportSummary(report),
    };
  }

  // ======================================================= khối A - tiêu chí

  /**
   * Lưu bảng chấm "A. Danh mục điểm tiêu chí chung" của báo cáo.
   *
   * Ghi đè cả bộ. Tên tiêu chí và điểm tối đa chụp lại từ danh mục TẠI ĐÂY chứ
   * không để client gửi lên: client gửi thì sửa được điểm tối đa của một dòng
   * mà không ai biết, và bản đã trình phải đứng yên kể cả khi danh mục đổi.
   */
  async saveCriteriaScores(
    userId: string,
    id: string,
    dto: SaveSummaryCriteriaDto,
  ) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireEditable(actor, id);

    const criterionIds = [
      ...new Set(dto.scores.map((row) => row.criterionId)),
    ].map((value) => this.requireObjectId(value, 'Tiêu chí'));
    const criteria = await this.criterionModel
      .find({ _id: { $in: criterionIds } })
      .select('name maxScore');
    const byId = new Map(
      criteria.map((row) => [String(row._id), row]),
    );
    if (byId.size !== criterionIds.length) {
      throw new BadRequestException('Có tiêu chí không tồn tại.');
    }

    /*
      Cán bộ được chấm phải có mặt trong báo cáo. Không kiểm thì bảng chấm biến
      thành một cửa sau để ghi điểm cho người ngoài phạm vi báo cáo.
    */
    const ownerIds = new Set(
      (
        await this.itemModel
          .find({ _id: { $in: report.itemIds } })
          .select('ownerId')
      ).map((row) => String(row.ownerId)),
    );

    /*
      Bảng A do mẫu `forCriteria` quyết định có cột gì, nên luật kiểm đọc từ
      mẫu: cột số khai `rangeFromColumnKey` trỏ vào cột Điểm tối đa (tiêu chí)
      thì phải nằm trong 0 - điểm tối đa của CHÍNH dòng đó.
    */
    const template = await this.formTemplateModel.findOne({
      forCriteria: true,
      isActive: true,
    });
    const columns = template?.columns ?? [];
    const known = new Set(columns.map((column) => column.key));
    const maxScoreKeys = new Set(
      columns
        .filter((column) => column.semanticKey === 'criterion_max_score')
        .map((column) => column.key),
    );
    const cappedKeys = new Map(
      columns
        .filter(
          (column) =>
            column.dataType === 'number' &&
            column.rangeFromColumnKey &&
            maxScoreKeys.has(column.rangeFromColumnKey),
        )
        .map((column) => [column.key, column.title]),
    );

    const seen = new Set<string>();
    const scores = dto.scores.map((row) => {
      const criterion = byId.get(row.criterionId)!;
      const subjectId =
        row.subjectType === 'USER'
          ? this.requireObjectId(row.subjectId ?? '', 'Cán bộ được chấm')
          : null;

      if (row.subjectType === 'USER' && !ownerIds.has(String(subjectId))) {
        throw new BadRequestException(
          'Chỉ chấm được cho cán bộ có nhiệm vụ trong báo cáo này.',
        );
      }

      // Một (đối tượng, tiêu chí) chỉ được một dòng - hai dòng thì cộng điểm
      // hai lần mà nhìn bảng không thấy gì bất thường.
      const key = `${row.subjectType}:${String(subjectId)}:${row.criterionId}`;
      if (seen.has(key)) {
        throw new BadRequestException(
          `Tiêu chí "${criterion.name}" bị chấm hai lần cho cùng một đối tượng.`,
        );
      }
      seen.add(key);

      const max = criterion.maxScore ?? 0;
      const fieldValues: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(row.fieldValues ?? {})) {
        if (!known.has(key)) continue;
        if (cappedKeys.has(key)) {
          const numeric = Number(value);
          if (value !== '' && value !== null && Number.isFinite(numeric)) {
            if (numeric < 0 || numeric > max) {
              throw new BadRequestException(
                `"${criterion.name}" · ${cappedKeys.get(key)}: điểm phải nằm trong khoảng 0 - ${max}.`,
              );
            }
          }
        }
        fieldValues[key] = value as string | number | boolean;
      }

      const catalogValues: Record<string, { id: string; name: string }> = {};
      for (const [key, value] of Object.entries(row.catalogValues ?? {})) {
        if (!known.has(key) || !value?.id) continue;
        catalogValues[key] = { id: String(value.id), name: String(value.name) };
      }

      return {
        subjectType: row.subjectType,
        subjectId,
        subjectName: '',
        criterionId: criterion._id as Types.ObjectId,
        criterionName: criterion.name,
        maxScore: max,
        fieldValues,
        catalogValues,
      };
    });

    // Tên cán bộ chép sẵn để đọc lại báo cáo không phải populate thêm lượt nào.
    const userIds = scores
      .filter((row) => row.subjectType === 'USER' && row.subjectId)
      .map((row) => row.subjectId as Types.ObjectId);
    if (userIds.length) {
      const users = await this.userModel
        .find({ _id: { $in: userIds } })
        .select('fullName username');
      const nameById = new Map(
        users.map((row) => [String(row._id), row.fullName ?? row.username]),
      );
      for (const row of scores) {
        if (row.subjectType === 'USER' && row.subjectId) {
          row.subjectName = nameById.get(String(row.subjectId)) ?? '';
        }
      }
    }
    for (const row of scores) {
      if (row.subjectType === 'DEPARTMENT') row.subjectName = report.scopeName;
    }

    report.criteriaScores = scores;
    this.pushLog(report, actor, 'UPDATE', 'Chấm lại bảng tiêu chí chung');
    await report.save();

    return {
      message: 'Đã lưu bảng tiêu chí chung.',
      data: this.toReportSummary(report),
    };
  }

  // ============================================================ trình cấp trên

  /**
   * Trình báo cáo lên cấp trên - MỘT BẢN CHỈ ĐI LÊN MỘT CẤP.
   *
   * Chỉ người lập trình bản của mình: bản đang soạn, hoặc bản vừa bị trả lại đã
   * sửa xong. Cấp trên duyệt là hết đời bản đó - muốn tổng hợp tiếp lên cấp cao
   * hơn thì lập báo cáo của cấp mình rồi nhặt nhiệm vụ trong nhánh, chứ không
   * đẩy tiếp bản của cấp dưới: mỗi cấp có cách gom và cách diễn giải của mình.
   *
   * Người nhận đi qua đúng luật của báo cáo ngày (cấp trên trong nhánh đơn vị),
   * để cả hệ thống chỉ có một định nghĩa "cấp trên của tôi".
   */
  async send(userId: string, id: string, dto: SendSummaryReportDto) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireVisible(actor, id);
    const status = this.readStatus(report);
    const mine = String(report.ownerId) === String(actor.id);

    const sendable =
      mine && (status === 'DRAFT' || status === 'RETURNED');

    if (!sendable) {
      throw new BadRequestException(
        status === 'SENT'
          ? 'Báo cáo đang chờ cấp trên quyết - chưa trình tiếp được.'
          : status === 'APPROVED'
            ? 'Báo cáo đã được duyệt. Muốn báo cáo lên cấp trên nữa thì lập bản tổng hợp của cấp mình.'
            : 'Báo cáo không nằm ở chỗ bạn.',
      );
    }

    if (!report.itemIds.length && !report.manualItems.length) {
      throw new BadRequestException(
        'Báo cáo chưa có nhiệm vụ nào - chọn nhiệm vụ trước khi trình cấp trên.',
      );
    }

    const recipient = await this.personalKpiService.resolveRecipientUp(
      userId,
      dto.recipientId,
    );

    report.status = 'SENT';
    report.sentToId = recipient.id;
    report.sentToName = recipient.name;
    report.sentById = actor.id;
    report.sentByName = actor.name;
    report.sentNote = dto.note?.trim() ?? '';
    report.sentAt = new Date();
    // Trình lại sau khi sửa thì lý do trả lại cũ hết hiệu lực.
    report.returnReason = '';
    if (!report.holderIds.some((holder) => holder.equals(recipient.id))) {
      report.holderIds.push(recipient.id);
    }
    this.pushLog(
      report,
      actor,
      'SEND',
      `Trình ${recipient.name}${
        report.sentNote ? ` - ${report.sentNote}` : ''
      }`,
    );
    await report.save();

    return {
      message: `Đã trình báo cáo lên ${recipient.name}.`,
      data: this.toReportSummary(report),
    };
  }

  // ===================================================== cấp trên quyết

  /**
   * Cấp trên duyệt bản trình - điểm dừng của chuỗi.
   *
   * Duyệt xong khoá luôn cả hai phía. Muốn tổng hợp tiếp lên cấp cao hơn thì
   * lập báo cáo của cấp mình, không đẩy tiếp bản của cấp dưới.
   */
  async approve(userId: string, id: string, note?: string) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireIncoming(actor, id);
    const now = new Date();

    report.status = 'APPROVED';
    report.returnReason = '';
    report.decidedById = actor.id;
    report.decidedByName = actor.name;
    report.decidedAt = now;
    const comment = note?.trim() ?? '';
    this.pushLog(
      report,
      actor,
      'APPROVE',
      comment ? `Duyệt báo cáo - ${comment}` : 'Duyệt báo cáo',
    );
    await report.save();

    return {
      message: 'Đã duyệt báo cáo tổng hợp.',
      data: this.toReportSummary(report),
    };
  }

  /**
   * Cấp trên trả lại kèm lý do - bắt buộc nêu lý do, giống trả lại nhiệm vụ.
   * Báo cáo về tay người lập ở trạng thái RETURNED để sửa rồi trình lại.
   */
  async returnBack(userId: string, id: string, reason: string) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireIncoming(actor, id);
    const text = reason?.trim() ?? '';
    if (!text) {
      throw new BadRequestException('Lý do trả lại là bắt buộc.');
    }

    const now = new Date();
    report.status = 'RETURNED';
    report.returnReason = text;
    report.decidedById = actor.id;
    report.decidedByName = actor.name;
    report.decidedAt = now;
    /*
      Giữ nguyên `sentToId`: bản đã trả lại vẫn nằm trong hộp thư của cấp trên
      để tra lại mình đã trả cái gì, vì sao. Nó hết quyền sửa / quyết là do
      trạng thái RETURNED, không phải do biến mất khỏi danh sách.
    */
    this.pushLog(report, actor, 'RETURN', `Trả lại - ${text}`);
    await report.save();

    return {
      message: 'Đã trả lại báo cáo cho người lập.',
      data: this.toReportSummary(report),
    };
  }

  /**
   * Xoá báo cáo - chỉ NGƯỜI LẬP, và chỉ khi bản đó chưa đi đâu cả.
   *
   * Không dùng chung `requireEditable` với các thao tác sửa: cấp trên đang giữ
   * bản trình thì được sửa nội dung, nhưng xoá hẳn báo cáo của cấp dưới thì
   * không.
   */
  async remove(userId: string, id: string) {
    const actor = await this.resolveScope(userId);
    const report = await this.requireOwned(actor, id);
    const status = this.readStatus(report);
    if (status !== 'DRAFT' && status !== 'RETURNED') {
      throw new BadRequestException(
        status === 'APPROVED'
          ? 'Báo cáo đã được duyệt - không xoá được.'
          : 'Báo cáo đang ở chỗ cấp trên - không xoá được.',
      );
    }
    await report.deleteOne();
    return { message: 'Đã xoá báo cáo tổng hợp.', data: { id } };
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
   * Phạm vi tổng hợp của báo cáo. Bỏ trống thì lấy đơn vị của người lập - báo
   * cáo nào cũng phải nói được nó tổng hợp cho ai.
   */
  private async resolveReportScope(
    actor: ActorScope,
    scopeDepartmentId?: string,
  ): Promise<{ id: Types.ObjectId | null; name: string }> {
    const wanted = scopeDepartmentId?.trim()
      ? this.requireObjectId(scopeDepartmentId, 'Phạm vi tổng hợp')
      : actor.departmentId;
    if (!wanted) return { id: null, name: '' };

    if (!actor.departmentIds.some((id) => id.equals(wanted))) {
      throw new BadRequestException(
        'Phạm vi tổng hợp phải là đơn vị trong nhánh bạn quản lý.',
      );
    }

    const department = await this.departmentModel
      .findById(wanted)
      .select('name code');
    if (!department) throw new BadRequestException('Đơn vị không tồn tại.');

    return {
      id: department._id as Types.ObjectId,
      name: department.name?.trim() || department.code,
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
  private async requireEligibleItems(
    actor: ActorScope,
    raw: string[],
    options: { allowEmpty?: boolean } = {},
  ) {
    const wanted = new Map<string, Types.ObjectId>();
    for (const value of raw) {
      const id = this.requireObjectId(value, 'Nhiệm vụ');
      wanted.set(String(id), id);
    }
    if (!wanted.size) {
      if (options.allowEmpty) return [];
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
        `Một báo cáo tổng hợp tối đa ${MAX_ITEMS_PER_REPORT} nhiệm vụ - hãy tách theo kỳ hoặc theo đơn vị.`,
      );
    }
  }

  private pushLog(
    report: KpiSummaryReportDocument,
    actor: ActorScope,
    type: KpiSummaryLogType,
    message: string,
  ) {
    report.logs.push({
      type,
      message,
      byId: actor.id,
      byName: actor.name,
      at: new Date(),
    });
    if (report.logs.length > MAX_LOGS) {
      report.logs = report.logs.slice(-MAX_LOGS);
    }
  }

  /**
   * Báo cáo mà tôi được xem: bản tôi lập, hoặc bản cấp dưới đã trình lên tôi.
   * Người ngoài hai vai đó thì coi như không tồn tại.
   */
  private async requireVisible(actor: ActorScope, id: string) {
    const report = await this.reportModel.findOne({
      _id: this.requireObjectId(id, 'Báo cáo'),
      $or: [{ ownerId: actor.id }, { sentToId: actor.id }],
    });
    if (!report) throw new NotFoundException('Không tìm thấy báo cáo tổng hợp.');
    return report;
  }

  private async requireOwned(actor: ActorScope, id: string) {
    const report = await this.reportModel.findOne({
      _id: this.requireObjectId(id, 'Báo cáo'),
      ownerId: actor.id,
    });
    if (!report) throw new NotFoundException('Không tìm thấy báo cáo tổng hợp.');
    return report;
  }

  /**
   * Ai được sửa nội dung báo cáo lúc này.
   *
   * - Người lập: khi báo cáo còn đang soạn hoặc vừa bị trả lại.
   * - Cấp trên đang giữ bản trình: sửa thẳng rồi duyệt, giống hệt cách chỉ huy
   *   sửa nhiệm vụ của cán bộ trước khi chốt - trả đi trả lại chỉ để bỏ một
   *   dòng thừa thì quá tốn thời gian của cả hai bên.
   * - Đã duyệt là khoá, không ai sửa nữa.
   */
  private async requireEditable(actor: ActorScope, id: string) {
    const report = await this.requireVisible(actor, id);
    const status = this.readStatus(report);
    // Bị trả lại thì người chịu trách nhiệm là người vừa trình bản đó.
    const responsible = String(report.sentById ?? report.ownerId);
    const mine =
      status === 'RETURNED'
        ? responsible === String(actor.id)
        : String(report.ownerId) === String(actor.id);
    const holding =
      report.sentToId && String(report.sentToId) === String(actor.id);

    if (mine && (status === 'DRAFT' || status === 'RETURNED')) return report;
    if (holding && status === 'SENT') return report;

    if (status === 'APPROVED') {
      throw new BadRequestException('Báo cáo đã được duyệt - không sửa nữa.');
    }
    throw new BadRequestException(
      mine
        ? 'Báo cáo đang ở chỗ cấp trên - thu hồi trước khi sửa.'
        : 'Báo cáo không nằm ở chỗ bạn.',
    );
  }

  /** Bản trình đang nằm ở chỗ tôi chờ quyết - căn cứ để duyệt / trả lại. */
  private async requireIncoming(actor: ActorScope, id: string) {
    const report = await this.reportModel.findOne({
      _id: this.requireObjectId(id, 'Báo cáo'),
      sentToId: actor.id,
    });
    if (!report) {
      throw new NotFoundException('Không tìm thấy báo cáo nào trình lên bạn.');
    }
    if (this.readStatus(report) !== 'SENT') {
      throw new BadRequestException(
        'Báo cáo này không còn chờ bạn quyết - có thể đã duyệt, đã trả lại hoặc bị thu hồi.',
      );
    }
    return report;
  }

  /**
   * Trạng thái để đối chiếu. Bản ghi cũ còn 'FINALIZED' của thời "chốt báo
   * cáo": coi như đã trình, vì cả hai đều là trạng thái khoá nội dung.
   */
  private readStatus(report: KpiSummaryReportDocument): KpiSummaryReportStatus {
    if (report.status === 'DRAFT') return 'DRAFT';
    if (report.status === 'RETURNED') return 'RETURNED';
    if (report.status === 'APPROVED') return 'APPROVED';
    return 'SENT';
  }

  /** Lọc theo trạng thái có tính tới bản ghi cũ mang 'FINALIZED'. */
  private statusFilter(status: string) {
    if (status === 'SENT') {
      // 'FINALIZED' của bản cũ cũng là "đã trình, đang chờ quyết".
      return { $nin: ['DRAFT', 'RETURNED', 'APPROVED'] };
    }
    return status;
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
      scopeDepartmentId: report.scopeDepartmentId
        ? String(report.scopeDepartmentId)
        : null,
      scopeName: report.scopeName ?? '',
      status: this.readStatus(report),
      itemCount: report.itemCount,
      manualItems: (report.manualItems ?? []).map((item) => ({
        _id: String((item as { _id?: Types.ObjectId })._id ?? ''),
        title: item.title,
        note: item.note ?? '',
        axisId: item.axisId ? String(item.axisId) : null,
        axisName: item.axisName ?? '',
        ownerName: item.ownerName ?? '',
        departmentName: item.departmentName ?? '',
        score: item.score ?? null,
        createdAt: item.createdAt,
      })),
      criteriaScores: (report.criteriaScores ?? []).map((row) => ({
        subjectType: row.subjectType,
        subjectId: row.subjectId ? String(row.subjectId) : null,
        subjectName: row.subjectName ?? '',
        criterionId: String(row.criterionId),
        criterionName: row.criterionName ?? '',
        maxScore: row.maxScore ?? 0,
        fieldValues: row.fieldValues ?? {},
        catalogValues: row.catalogValues ?? {},
      })),
      logs: (report.logs ?? []).map((log) => ({
        type: log.type,
        message: log.message,
        byName: log.byName,
        at: log.at,
      })),
      sentToId: report.sentToId ? String(report.sentToId) : null,
      sentToName: report.sentToName ?? '',
      sentById: report.sentById ? String(report.sentById) : null,
      sentByName: report.sentByName ?? '',
      sentNote: report.sentNote ?? '',
      sentAt: report.sentAt,
      returnReason: report.returnReason ?? '',
      decidedByName: report.decidedByName ?? '',
      decidedAt: report.decidedAt,
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
