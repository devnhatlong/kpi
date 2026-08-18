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
  computeAutoValue,
  FormTemplate,
  FormTemplateColumn,
  FormTemplateDocument,
} from '@/modules/kpi-form-config/schemas/form-template.schema';
import { FormTemplatesService } from '@/modules/kpi-form-config/form-templates.service';
import { UploadsService } from '@/modules/uploads/uploads.service';
import {
  formatScoreGroupRange,
  isScoreInGroupRange,
} from '@/modules/kpi-form-config/score-group.constants';
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
  PersonalKpiStatisticsQueryDto,
  ReviewPersonalKpiDto,
  ReviewerEditPersonalKpiDto,
  ScorePersonalKpiDto,
  SubmitPersonalKpiDto,
  UpdatePersonalKpiDto,
  UpdatePersonalKpiProgressDto,
  type PersonalKpiStatScope,
} from './dto/personal-kpi.dto';
import {
  computeAxisScore,
  type ScoreCatalogs,
} from './personal-kpi-score.util';
import {
  isProgressComplete,
  readItemPercent,
  resolveScoreColumns,
  resolveTrackingColumns,
  type TrackingTemplate,
} from './personal-kpi-progress.util';
import {
  PersonalKpiAttachment,
  PersonalKpiCatalogValue,
  PersonalKpiItem,
  PersonalKpiItemDocument,
  PersonalKpiLogType,
  PersonalKpiProgressChange,
  PersonalKpiProgressField,
  PersonalKpiReviewStatus,
} from './schemas/personal-kpi-item.schema';
import {
  ScoreGroup,
  ScoreGroupDocument,
} from '@/modules/kpi-form-config/schemas/score-group.schema';
import {
  QualityLevel,
  QualityLevelDocument,
} from '@/modules/kpi-form-config/schemas/quality-level.schema';
import {
  PersonalKpiSubmission,
  PersonalKpiSubmissionDocument,
} from './schemas/personal-kpi-submission.schema';
import { isYmd, serverDateYmd, shiftYmd } from './personal-kpi.time';

/** Cán bộ chỉ sửa/gửi được nhiệm vụ ở hai trạng thái này. */
const OWNER_EDITABLE: PersonalKpiReviewStatus[] = ['DRAFT', 'RETURNED'];

/** Bậc vai trò tăng dần - dùng để biết ai là cấp trên. */
/**
 * Chuỗi báo cáo đi lên. KHÔNG có SUPER_ADMIN - tài khoản đó chỉ để cấu hình,
 * báo cáo nghiệp vụ dừng ở CAT_ADMIN.
 */
const ROLE_LADDER: RoleCode[] = [
  RoleCode.STAFF,
  RoleCode.MANAGER,
  RoleCode.UNIT_ADMIN,
  RoleCode.CAT_ADMIN,
];

/** Nhãn cột để hiển thị trong lịch sử sửa. */
const CONTENT_FIELD_LABELS: Record<string, string> = {
};

const BOARD_MAX_ROWS = 2000;

/**
 * Trang Thống kê phải quét rộng hơn bảng duyệt vì còn xếp hạng theo cán bộ.
 * Chạm ngưỡng thì trả kèm cờ `truncated` để màn hình nói rõ số liệu chưa đủ,
 * thay vì im lặng đưa ra một bảng xếp hạng thiếu người.
 */
const STATS_MAX_ROWS = 20000;

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
    @InjectModel(ScoreGroup.name)
    private readonly scoreGroupModel: Model<ScoreGroupDocument>,
    @InjectModel(QualityLevel.name)
    private readonly qualityLevelModel: Model<QualityLevelDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly formTemplatesService: FormTemplatesService,
    private readonly uploadsService: UploadsService,
  ) {}

  // ============================================================ cán bộ nhập

  async createMany(ownerId: string, batch: CreatePersonalKpiBatchDto) {
    if (!batch.items?.length) {
      throw new BadRequestException('Chưa có nhiệm vụ nào để lưu.');
    }
    const actor = await this.requireActor(ownerId);
    const reportDate = this.resolveReportDate(batch.reportDate);

    const created: Types.ObjectId[] = [];
    const docs: PersonalKpiItemDocument[] = [];
    for (const dto of batch.items) {
      const { axis, workContent } = await this.requireAxisAndContent(
        dto.axisId,
        dto.workContentId,
      );
      const doc = await this.itemModel.create({
        ...(await this.mapContent(dto)),
        ownerId: actor.id,
        ownerDepartmentId: actor.departmentId,
        reportDate,
        axisId: axis._id,
        workContentId: workContent._id,
        reviewStatus: 'DRAFT' as const,
        holderLevel: 0,
      });
      created.push(doc._id as Types.ObjectId);
      docs.push(doc);
    }

    // Nhóm điểm và cột tự tính chốt ở server, kể cả khi client không gửi lên.
    await this.applyDerivedColumns(docs);
    await Promise.all(docs.map((doc) => doc.save()));

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

    await this.applyContent(item, dto);
    await this.applyDerivedColumns([item]);

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
    if (query.q?.trim()) Object.assign(filter, this.contentMatches(query.q));

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
    if (query.q?.trim()) Object.assign(match, this.contentMatches(query.q));

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

  // ============================================================== thống kê

  /**
   * Số liệu cho trang Thống kê. Tất cả đều đếm/cộng từ nhiệm vụ có thật, không
   * có con số dựng sẵn nào.
   *
   * Phạm vi:
   *   mine = nhiệm vụ do tôi tạo;
   *   unit = mọi nhiệm vụ của cây đơn vị tôi đứng đầu, chỉ mở cho người có
   *          quyền duyệt - không thì ai cũng đọc được số của đơn vị khác.
   */
  async statistics(userId: string, query: PersonalKpiStatisticsQueryDto) {
    const actor = await this.requireActor(userId);
    const today = serverDateYmd();
    const toDate = query.toDate
      ? this.requireYmd(query.toDate, 'toDate')
      : today;
    const fromDate = query.fromDate
      ? this.requireYmd(query.fromDate, 'fromDate')
      : shiftYmd(toDate, -29);
    if (fromDate > toDate) {
      throw new BadRequestException('Khoảng ngày không hợp lệ.');
    }

    const scope = await this.resolveStatScope(userId, actor, query.scope);
    const filter: Record<string, unknown> = {
      ...scope.filter,
      reportDate: { $gte: fromDate, $lte: toDate },
    };
    if (query.axisId) filter.axisId = this.requireObjectId(query.axisId, 'Trục');

    const [statusRows, dailyRows, axisRows, departmentRows, contentRows] =
      await Promise.all([
        this.itemModel.aggregate<{ _id: PersonalKpiReviewStatus; total: number }>(
          [
            { $match: filter },
            { $group: { _id: '$reviewStatus', total: { $sum: 1 } } },
          ],
        ),
        this.itemModel.aggregate<{
          _id: string;
          total: number;
          sent: number;
          completed: number;
        }>([
          { $match: filter },
          {
            $group: {
              _id: '$reportDate',
              total: { $sum: 1 },
              sent: {
                $sum: { $cond: [{ $ne: ['$reviewStatus', 'DRAFT'] }, 1, 0] },
              },
              completed: this.countIf('COMPLETED'),
            },
          },
          { $sort: { _id: 1 } },
        ]),
        this.itemModel.aggregate<{ _id: Types.ObjectId; total: number }>([
          { $match: filter },
          { $group: { _id: '$axisId', total: { $sum: 1 } } },
        ]),
        this.itemModel.aggregate<{
          _id: Types.ObjectId | null;
          total: number;
          completed: number;
        }>([
          { $match: filter },
          {
            $group: {
              _id: '$ownerDepartmentId',
              total: { $sum: 1 },
              completed: this.countIf('COMPLETED'),
            },
          },
          { $sort: { total: -1 } },
          { $limit: 12 },
        ]),
        this.itemModel.aggregate<{ _id: Types.ObjectId; total: number }>([
          { $match: filter },
          { $group: { _id: '$workContentId', total: { $sum: 1 } } },
          { $sort: { total: -1 } },
          { $limit: 10 },
        ]),
      ]);

    // Kỳ trước = cùng độ dài, liền kề phía trước - để nói "so với kỳ trước"
    // mà không phải đoán độ dài tháng.
    const rangeDays = this.daysBetween(fromDate, toDate);
    const prevToDate = shiftYmd(fromDate, -1);
    const prevFromDate = shiftYmd(prevToDate, -(rangeDays - 1));
    const prevFilter = {
      ...scope.filter,
      reportDate: { $gte: prevFromDate, $lte: prevToDate },
      ...(query.axisId ? { axisId: filter.axisId } : {}),
    };

    const [breakdown, departments, contents, prevStatusRows, prevStaff, staff] =
      await Promise.all([
        this.scoreBreakdown(filter),
        this.departmentModel
          .find({
            _id: {
              $in: departmentRows
                .map((row) => row._id)
                .filter((id): id is Types.ObjectId => Boolean(id)),
            },
          })
          .select('code name'),
        this.workContentModel
          .find({ _id: { $in: contentRows.map((row) => row._id) } })
          .select('code name'),
        this.itemModel.aggregate<{
          _id: PersonalKpiReviewStatus;
          total: number;
        }>([
          { $match: prevFilter },
          { $group: { _id: '$reviewStatus', total: { $sum: 1 } } },
        ]),
        // Đếm qua aggregate thay vì distinct: distinct đòi kiểu filter chặt,
        // còn filter ở đây dựng động theo phạm vi và bộ lọc.
        this.itemModel.aggregate<{ count: number }>([
          { $match: prevFilter },
          { $group: { _id: '$ownerId' } },
          { $count: 'count' },
        ]),
        this.itemModel.aggregate<{ count: number }>([
          { $match: filter },
          { $group: { _id: '$ownerId' } },
          { $count: 'count' },
        ]),
      ]);

    const statusMap = new Map(statusRows.map((row) => [row._id, row.total]));
    const axisCountMap = new Map(
      axisRows.map((row) => [String(row._id), row.total]),
    );
    const departmentById = new Map(
      departments.map((row) => [String(row._id), row]),
    );
    const contentById = new Map(contents.map((row) => [String(row._id), row]));

    const totalTasks = statusRows.reduce((sum, row) => sum + row.total, 0);

    // Chuỗi ngày liên tục để biểu đồ không bị đứt đoạn ở ngày không có việc.
    const daily: Array<{
      date: string;
      total: number;
      sent: number;
      completed: number;
    }> = [];
    const dailyByDate = new Map(dailyRows.map((row) => [row._id, row]));
    for (let day = fromDate; day <= toDate; day = shiftYmd(day, 1)) {
      const row = dailyByDate.get(day);
      daily.push({
        date: day,
        total: row?.total ?? 0,
        sent: row?.sent ?? 0,
        completed: row?.completed ?? 0,
      });
    }

    const prevStatusMap = new Map(
      prevStatusRows.map((row) => [row._id, row.total]),
    );
    const prevTasks = prevStatusRows.reduce((sum, row) => sum + row.total, 0);

    // Điểm trung bình mỗi đơn vị = trung bình điểm của cán bộ đơn vị đó có việc
    // trong kỳ. Không cộng dồn điểm cả đơn vị: thang xếp loại là thang 100 của
    // một người, cộng lại thì không còn nghĩa gì.
    const scoreByDepartment = new Map<string, { sum: number; people: number }>();
    for (const person of breakdown.leaderboard) {
      const key = person.departmentId ?? '';
      const bucket = scoreByDepartment.get(key) ?? { sum: 0, people: 0 };
      bucket.sum += person.score;
      bucket.people += 1;
      scoreByDepartment.set(key, bucket);
    }

    return {
      message: 'OK',
      data: {
        range: { fromDate, toDate, today, days: rangeDays },
        previousRange: { fromDate: prevFromDate, toDate: prevToDate },
        scope: scope.applied,
        scopeLabel: scope.label,
        canViewUnit: scope.canViewUnit,
        truncated: breakdown.truncated,
        totalMaxScore: breakdown.totalMaxScore,
        totals: {
          tasks: totalTasks,
          draft: statusMap.get('DRAFT') ?? 0,
          pending: statusMap.get('PENDING') ?? 0,
          approved: statusMap.get('APPROVED') ?? 0,
          returned: statusMap.get('RETURNED') ?? 0,
          completed: statusMap.get('COMPLETED') ?? 0,
          reportedDays: dailyRows.filter((row) => row.total > 0).length,
          rangeDays: daily.length,
          staffCount: staff[0]?.count ?? 0,
        },
        /** Cùng chỉ số ở kỳ liền trước - màn hình tự tính phần trăm chênh. */
        previousTotals: {
          tasks: prevTasks,
          pending: prevStatusMap.get('PENDING') ?? 0,
          completed: prevStatusMap.get('COMPLETED') ?? 0,
          returned: prevStatusMap.get('RETURNED') ?? 0,
          staffCount: prevStaff[0]?.count ?? 0,
        },
        daily,
        axes: breakdown.axes.map((axis) => ({
          ...axis,
          taskCount: axisCountMap.get(axis.axisId) ?? axis.taskCount,
        })),
        leaderboard: breakdown.leaderboard.map((person) => ({
          ...person,
          departmentName: person.departmentId
            ? (departmentById.get(person.departmentId)?.name ?? '')
            : '',
        })),
        departments: departmentRows.map((row) => {
          const key = row._id ? String(row._id) : '';
          const dept = row._id ? departmentById.get(key) : null;
          const scored = scoreByDepartment.get(key);
          return {
            departmentId: row._id ? String(row._id) : null,
            code: dept?.code ?? '',
            name: dept?.name ?? 'Chưa gán đơn vị',
            taskCount: row.total,
            completedCount: row.completed,
            staffCount: scored?.people ?? 0,
            /** null = không có ai trong đơn vị tính được điểm. */
            averageScore: scored?.people ? scored.sum / scored.people : null,
          };
        }),
        workContents: contentRows.map((row) => {
          const content = contentById.get(String(row._id));
          return {
            workContentId: String(row._id),
            code: content?.code ?? '',
            name: content?.name ?? '',
            taskCount: row.total,
          };
        }),
      },
    };
  }

  /** Số ngày trong khoảng, tính cả hai đầu. */
  private daysBetween(fromDate: string, toDate: string): number {
    let days = 1;
    for (let day = fromDate; day < toDate; day = shiftYmd(day, 1)) days += 1;
    return days;
  }

  /**
   * Điểm quy đổi trong phạm vi đang xem - tính một lượt rồi cắt theo hai chiều:
   * gộp toàn bộ theo trục, và gộp theo từng cán bộ để xếp hạng.
   *
   * Lấy mẫu đang gán cho trục chứ không theo phiên bản khoá lúc gửi: thống kê
   * là ảnh chụp hiện tại theo cách chấm hiện hành, khác với bảng duyệt phải
   * dựng lại đúng bảng của thời điểm gửi.
   */
  private async scoreBreakdown(filter: Record<string, unknown>) {
    const rows = await this.itemModel
      .find(filter)
      .select('ownerId ownerDepartmentId axisId fieldValues catalogValues')
      .limit(STATS_MAX_ROWS);

    const [allAxes, templates, scoreGroups, qualityLevels] = await Promise.all([
      this.axisModel.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }),
      this.formTemplateModel.find({ isActive: true }),
      this.scoreGroupModel
        .find({ isActive: true })
        .select('code name minScore maxScore maxInclusive formulaScore sortOrder')
        .sort({ sortOrder: 1, minScore: 1 }),
      this.qualityLevelModel.find().select('percent'),
    ]);

    const catalogs: ScoreCatalogs = {
      scoreGroups: new Map(
        scoreGroups.map((group) => [
          String(group._id),
          {
            maxScore: group.maxScore,
            maxInclusive: group.maxInclusive,
            formulaScore: group.formulaScore,
          },
        ]),
      ),
      qualityLevels: new Map(
        qualityLevels.map((level) => [
          String(level._id),
          { percent: level.percent },
        ]),
      ),
    };

    const templateByAxis = new Map<string, FormTemplateDocument>();
    for (const template of templates) {
      for (const axisId of template.axisIds) {
        templateByAxis.set(String(axisId), template);
      }
    }

    /**
     * Mẫu số của thang xếp hạng: tổng trần của MỌI trục đang hoạt động, không
     * phải chỉ những trục cán bộ có việc. Bỏ trắng một trục là mất điểm trục
     * đó, chứ không phải được chấm trên thang nhỏ hơn.
     */
    const totalMaxScore = allAxes.reduce(
      (sum, axis) => sum + (axis.maxScore ?? 0),
      0,
    );

    const scoreOf = (
      bucket: Map<string, PersonalKpiItemDocument[]>,
    ) =>
      allAxes.map((axis) => {
        const axisId = String(axis._id);
        const template = templateByAxis.get(axisId);
        const axisRows = bucket.get(axisId) ?? [];
        const score = computeAxisScore(
          axisRows,
          template?.columns ?? [],
          template?.footer,
          axis.maxScore ?? 0,
          catalogs,
        );
        return {
          axisId,
          axisCode: axis.code,
          axisName: axis.name,
          axisMaxScore: axis.maxScore ?? 0,
          /** null = trục chưa cấu hình công thức hoặc chưa có số liệu để chia. */
          axisScore: score.axisScore,
          convertedScore: score.convertedScore,
          hasFormula: template?.footer?.enabled === true,
          taskCount: axisRows.length,
        };
      });

    const pushInto = <K>(map: Map<K, Map<string, PersonalKpiItemDocument[]>>, key: K, row: PersonalKpiItemDocument) => {
      let byAxis = map.get(key);
      if (!byAxis) {
        byAxis = new Map();
        map.set(key, byAxis);
      }
      const axisKey = String(row.axisId);
      const bucket = byAxis.get(axisKey);
      if (bucket) bucket.push(row);
      else byAxis.set(axisKey, [row]);
    };

    const globalByAxis = new Map<string, PersonalKpiItemDocument[]>();
    const byOwner = new Map<string, Map<string, PersonalKpiItemDocument[]>>();
    const ownerDepartment = new Map<string, string | null>();
    for (const row of rows) {
      const axisKey = String(row.axisId);
      const bucket = globalByAxis.get(axisKey);
      if (bucket) bucket.push(row);
      else globalByAxis.set(axisKey, [row]);

      const ownerKey = String(row.ownerId);
      pushInto(byOwner, ownerKey, row);
      if (!ownerDepartment.has(ownerKey)) {
        ownerDepartment.set(
          ownerKey,
          row.ownerDepartmentId ? String(row.ownerDepartmentId) : null,
        );
      }
    }

    const owners = await this.userModel
      .find({ _id: { $in: [...byOwner.keys()].map((id) => new Types.ObjectId(id)) } })
      .select('fullName username position');
    const ownerById = new Map(owners.map((row) => [String(row._id), row]));

    const leaderboard = [...byOwner.entries()]
      .map(([ownerId, bucket]) => {
        const axes = scoreOf(bucket);
        const score = axes.reduce(
          (sum, axis) => sum + (axis.convertedScore ?? 0),
          0,
        );
        const user = ownerById.get(ownerId);
        const groupIndex = scoreGroups.findIndex((item) =>
          isScoreInGroupRange(
            score,
            item.minScore,
            item.maxScore,
            item.maxInclusive,
          ),
        );
        const group = groupIndex >= 0 ? scoreGroups[groupIndex] : undefined;
        return {
          ownerId,
          fullName: user?.fullName?.trim() || user?.username || 'Không rõ',
          position: user?.position ?? '',
          departmentId: ownerDepartment.get(ownerId) ?? null,
          taskCount: [...bucket.values()].reduce(
            (sum, list) => sum + list.length,
            0,
          ),
          score,
          maxScore: totalMaxScore,
          /** Xếp loại lấy thẳng từ danh mục Nhóm điểm, không đặt ngưỡng riêng. */
          scoreGroupCode: group?.code ?? null,
          scoreGroupName: group?.name ?? null,
          /**
           * Bậc của nhóm trong danh mục (0 = thấp nhất) và tổng số nhóm. Gửi
           * kèm để màn hình tô màu theo bậc thay vì tự đặt ngưỡng phần trăm -
           * đơn vị sửa dải điểm thì màu đi theo, không lệch với nhãn.
           */
          scoreGroupIndex: groupIndex >= 0 ? groupIndex : null,
          scoreGroupCount: scoreGroups.length,
        };
      })
      .sort((a, b) => b.score - a.score);

    return {
      totalMaxScore,
      axes: scoreOf(globalByAxis),
      leaderboard,
      /** Quá ngưỡng thì số liệu chỉ tính trên phần đã nạp - phải nói ra. */
      truncated: rows.length >= STATS_MAX_ROWS,
    };
  }

  /**
   * Phạm vi thống kê thật sự được xem.
   * Xin `unit` mà không có quyền duyệt thì lùi về `mine` chứ không báo lỗi -
   * trang Thống kê ai cũng vào được, chỉ khác nhau ở lượng số liệu.
   */
  private async resolveStatScope(
    userId: string,
    actor: ActorInfo,
    requested: PersonalKpiStatScope | undefined,
  ) {
    const user = await this.userModel
      .findById(this.requireObjectId(userId, 'Người dùng'))
      .select('roleAssignments');
    const roleCodes = (user?.roleAssignments ?? []).map(
      (item) => item.roleCode,
    );
    const canViewUnit =
      actor.departmentId !== null &&
      roleCodes.some((code) =>
        [
          RoleCode.MANAGER,
          RoleCode.UNIT_ADMIN,
          RoleCode.CAT_ADMIN,
          RoleCode.SUPER_ADMIN,
        ].includes(code as RoleCode),
      );

    if (requested === 'unit' && canViewUnit && actor.departmentId) {
      const departmentIds = await this.departmentSubtreeIds(actor.departmentId);
      return {
        applied: 'unit' as const,
        canViewUnit,
        label: 'Đơn vị của tôi và các đơn vị trực thuộc',
        filter: { ownerDepartmentId: { $in: departmentIds } },
      };
    }

    return {
      applied: 'mine' as const,
      canViewUnit,
      label: 'Nhiệm vụ của tôi',
      filter: { ownerId: actor.id },
    };
  }

  /** Đơn vị đang đứng cùng toàn bộ đơn vị con - bám cây qua mảng ancestors. */
  private async departmentSubtreeIds(departmentId: Types.ObjectId) {
    const descendants = await this.departmentModel
      .find({ ancestors: departmentId })
      .select('_id');
    return [departmentId, ...descendants.map((row) => row._id as Types.ObjectId)];
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

    /**
     * Gửi bao nhiêu lượt trong ngày cũng được: việc phát sinh buổi chiều vẫn
     * phải lên tới cấp trên trong ngày, và nhiệm vụ bị trả lại phải sửa rồi
     * gửi lại ngay. Mỗi lượt là một bản ghi riêng nên vẫn tra được ai gửi gì
     * lúc nào.
     */
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
    // Chốt mẫu bảng ở lần gửi đầu tiên để báo cáo không méo khi mẫu bị sửa.
    await this.stampTemplates(items);
    await this.assertWorkContentScoreGroups(items);
    // Tính lại theo đúng mẫu vừa chốt, rồi mới kiểm - nếu không sẽ kiểm trên
    // con số client gửi chứ không phải con số hệ thống sẽ lưu.
    await this.applyDerivedColumns(items);
    await Promise.all(items.map((item) => item.save()));
    await this.assertRequiredColumnsFilled(items);
    await this.assertScoreRangesValid(items);

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

    // Chuyển lên trên CHÍNH LÀ hành động duyệt - nhận cả việc đang chờ duyệt,
    // không bắt bấm "Duyệt" trước rồi mới được gửi. Việc đã chốt hoàn thành thì
    // không nằm trong danh sách này nữa.
    const items = await this.itemModel.find({
      _id: { $in: ids },
      currentRecipientId: actor.id,
      holderLevel: { $gte: 1 },
      reviewStatus: { $in: ['PENDING', 'APPROVED', 'RETURNED'] },
    });

    if (!items.length) {
      throw new BadRequestException(
        'Không có nhiệm vụ nào chuyển lên được - việc đã chốt hoàn thành thì không gửi nữa.',
      );
    }
    if (items.length !== ids.length) {
      throw new BadRequestException(
        'Một số nhiệm vụ không nằm ở chỗ bạn hoặc đã chốt hoàn thành.',
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

    // Chốt hoàn thành áp cho việc đã duyệt; duyệt/trả lại áp cho việc đang chờ.
    const allowed: PersonalKpiReviewStatus[] =
      dto.decision === 'COMPLETE' ? ['PENDING', 'APPROVED'] : ['PENDING'];

    const items = await this.itemModel.find({
      _id: { $in: ids },
      currentRecipientId: actor.id,
      reviewStatus: { $in: allowed },
    });
    if (!items.length) {
      throw new BadRequestException(
        dto.decision === 'COMPLETE'
          ? 'Không có nhiệm vụ nào ở chỗ bạn để chốt hoàn thành.'
          : 'Không có nhiệm vụ nào đang chờ bạn duyệt.',
      );
    }

    const now = new Date();

    if (dto.decision === 'COMPLETE') {
      await this.assertProgressComplete(items);
      const percentById = await this.progressPercentOf(items);
      for (const item of items) {
        item.reviewStatus = 'COMPLETED';
        item.returnReason = '';
        item.lastDecidedById = actor.id;
        item.lastDecidedAt = now;
        this.appendLog(item, {
          type: 'COMPLETE',
          actor,
          percent: percentById.get(String(item._id)) ?? null,
          at: now,
        });
        await item.save();
      }
      await this.closeSubmissionsIfSettled(items);
      return {
        message: `Đã chốt hoàn thành ${items.length} nhiệm vụ.`,
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
      // Lý do trả lại lần này ghi vào nhật ký; trường returnReason chỉ giữ lần
      // gần nhất nên không đủ để đọc lại lịch sử.
      this.appendLog(item, { type: 'RETURN', actor, note: reason, at: now });
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

    await this.applyContent(item, dto);
    // Cấp trên sửa cột chất lượng thì điểm tự chấm phải chạy lại theo.
    await this.applyDerivedColumns([item]);
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
   */
  async board(userId: string, query: PersonalKpiBoardQueryDto) {
    const actor = await this.requireActor(userId);

    const filter: Record<string, unknown> = { currentRecipientId: actor.id };
    filter.reviewStatus = query.status
      ? query.status
      : query.includeDecided
        ? { $in: ['PENDING', 'APPROVED', 'RETURNED', 'COMPLETED'] }
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
    if (query.workContentId) {
      filter.workContentId = this.requireObjectId(
        query.workContentId,
        'Nội dung công việc',
      );
    }
    if (query.senderId) {
      filter.lastSenderId = this.requireObjectId(query.senderId, 'Người gửi');
    }
    if (query.ownerId) {
      filter.ownerId = this.requireObjectId(query.ownerId, 'Cán bộ');
    }
    if (query.departmentId) {
      // Khớp cả đơn vị của cán bộ lẫn đơn vị đã gửi lên, vì ở cấp cao nhiệm vụ
      // có thể do Đội tạo nhưng Phòng mới là nơi chuyển lên.
      const dept = this.requireObjectId(query.departmentId, 'Đơn vị');
      filter.$or = [
        { ownerDepartmentId: dept },
        { lastSenderDepartmentId: dept },
      ];
    }
    if (query.q?.trim()) Object.assign(filter, this.contentMatches(query.q));

    const rows = await this.itemModel
      .find(filter)
      .sort({ reportDate: -1, axisId: 1, workContentId: 1, createdAt: 1 })
      .limit(BOARD_MAX_ROWS)
      .populate('axisId', 'code name description sortOrder maxScore')
      .populate('workContentId', 'code name description sortOrder')
      .populate('ownerId', 'fullName username')
      .populate('ownerDepartmentId', 'code name')
      .populate('lastSenderId', 'fullName username')
      .populate('lastSenderDepartmentId', 'code name');

    const axes = await this.groupRowsByAxis(rows);

    // Đếm theo TOÀN BỘ việc đang ở chỗ mình, không theo bộ lọc trạng thái đang
    // xem - để thanh tab luôn nói được còn bao nhiêu việc đã duyệt chờ gửi lên.
    const countFilter = { ...filter };
    delete countFilter.reviewStatus;
    const countRows = await this.itemModel.aggregate<{
      _id: PersonalKpiReviewStatus;
      total: number;
    }>([
      { $match: countFilter },
      { $group: { _id: '$reviewStatus', total: { $sum: 1 } } },
    ]);
    const countMap = new Map(countRows.map((row) => [row._id, row.total]));
    const counts = {
      pending: countMap.get('PENDING') ?? 0,
      approved: countMap.get('APPROVED') ?? 0,
      returned: countMap.get('RETURNED') ?? 0,
      completed: countMap.get('COMPLETED') ?? 0,
    };

    // Không còn ai ở trên thì đây là cấp cuối - giao diện phải mời "Hoàn thành"
    // thay vì "Gửi lên cấp trên", nếu không người dùng sẽ kẹt ở tab Đã duyệt.
    let canForwardUp = false;
    try {
      const up = await this.findRecipientsUp(userId);
      canForwardUp = up.people.length > 0;
    } catch {
      canForwardUp = false;
    }

    return {
      message: 'OK',
      data: {
        axes,
        counts,
        canForwardUp,
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
   * Điều kiện tìm theo từ khoá trên nội dung nhiệm vụ.
   * Không còn cột "tên nhiệm vụ" cố định để tìm, nên quét hết giá trị các cột
   * trong fieldValues.
   */
  contentMatches(value: string) {
    const escaped = value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return {
      $expr: {
        $anyElementTrue: {
          $map: {
            input: { $objectToArray: { $ifNull: ['$fieldValues', {}] } },
            as: 'kv',
            in: {
              $regexMatch: {
                input: { $toString: '$$kv.v' },
                regex: escaped,
                options: 'i',
              },
            },
          },
        },
      },
    };
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
          // Cấp trên chuyển lên tức là đã duyệt - ghi lại người quyết định.
          ...(level > 1
            ? { lastDecidedById: sender.id, lastDecidedAt: now }
            : {}),
        },
      },
    );

    // Ghi mốc "đã gửi" lên từng nhiệm vụ để dựng được lịch sử gửi duyệt của
    // riêng nó, khỏi phải dò ngược trong toàn bộ các lượt gửi.
    const percentById = await this.progressPercentOf(items);
    for (const item of items) {
      this.appendLog(item, {
        type: 'SUBMIT',
        actor: sender,
        toName: target.name,
        note,
        level,
        percent: percentById.get(String(item._id)) ?? null,
        at: now,
      });
      await item.save();
    }

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
   * Áp lại những ô do hệ thống quyết, ghi đè giá trị client gửi lên:
   *  - cột Nhóm điểm lấy theo nội dung công việc của dòng (cán bộ không chọn nữa);
   *  - cột cấu hình `autoValue` tính lại từ hai cột nó trỏ tới.
   *
   * Khoá ô ở giao diện chỉ để đỡ nhầm; chỗ quyết định con số phải là đây, vì gọi
   * thẳng API thì vẫn đặt được giá trị khác. Chỉ mutate, người gọi tự lưu.
   */
  private async applyDerivedColumns(items: PersonalKpiItemDocument[]) {
    if (!items.length) return;

    // Nhiệm vụ trong một lượt thường chung vài trục, nên số lần tra mẫu rất nhỏ.
    const templateByItem = new Map<
      string,
      Awaited<ReturnType<typeof this.resolveBoardTemplate>>
    >();
    for (const item of items) {
      templateByItem.set(
        String(item._id),
        await this.resolveBoardTemplate(
          String(item.axisId),
          item.formTemplateId ? String(item.formTemplateId) : null,
          item.formTemplateVersion ?? null,
        ),
      );
    }

    const contentIds = [
      ...new Set(items.map((item) => String(item.workContentId))),
    ];
    const contents = await this.workContentModel
      .find({ _id: { $in: contentIds.map((id) => new Types.ObjectId(id)) } })
      .select('scoreGroupId');
    const groupIdByContent = new Map(
      contents.map((row) => [
        String(row._id),
        row.scoreGroupId ? String(row.scoreGroupId) : '',
      ]),
    );

    // Tên nhóm điểm chép vào catalogValues; phần trăm tra theo mức đã chọn.
    const groupIds = [...new Set(groupIdByContent.values())].filter(Boolean);
    const qualityIds = new Set<string>();
    for (const item of items) {
      for (const value of Object.values(item.catalogValues ?? {})) {
        if (value?.id) qualityIds.add(value.id);
      }
    }
    const groups: ScoreGroupDocument[] = groupIds.length
      ? await this.scoreGroupModel
          .find({ _id: { $in: groupIds.map((id) => new Types.ObjectId(id)) } })
          .select('name')
      : [];
    const levels: QualityLevelDocument[] = qualityIds.size
      ? await this.qualityLevelModel
          .find({
            _id: { $in: [...qualityIds].map((id) => new Types.ObjectId(id)) },
          })
          .select('percent')
      : [];
    const groupNameById = new Map(
      groups.map((row) => [String(row._id), row.name] as const),
    );
    const percentById = new Map(
      levels.map((row) => [String(row._id), row.percent] as const),
    );

    for (const item of items) {
      const template = templateByItem.get(String(item._id));
      if (!template) continue;

      const catalogValues = { ...(item.catalogValues ?? {}) };
      const fieldValues = { ...(item.fieldValues ?? {}) };

      const groupId = groupIdByContent.get(String(item.workContentId)) ?? '';
      const groupName = groupId ? groupNameById.get(groupId) : undefined;
      for (const column of template.columns) {
        if (column.semanticKey !== 'score_group') continue;
        // Nội dung chưa gán nhóm điểm thì bỏ trống chứ không giữ giá trị cũ -
        // giữ lại là để lọt đúng thứ vừa cấm cán bộ tự chọn.
        if (groupId && groupName) {
          catalogValues[column.key] = { id: groupId, name: groupName };
        } else {
          delete catalogValues[column.key];
        }
      }

      for (const column of template.columns) {
        const auto = column.autoValue;
        if (!auto) continue;

        const percentId = catalogValues[auto.percentColumnKey]?.id ?? '';
        const percent = percentId ? (percentById.get(percentId) ?? null) : null;

        const rawBase = fieldValues[auto.baseColumnKey];
        const base =
          rawBase === undefined ||
          rawBase === null ||
          String(rawBase).trim() === ''
            ? null
            : Number(rawBase);
        const value = computeAutoValue(
          auto.kind,
          percent,
          base !== null && Number.isFinite(base) ? base : null,
        );
        // Thiếu đầu vào thì để trống, KHÔNG ghi 0 - 0 đọc ra là "đã chấm 0 điểm".
        fieldValues[column.key] = value === null ? '' : value;
      }

      item.catalogValues = catalogValues;
      item.markModified('catalogValues');
      item.fieldValues = fieldValues;
      item.markModified('fieldValues');
    }
  }

  /**
   * Mẫu có cột Nhóm điểm mà nội dung công việc chưa được gán nhóm thì dòng đó
   * không tính điểm được. Chặn lúc gửi chứ không lúc lưu nháp - cán bộ vẫn phải
   * ghi lại được việc đang làm trong khi chờ quản trị bổ sung danh mục.
   */
  private async assertWorkContentScoreGroups(items: PersonalKpiItemDocument[]) {
    const needing = new Set<string>();
    for (const item of items) {
      const template = await this.resolveBoardTemplate(
        String(item.axisId),
        item.formTemplateId ? String(item.formTemplateId) : null,
        item.formTemplateVersion ?? null,
      );
      if (!template) continue;
      if (
        template.columns.some((column) => column.semanticKey === 'score_group')
      ) {
        needing.add(String(item.workContentId));
      }
    }
    if (!needing.size) return;

    const missing = await this.workContentModel
      .find({
        _id: { $in: [...needing].map((id) => new Types.ObjectId(id)) },
        $or: [{ scoreGroupId: null }, { scoreGroupId: { $exists: false } }],
      })
      .select('name');
    if (!missing.length) return;

    const names = missing.map((row) => row.name).join(', ');
    throw new BadRequestException(
      `Nội dung công việc chưa được gán nhóm điểm nên chưa gửi được: ${names}. ` +
        'Báo quản trị bổ sung trong Cấu hình form KPI › Nội dung công việc.',
    );
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
    for (const [index, item] of items.entries()) {
      const template = byId.get(String(item.formTemplateId ?? ''));
      if (!template) continue;

      const missing = template.columns
        .filter(
          (column) =>
            column.visible &&
            column.required &&
            column.semanticKey !== 'stt' &&
            this.isColumnEmpty(item, column),
        )
        .map((column) => column.title);

      // Không còn cột "tên nhiệm vụ" cố định để gọi tên dòng, nên chỉ ra số thứ tự.
      if (missing.length) {
        problems.push(`dòng ${index + 1}: ${missing.join(', ')}`);
      }
    }

    if (problems.length) {
      throw new BadRequestException(
        `Chưa nhập cột bắt buộc - ${problems.join('; ')}.`,
      );
    }
  }

  /**
   * Thêm một mốc vào nhật ký nhiệm vụ.
   *
   * Mọi loại mốc (cập nhật, gửi, trả lại, chốt) nằm chung một mảng để màn hình
   * dựng được một dòng thời gian duy nhất - tách bảng riêng cho từng loại thì
   * ghép lại lúc hiển thị vừa tốn truy vấn vừa dễ lệch thứ tự.
   */
  private appendLog(
    item: PersonalKpiItemDocument,
    entry: {
      type: PersonalKpiLogType;
      actor: { id: Types.ObjectId; name: string };
      percent?: number | null;
      note?: string;
      toName?: string;
      level?: number;
      changes?: PersonalKpiProgressChange[];
      at?: Date;
    },
  ) {
    const at = entry.at ?? new Date();
    item.progressLogs = [
      ...(item.progressLogs ?? []),
      {
        type: entry.type,
        byId: entry.actor.id,
        byName: entry.actor.name,
        percent: entry.percent ?? null,
        note: entry.note?.trim() ?? '',
        toName: entry.toName ?? '',
        level: entry.level ?? item.holderLevel,
        onDate: serverDateYmd(at),
        at,
        changes: entry.changes ?? [],
      },
    ];
    item.markModified('progressLogs');
  }

  /** Phần trăm KPI tiến độ hiện tại của từng nhiệm vụ, tra theo id. */
  private async progressPercentOf(items: PersonalKpiItemDocument[]) {
    const percentByLevelId = await this.qualityPercentMap();
    const cache = new Map<string, TrackingTemplate | null>();
    const result = new Map<string, number | null>();

    for (const item of items) {
      const template = await this.trackingTemplateOf(item, cache);
      const { progress } = resolveTrackingColumns(template);
      result.set(
        String(item._id),
        readItemPercent(item, progress, percentByLevelId),
      );
    }
    return result;
  }

  /** Số từ giá trị ô đã lưu; trống hoặc không phải số thì null (khác 0). */
  private toNumberOrNull(raw: unknown): number | null {
    if (raw === undefined || raw === null) return null;
    const text = String(raw).trim();
    if (!text) return null;
    const value = Number(text.replace(',', '.'));
    return Number.isFinite(value) ? value : null;
  }

  /** Phần trăm của từng mức chất lượng, tra theo id. */
  private async qualityPercentMap(): Promise<Map<string, number>> {
    const levels = await this.qualityLevelModel.find().select('percent');
    return new Map(levels.map((row) => [String(row._id), row.percent]));
  }

  /**
   * Mẫu bảng của một nhiệm vụ, dùng chung cho cả lô - nhiều dòng cùng trục và
   * cùng phiên bản mẫu thì chỉ tra một lần.
   */
  private async trackingTemplateOf(
    item: PersonalKpiItemDocument,
    cache?: Map<string, TrackingTemplate | null>,
  ): Promise<TrackingTemplate | null> {
    const templateId = item.formTemplateId ? String(item.formTemplateId) : null;
    const version = item.formTemplateVersion ?? null;
    const key = `${String(item.axisId)}:${templateId}:${version}`;
    if (cache?.has(key)) return cache.get(key)!;

    const resolved = await this.resolveBoardTemplate(
      String(item.axisId),
      templateId,
      version,
    );
    cache?.set(key, resolved);
    return resolved;
  }

  /**
   * Chỉ chốt hoàn thành khi KPI tiến độ đã đủ 100%.
   *
   * "Hoàn thành" là điểm dừng của chuỗi duyệt và đi thẳng vào số liệu KPI, nên
   * không cho chốt một việc mới chạy được 45% - muốn chốt thì trả lại để cán bộ
   * cập nhật tiến độ trước. Mẫu không có cột tiến độ thì không chặn, vì lúc đó
   * hệ thống chẳng có căn cứ nào để nói việc xong hay chưa.
   */
  private async assertProgressComplete(items: PersonalKpiItemDocument[]) {
    const percentByLevelId = await this.qualityPercentMap();
    const cache = new Map<string, TrackingTemplate | null>();
    const problems: string[] = [];

    for (const [index, item] of items.entries()) {
      const template = await this.trackingTemplateOf(item, cache);
      const { progress } = resolveTrackingColumns(template);
      if (!progress) continue;

      const percent = readItemPercent(item, progress, percentByLevelId);
      if (isProgressComplete(percent)) continue;

      problems.push(
        `dòng ${index + 1} ${percent === null ? 'chưa nhập tiến độ' : `mới đạt ${percent}%`}`,
      );
    }

    if (problems.length) {
      throw new BadRequestException(
        `Chỉ chốt hoàn thành khi KPI tiến độ đạt 100% - ${problems.join('; ')}. Trả lại để cán bộ cập nhật tiến độ trước.`,
      );
    }
  }

  /**
   * Ghi một ô theo dõi. Ô chọn mức lưu vào catalogValues kèm tên chép sẵn, ô số
   * lưu vào fieldValues sau khi kẹp về 0-100.
   */
  private async writeTrackingValue(
    column: { key: string; semanticKey: string; title: string },
    raw: string | undefined,
    fieldValues: Record<string, string | number>,
    catalogValues: Record<string, PersonalKpiCatalogValue>,
  ) {
    if (raw === undefined) return;
    const value = raw.trim();

    if (column.semanticKey === 'quality_level') {
      if (!value) {
        delete catalogValues[column.key];
        return;
      }
      const level = await this.qualityLevelModel
        .findById(this.requireObjectId(value, 'Mức chất lượng'))
        .select('name');
      if (!level) {
        throw new BadRequestException(
          `Mức chất lượng không hợp lệ cho cột "${column.title}".`,
        );
      }
      catalogValues[column.key] = {
        id: String(level._id),
        name: level.name,
      };
      return;
    }

    if (!value) {
      fieldValues[column.key] = '';
      return;
    }
    const percent = Number(value);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new BadRequestException(
        `"${column.title}" phải là số từ 0 đến 100.`,
      );
    }
    fieldValues[column.key] = percent;
  }

  /**
   * Cán bộ cập nhật tiến độ hằng ngày cho nhiệm vụ của mình.
   *
   * Chạy được cả khi nhiệm vụ đã gửi lên trên - đó chính là điểm khác với
   * `update`: chỉ ghi mấy ô theo dõi, KHÔNG kéo trạng thái duyệt về nháp và
   * không đụng tới vị trí trong chuỗi gửi. Việc đã chốt hoàn thành thì dừng,
   * số đã chấm không sửa nữa.
   */
  async updateProgress(
    ownerId: string,
    id: string,
    dto: UpdatePersonalKpiProgressDto,
  ) {
    const item = await this.requireOwned(ownerId, id);
    if (item.reviewStatus === 'COMPLETED') {
      throw new BadRequestException(
        'Nhiệm vụ đã chốt hoàn thành - không cập nhật tiến độ nữa.',
      );
    }

    const template = await this.trackingTemplateOf(item);
    const columns = resolveTrackingColumns(template);
    if (!columns.progress) {
      throw new BadRequestException(
        'Mẫu KPI của trục này chưa có cột tiến độ nên chưa cập nhật được. Liên hệ quản trị để bổ sung cột.',
      );
    }

    const percentByLevelId = await this.qualityPercentMap();
    const percentBefore = readItemPercent(
      item,
      columns.progress,
      percentByLevelId,
    );
    // Chụp lại giá trị cũ để lát nữa dựng danh sách "đã đổi những gì".
    const qualityBefore = readItemPercent(
      item,
      columns.quality,
      percentByLevelId,
    );
    const productBefore = columns.product
      ? String(item.fieldValues?.[columns.product.key] ?? '').trim()
      : '';
    const evidenceBefore = columns.evidence
      ? (item.attachments?.[columns.evidence.key] ?? [])
      : [];

    const fieldValues = { ...(item.fieldValues ?? {}) };
    const catalogValues = { ...(item.catalogValues ?? {}) };

    await this.writeTrackingValue(
      columns.progress,
      dto.progress,
      fieldValues,
      catalogValues,
    );

    /**
     * Lùi tiến độ thì bắt nêu lý do, KHÔNG cấm.
     *
     * Cấm hẳn là tự bắn vào chân: gõ nhầm 100% một lần rồi kẹt vĩnh viễn, mà
     * cấp trên lại nhìn thấy 100% và chốt hoàn thành một việc chưa xong. Việc
     * bị trả lại hay sản phẩm bị bác cũng là lùi tiến độ thật. Cho lùi nhưng
     * phải để lại dấu vết trong nhật ký.
     */
    const percentAfter = readItemPercent(
      { fieldValues, catalogValues },
      columns.progress,
      percentByLevelId,
    );
    if (
      percentBefore !== null &&
      percentAfter !== null &&
      percentAfter < percentBefore &&
      !dto.note?.trim()
    ) {
      throw new BadRequestException(
        `Tiến độ lùi từ ${percentBefore}% xuống ${percentAfter}% - phải ghi rõ lý do ở ô kết quả trong ngày.`,
      );
    }

    if (columns.quality) {
      await this.writeTrackingValue(
        columns.quality,
        dto.quality,
        fieldValues,
        catalogValues,
      );
    }
    if (columns.note && dto.note !== undefined) {
      fieldValues[columns.note.key] = dto.note.trim();
    }
    if (columns.product && dto.product !== undefined) {
      fieldValues[columns.product.key] = dto.product.trim();
    }

    item.fieldValues = fieldValues;
    item.catalogValues = catalogValues;

    // Tệp minh chứng chỉ ghi vào đúng cột tệp của mẫu, không đụng cột khác.
    if (columns.evidence && dto.evidence !== undefined) {
      const sanitized = await this.sanitizeAttachments({
        [columns.evidence.key]: dto.evidence,
      });
      item.attachments = {
        ...(item.attachments ?? {}),
        [columns.evidence.key]: sanitized[columns.evidence.key] ?? [],
      };
      item.markModified('attachments');
    }

    const now = new Date();
    item.lastProgressAt = now;
    // Điểm tự chấm ăn theo phần trăm nên phải tính lại ngay tại đây.
    await this.applyDerivedColumns([item]);

    // Nhật ký ghi con số SAU khi tính lại, để timeline khớp thứ đang hiển thị.
    const actor = await this.requireActor(ownerId);
    const percentNow = readItemPercent(
      item,
      columns.progress,
      percentByLevelId,
    );

    /**
     * Ghi lại từng ô đã đổi, chỉ giá trị thô.
     * Nhờ vậy đọc nhật ký là biết hôm đó cán bộ động vào cái gì, không phải
     * đoán qua mỗi con số phần trăm.
     */
    const changes: PersonalKpiProgressChange[] = [];
    const pushChange = (
      field: PersonalKpiProgressField,
      from: string,
      to: string,
      detail = '',
    ) => {
      if (from !== to) changes.push({ field, from, to, detail });
    };
    const percentText = (value: number | null) =>
      value === null ? '' : String(value);

    pushChange('progress', percentText(percentBefore), percentText(percentNow));
    if (columns.quality) {
      pushChange(
        'quality',
        percentText(qualityBefore),
        percentText(
          readItemPercent(item, columns.quality, percentByLevelId),
        ),
      );
    }
    if (columns.product) {
      pushChange(
        'product',
        productBefore,
        String(item.fieldValues?.[columns.product.key] ?? '').trim(),
      );
    }
    if (columns.evidence) {
      const after = item.attachments?.[columns.evidence.key] ?? [];
      const had = new Set(evidenceBefore.map((file) => file.id));
      const added = after
        .filter((file) => !had.has(file.id))
        .map((file) => file.name);
      pushChange(
        'evidence',
        String(evidenceBefore.length),
        String(after.length),
        added.join(', '),
      );
    }

    this.appendLog(item, {
      type: 'PROGRESS',
      actor,
      percent: percentNow,
      note: dto.note,
      changes,
      at: now,
    });

    await item.save();
    await item.populate([
      { path: 'axisId', select: 'code name description' },
      { path: 'workContentId', select: 'code name description' },
    ]);

    return { message: 'Đã cập nhật tiến độ.', data: item };
  }

  /**
   * Chỉ huy chấm điểm rồi chốt hoàn thành trong một thao tác.
   *
   * Điểm chấm ghi vào `reviewValues` chứ không đè lên ô của cán bộ: số tự chấm
   * phải còn để đối chiếu. Công thức tính điểm trục vẫn y nguyên như cấu hình,
   * chỉ khác nguồn đọc - ô nào chỉ huy đã chấm thì lấy số đó.
   */
  async scoreAndComplete(
    userId: string,
    id: string,
    dto: ScorePersonalKpiDto,
  ) {
    const actor = await this.requireActor(userId);
    const item = await this.itemModel.findOne({
      _id: this.requireObjectId(id, 'Nhiệm vụ'),
      currentRecipientId: actor.id,
      reviewStatus: { $in: ['PENDING', 'APPROVED'] },
    });
    if (!item) {
      throw new NotFoundException(
        'Không tìm thấy nhiệm vụ đang chờ bạn chốt.',
      );
    }

    await this.assertProgressComplete([item]);

    const template = await this.trackingTemplateOf(item);
    const scoreColumns = resolveScoreColumns(template);
    if (!scoreColumns.entries.length) {
      throw new BadRequestException(
        'Mẫu KPI của trục này chưa cấu hình công thức điểm nên chưa chấm được. Cấu hình tại Cấu hình form KPI › Mẫu bảng KPI.',
      );
    }

    // Chỉ nhận đúng các cột trong công thức - gửi thừa khoá khác thì bỏ qua.
    const allowed = new Map<string, FormTemplateColumn>();
    for (const entry of scoreColumns.entries) {
      allowed.set(entry.score.key, entry.score);
      if (entry.percent) allowed.set(entry.percent.key, entry.percent);
    }

    const reviewValues = { ...(item.reviewValues ?? {}) };
    const reviewCatalogValues = { ...(item.reviewCatalogValues ?? {}) };

    for (const [key, raw] of Object.entries(dto.values ?? {})) {
      const column = allowed.get(key);
      if (!column) continue;
      const value = String(raw ?? '').trim();

      if (column.semanticKey === 'quality_level') {
        if (!value) {
          delete reviewCatalogValues[key];
          continue;
        }
        const level = await this.qualityLevelModel
          .findById(this.requireObjectId(value, 'Mức chất lượng'))
          .select('name');
        if (!level) {
          throw new BadRequestException(
            `Mức chất lượng không hợp lệ cho cột "${column.title}".`,
          );
        }
        reviewCatalogValues[key] = { id: String(level._id), name: level.name };
        continue;
      }

      if (!value) {
        delete reviewValues[key];
        continue;
      }
      const parsed = Number(value.replace(',', '.'));
      if (!Number.isFinite(parsed)) {
        throw new BadRequestException(`"${column.title}" phải là số.`);
      }
      reviewValues[key] = parsed;
    }

    /*
      Cột tự tính (điểm tự chấm = % × điểm chuẩn) phải tính lại theo số chỉ huy
      vừa chấm, không thì bảng hiện phần trăm mới mà điểm vẫn là điểm cũ.
    */
    const percentById = await this.qualityPercentMap();
    for (const column of template?.columns ?? []) {
      const auto = column.autoValue;
      if (!auto) continue;

      const pickedLevel =
        reviewCatalogValues[auto.percentColumnKey]?.id ??
        item.catalogValues?.[auto.percentColumnKey]?.id;
      const rawPercent =
        reviewValues[auto.percentColumnKey] ??
        item.fieldValues?.[auto.percentColumnKey];
      const percent = pickedLevel
        ? (percentById.get(String(pickedLevel)) ?? null)
        : this.toNumberOrNull(rawPercent);

      const base = this.toNumberOrNull(
        reviewValues[auto.baseColumnKey] ?? item.fieldValues?.[auto.baseColumnKey],
      );
      const value = computeAutoValue(auto.kind, percent, base);
      if (value === null) delete reviewValues[column.key];
      else reviewValues[column.key] = value;
    }

    const now = new Date();
    item.reviewValues = reviewValues;
    item.reviewCatalogValues = reviewCatalogValues;
    item.markModified('reviewValues');
    item.markModified('reviewCatalogValues');
    item.reviewNote = dto.note?.trim() ?? '';
    item.reviewScoredById = actor.id;
    item.reviewScoredByName = actor.name;
    item.reviewScoredAt = now;
    item.reviewStatus = 'COMPLETED';
    item.returnReason = '';
    item.lastDecidedById = actor.id;
    item.lastDecidedAt = now;

    const percentByLevelId = await this.qualityPercentMap();
    const { progress } = resolveTrackingColumns(template);
    this.appendLog(item, {
      type: 'COMPLETE',
      actor,
      percent: readItemPercent(item, progress, percentByLevelId),
      note: item.reviewNote,
      at: now,
    });
    await item.save();
    await this.closeSubmissionsIfSettled([item]);

    return { message: 'Đã chấm điểm và chốt hoàn thành.', data: item };
  }

  /**
   * Điểm nhập phải nằm trong dải của nhóm điểm đã chọn ở cột được trỏ tới.
   * Chặn ở server chứ không chỉ ở ô nhập, vì min/max trên input chỉ là gợi ý -
   * gọi thẳng API vẫn lưu được số ngoài dải.
   */
  private async assertScoreRangesValid(items: PersonalKpiItemDocument[]) {
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

    // Gom id nhóm điểm của mọi nhiệm vụ rồi tra một lượt.
    const groupIds = new Set<string>();
    for (const item of items) {
      const template = byId.get(String(item.formTemplateId ?? ''));
      if (!template) continue;
      for (const column of template.columns) {
        if (!column.rangeFromColumnKey) continue;
        const picked = item.catalogValues?.[column.rangeFromColumnKey]?.id;
        if (picked) groupIds.add(picked);
      }
    }
    if (!groupIds.size) return;

    const groups = await this.scoreGroupModel.find({
      _id: { $in: [...groupIds].map((id) => new Types.ObjectId(id)) },
    });
    const groupById = new Map(groups.map((row) => [String(row._id), row]));

    const problems: string[] = [];
    for (const [index, item] of items.entries()) {
      const template = byId.get(String(item.formTemplateId ?? ''));
      if (!template) continue;

      for (const column of template.columns) {
        if (!column.visible || !column.rangeFromColumnKey) continue;

        const groupId = item.catalogValues?.[column.rangeFromColumnKey]?.id;
        const group = groupId ? groupById.get(groupId) : null;
        if (!group) continue;

        const raw = item.fieldValues?.[column.key];
        if (raw === undefined || raw === null || String(raw).trim() === '') {
          continue;
        }

        const score = Number(raw);
        if (!Number.isFinite(score)) {
          problems.push(`dòng ${index + 1} - "${column.title}" không phải số`);
          continue;
        }
        if (
          !isScoreInGroupRange(
            score,
            group.minScore,
            group.maxScore,
            group.maxInclusive,
          )
        ) {
          problems.push(
            `dòng ${index + 1} - "${column.title}" = ${score}, ngoài dải ${formatScoreGroupRange(
              group.minScore,
              group.maxScore,
              group.maxInclusive,
            )} của ${group.name}`,
          );
        }
      }
    }

    if (problems.length) {
      throw new BadRequestException(`Điểm không hợp lệ - ${problems.join('; ')}.`);
    }
  }

  private isColumnEmpty(
    item: PersonalKpiItemDocument,
    column: { semanticKey: string; key: string; dataType: string },
  ): boolean {
    switch (column.semanticKey) {
      case 'score_group':
      case 'quality_level':
        return !item.catalogValues?.[column.key]?.id;
      case 'work_content':
        return !item.workContentId;
      default:
        // Cột tệp đính kèm nằm ở attachments chứ không phải fieldValues.
        if (column.dataType === 'file') {
          return !item.attachments?.[column.key]?.length;
        }
        return !String(item.fieldValues?.[column.key] ?? '').trim();
    }
  }

  /**
   * Gom một tập nhiệm vụ thành khối Trục → Nội dung công việc, kèm bộ cột của
   * mẫu đã khoá lúc gửi. Bảng tổng của cấp trên và báo cáo tổng dùng chung hàm
   * này để hai màn hình không bao giờ dựng bảng khác nhau từ cùng dữ liệu.
   *
   * Tách khối theo (trục, phiên bản mẫu): mẫu đổi giữa chừng thì các dòng cũ
   * vẫn dựng đúng bảng của thời điểm gửi thay vì bị méo theo mẫu mới.
   */
  async groupRowsByAxis(rows: PersonalKpiItemDocument[]) {
    const blocks = new Map<
      string,
      {
        axisId: string;
        axisCode: string;
        axisName: string;
        axisDescription: string;
        axisMaxScore: number;
        formTemplateId: string | null;
        formTemplateVersion: number | null;
        groups: Map<
          string,
          {
            workContentId: string;
            workContentCode: string;
            workContentName: string;
            workContentDescription: string;
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
        description?: string;
        maxScore?: number;
      };
      const content = row.workContentId as unknown as {
        _id: Types.ObjectId;
        code?: string;
        name?: string;
        description?: string;
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
          axisDescription: axis?.description ?? '',
          axisMaxScore: axis?.maxScore ?? 0,
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
          workContentDescription: content?.description ?? '',
          rows: [],
        };
        block.groups.set(contentId, group);
      }
      group.rows.push(row);
    }

    return Promise.all(
      [...blocks.values()].map(async (block) => ({
        axisId: block.axisId,
        axisCode: block.axisCode,
        axisName: block.axisName,
        axisDescription: block.axisDescription,
        axisMaxScore: block.axisMaxScore,
        template: await this.resolveBoardTemplate(
          block.axisId,
          block.formTemplateId,
          block.formTemplateVersion,
        ),
        groups: [...block.groups.values()],
      })),
    );
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
      footer: live.footer,
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
    // Không giữ vai trò nào trong chuỗi báo cáo (ví dụ tài khoản chỉ có
    // SUPER_ADMIN) thì không tham gia gửi báo cáo nghiệp vụ.
    if (myRank < 0) {
      return { higherRoles: [], people: [] };
    }
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

  private async mapContent(dto: CreatePersonalKpiDto) {
    return {
      fieldValues: dto.fieldValues ?? {},
      catalogValues: await this.resolveCatalogValues(dto.catalogValues),
      attachments: await this.sanitizeAttachments(dto.attachments),
    };
  }

  /**
   * Tra tên cho các id danh mục client gửi lên, bỏ id không có thật.
   * Tra ở cả hai danh mục thay vì suy từ mẫu bảng: mẫu có thể chưa được khoá
   * lúc lưu nháp, còn id thì luôn đủ để biết nó thuộc danh mục nào.
   */
  private async resolveCatalogValues(
    raw: Record<string, unknown> | undefined,
  ): Promise<Record<string, PersonalKpiCatalogValue>> {
    if (!raw) return {};

    const wanted = new Map<string, string>();
    for (const [key, value] of Object.entries(raw)) {
      const id = typeof value === 'string' ? value.trim() : '';
      if (id && Types.ObjectId.isValid(id)) wanted.set(key, id);
    }
    if (!wanted.size) return {};

    const ids = [...new Set(wanted.values())].map(
      (id) => new Types.ObjectId(id),
    );
    const [scoreGroups, qualityLevels] = await Promise.all([
      this.scoreGroupModel.find({ _id: { $in: ids } }).select('name'),
      this.qualityLevelModel.find({ _id: { $in: ids } }).select('name'),
    ]);

    const nameById = new Map<string, string>();
    for (const row of [...scoreGroups, ...qualityLevels]) {
      nameById.set(String(row._id), row.name);
    }

    const result: Record<string, PersonalKpiCatalogValue> = {};
    for (const [key, id] of wanted) {
      const name = nameById.get(id);
      if (name) result[key] = { id, name };
    }
    return result;
  }

  /**
   * Lọc danh sách tệp client gửi lên: chỉ giữ id thật sự có trong collection
   * uploads. Không tin tên/cỡ client gửi thì cũng không hiển thị được gì, nên
   * chép lại nhưng cắt độ dài; điều quan trọng là id phải có thật.
   */
  private async sanitizeAttachments(
    raw: Record<string, unknown> | undefined,
  ): Promise<Record<string, PersonalKpiAttachment[]>> {
    if (!raw) return {};

    const candidates: Array<{ key: string; file: PersonalKpiAttachment }> = [];
    for (const [key, value] of Object.entries(raw)) {
      if (!Array.isArray(value)) continue;
      for (const entry of value) {
        if (!entry || typeof entry !== 'object') continue;
        const row = entry as Record<string, unknown>;
        const id = typeof row.id === 'string' ? row.id.trim() : '';
        if (!id) continue;
        candidates.push({
          key,
          file: {
            id,
            name: String(row.name ?? '').slice(0, 255),
            size: Number(row.size) || 0,
            mimeType: String(row.mimeType ?? 'application/octet-stream'),
          },
        });
      }
    }
    if (!candidates.length) return {};

    const existing = await this.uploadsService.keepExistingIds(
      candidates.map((item) => item.file.id),
    );

    const result: Record<string, PersonalKpiAttachment[]> = {};
    for (const item of candidates) {
      if (!existing.has(item.file.id)) continue;
      (result[item.key] ??= []).push(item.file);
    }
    return result;
  }

  private async applyContent(
    item: PersonalKpiItemDocument,
    dto: UpdatePersonalKpiDto | ReviewerEditPersonalKpiDto,
  ) {
    if (dto.catalogValues !== undefined) {
      item.catalogValues = await this.resolveCatalogValues(dto.catalogValues);
      item.markModified('catalogValues');
    }
    if (dto.fieldValues !== undefined) {
      item.fieldValues = { ...item.fieldValues, ...dto.fieldValues };
      item.markModified('fieldValues');
    }
    // Thay nguyên bản đồ tệp chứ không trộn - trộn thì gỡ tệp ra không được.
    if (dto.attachments !== undefined) {
      item.attachments = await this.sanitizeAttachments(dto.attachments);
      item.markModified('attachments');
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
