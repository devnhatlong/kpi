import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { RoleCode } from '@/common/enums/role-code.enum';
import {
  Axis,
  AxisDocument,
} from '@/modules/mission-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentDocument,
} from '@/modules/mission-form-config/schemas/work-content.schema';
import {
  computeAutoValue,
  FormTemplate,
  FormTemplateColumn,
  FormTemplateDocument,
} from '@/modules/mission-form-config/schemas/form-template.schema';
import { FormTemplatesService } from '@/modules/mission-form-config/form-templates.service';
import { UploadsService } from '@/modules/uploads/uploads.service';
import {
  formatScoreGroupRange,
  isScoreInGroupRange,
} from '@/modules/mission-form-config/score-group.constants';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  CreatePersonalMissionBatchDto,
  CreatePersonalMissionDto,
  ForwardPersonalMissionDto,
  PersonalMissionBoardQueryDto,
  PersonalMissionListQueryDto,
  PersonalMissionReportsQueryDto,
  PersonalMissionStatisticsQueryDto,
  ReviewPersonalMissionDto,
  ReviewerEditPersonalMissionDto,
  ScorePersonalCriteriaSheetDto,
  ScorePersonalMissionDto,
  SavePersonalCriteriaSheetDto,
  SubmitPersonalMissionDto,
  UpdatePersonalCriteriaSheetDto,
  UpdatePersonalMissionDto,
  UpdatePersonalMissionProgressDto,
  type PersonalMissionStatScope,
} from './dto/personal-mission.dto';
import {
  computeAxisScore,
  type ScoreCatalogs,
} from './personal-mission-score.util';
import {
  readItemPercent,
  resolveResultColumns,
  resolveScoreColumns,
  resolveTrackingColumns,
  type TrackingTemplate,
} from './personal-mission-progress.util';
import {
  PersonalMissionAttachment,
  PersonalMissionCatalogValue,
  PersonalMissionItem,
  PersonalMissionItemDocument,
  PersonalMissionLogType,
  PersonalMissionProgressChange,
  PersonalMissionProgressField,
  PersonalMissionProgressLog,
  PersonalMissionReviewStatus,
} from './schemas/personal-mission-item.schema';
import {
  WorkTask,
  WorkTaskDocument,
} from '@/modules/mission-form-config/schemas/work-task.schema';
import {
  ScoreGroup,
  ScoreGroupDocument,
} from '@/modules/mission-form-config/schemas/score-group.schema';
import {
  QualityLevel,
  QualityLevelDocument,
} from '@/modules/mission-form-config/schemas/quality-level.schema';
import {
  Criterion,
  CriterionDocument,
} from '@/modules/mission-form-config/schemas/criterion.schema';
import {
  PersonalMissionSubmission,
  PersonalMissionSubmissionDocument,
} from './schemas/personal-mission-submission.schema';
import {
  PersonalMissionCriteriaSheet,
  PersonalMissionCriteriaSheetDocument,
  type PersonalMissionCriterionRow,
} from './schemas/personal-mission-criteria-sheet.schema';
import {
  isYearMonth,
  isYmd,
  serverDateYmd,
  serverMonth,
  shiftYmd,
} from './personal-mission.time';

/** Cán bộ chỉ sửa/gửi được nhiệm vụ ở hai trạng thái này. */
const OWNER_EDITABLE: PersonalMissionReviewStatus[] = ['DRAFT', 'RETURNED'];

/** Bậc vai trò tăng dần - dùng để biết ai là cấp trên. */
/**
 * Chuỗi báo cáo đi lên. KHÔNG có SUPER_ADMIN - tài khoản đó chỉ để cấu hình,
 * báo cáo nghiệp vụ dừng ở CAT_ADMIN.
 */
const ROLE_LADDER: RoleCode[] = [
  RoleCode.STAFF,
  RoleCode.MANAGER,
  RoleCode.VICE_UNIT_ADMIN,
  RoleCode.UNIT_ADMIN,
  RoleCode.CAT_ADMIN,
];

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

/**
 * Thứ ghi được nhật ký: nhiệm vụ và bảng khối A.
 *
 * Khai theo hình dạng thay vì theo document cụ thể để `appendLog` dùng chung
 * cho cả hai - hai bản sao của cùng một hàm chỉ khác kiểu tham số là chỗ để
 * hai dòng thời gian trôi lệch nhau về sau.
 */
type LoggableDoc = {
  holderLevel: number;
  progressLogs?: PersonalMissionProgressLog[];
  markModified(path: string): void;
};

/**
 * Thứ đi được trong chuỗi gửi: nhiệm vụ và bảng khối A.
 * Duyệt / trả lại / đóng lượt gửi thao tác y hệt nhau trên cả hai nên viết một
 * lần theo hình dạng, thay vì hai vòng lặp song song rồi sửa lệch nhau.
 */
type SubmittableDoc = LoggableDoc & {
  _id: unknown;
  reviewStatus: PersonalMissionReviewStatus;
  ownerId: Types.ObjectId;
  ownerDepartmentId: Types.ObjectId | null;
  currentSubmissionId: Types.ObjectId | null;
  currentRecipientId: Types.ObjectId | null;
  currentRecipientDepartmentId: Types.ObjectId | null;
  lastSenderId: Types.ObjectId | null;
  lastSenderDepartmentId: Types.ObjectId | null;
  lastDecidedById: Types.ObjectId | null;
  lastDecidedAt: Date | null;
  returnReason: string;
  save(): Promise<unknown>;
};

@Injectable()
export class PersonalMissionService {
  constructor(
    @InjectModel(PersonalMissionItem.name)
    private readonly itemModel: Model<PersonalMissionItemDocument>,
    @InjectModel(PersonalMissionSubmission.name)
    private readonly submissionModel: Model<PersonalMissionSubmissionDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(FormTemplate.name)
    private readonly formTemplateModel: Model<FormTemplateDocument>,
    @InjectModel(WorkTask.name)
    private readonly workTaskModel: Model<WorkTaskDocument>,
    @InjectModel(ScoreGroup.name)
    private readonly scoreGroupModel: Model<ScoreGroupDocument>,
    @InjectModel(QualityLevel.name)
    private readonly qualityLevelModel: Model<QualityLevelDocument>,
    @InjectModel(Criterion.name)
    private readonly criterionModel: Model<CriterionDocument>,
    @InjectModel(PersonalMissionCriteriaSheet.name)
    private readonly criteriaSheetModel: Model<PersonalMissionCriteriaSheetDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly formTemplatesService: FormTemplatesService,
    private readonly uploadsService: UploadsService,
  ) {}

  // ============================================================ cán bộ nhập

  async createMany(ownerId: string, batch: CreatePersonalMissionBatchDto) {
    if (!batch.items?.length) {
      throw new BadRequestException('Chưa có nhiệm vụ nào để lưu.');
    }
    const actor = await this.requireActor(ownerId);
    const reportDate = this.resolveReportDate(batch.reportDate);

    const created: Types.ObjectId[] = [];
    const docs: PersonalMissionItemDocument[] = [];
    for (const dto of batch.items) {
      const { axis, workContent } = await this.requireAxisAndContent(
        dto.axisId,
        dto.workContentId,
      );
      const doc = await this.itemModel.create({
        ...(await this.mapContent(dto)),
        collaborators: await this.resolveCollaborators(
          dto.collaboratorIds,
          actor.id,
        ),
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
      .populate('workContentId', 'code name description note');

    return {
      message:
        data.length > 1
          ? `Đã lưu ${data.length} nhiệm vụ nháp.`
          : 'Đã lưu nháp.',
      data,
    };
  }

  /** Cán bộ sửa nhiệm vụ của mình khi còn nháp hoặc bị trả lại. */
  async update(ownerId: string, id: string, dto: UpdatePersonalMissionDto) {
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
      { path: 'workContentId', select: 'code name description note' },
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

  async findMine(ownerId: string, query: PersonalMissionListQueryDto = {}) {
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter: Record<string, unknown> = { ownerId: owner };

    /*
      Một ngày hoặc một khoảng ngày, không nhận cả hai: `reportDate` là màn
      nhập báo cáo của đúng ngày đó, còn from/to là màn xem lại nhiều ngày.
    */
    if (query.reportDate) {
      filter.reportDate = this.requireYmd(query.reportDate, 'reportDate');
    } else {
      const range: Record<string, string> = {};
      if (query.fromDate) {
        range.$gte = this.requireYmd(query.fromDate, 'fromDate');
      }
      if (query.toDate) range.$lte = this.requireYmd(query.toDate, 'toDate');
      if (range.$gte && range.$lte && range.$gte > range.$lte) {
        throw new BadRequestException('Từ ngày phải trước hoặc bằng đến ngày.');
      }
      if (Object.keys(range).length) filter.reportDate = range;
    }
    if (query.status) filter.reviewStatus = query.status;
    if (query.axisId) {
      filter.axisId = this.requireObjectId(query.axisId, 'Trục');
    }
    if (query.q?.trim()) Object.assign(filter, this.contentMatches(query.q));

    const [data, total] = await Promise.all([
      this.itemModel
        .find(filter)
        // Nhiều ngày thì ngày mới lên trước; trong một ngày giữ thứ tự nhập.
        .sort({ reportDate: -1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('axisId', 'code name description')
        .populate('workContentId', 'code name description note')
        .populate('lastDecidedById', 'fullName username'),
      this.itemModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  /** Danh sách báo cáo theo ngày của chính mình. */
  async findReports(ownerId: string, query: PersonalMissionReportsQueryDto) {
    const owner = this.requireObjectId(ownerId, 'Người dùng');
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const match: Record<string, unknown> = { ownerId: owner };
    if (query.status) match.reviewStatus = query.status;
    if (query.q?.trim()) Object.assign(match, this.contentMatches(query.q));

    const range: Record<string, string> = {};
    if (query.fromDate)
      range.$gte = this.requireYmd(query.fromDate, 'fromDate');
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
  async statistics(userId: string, query: PersonalMissionStatisticsQueryDto) {
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
    if (query.axisId)
      filter.axisId = this.requireObjectId(query.axisId, 'Trục');

    const [statusRows, dailyRows, axisRows, departmentRows, contentRows] =
      await Promise.all([
        this.itemModel.aggregate<{
          _id: PersonalMissionReviewStatus;
          total: number;
        }>([
          { $match: filter },
          { $group: { _id: '$reviewStatus', total: { $sum: 1 } } },
        ]),
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
          _id: PersonalMissionReviewStatus;
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
    const scoreByDepartment = new Map<
      string,
      { sum: number; people: number }
    >();
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
        .select(
          'code name minScore maxScore maxInclusive formulaScore sortOrder',
        )
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

    const scoreOf = (bucket: Map<string, PersonalMissionItemDocument[]>) =>
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

    const pushInto = <K>(
      map: Map<K, Map<string, PersonalMissionItemDocument[]>>,
      key: K,
      row: PersonalMissionItemDocument,
    ) => {
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

    const globalByAxis = new Map<string, PersonalMissionItemDocument[]>();
    const byOwner = new Map<
      string,
      Map<string, PersonalMissionItemDocument[]>
    >();
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
      .find({
        _id: { $in: [...byOwner.keys()].map((id) => new Types.ObjectId(id)) },
      })
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
    requested: PersonalMissionStatScope | undefined,
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
          RoleCode.VICE_UNIT_ADMIN,
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
        label: 'Toàn đơn vị và các đơn vị trực thuộc',
        filter: { ownerDepartmentId: { $in: departmentIds } },
      };
    }

    return {
      applied: 'mine' as const,
      canViewUnit,
      label: 'Nhiệm vụ cá nhân',
      filter: { ownerId: actor.id },
    };
  }

  /** Đơn vị đang đứng cùng toàn bộ đơn vị con - bám cây qua mảng ancestors. */
  private async departmentSubtreeIds(departmentId: Types.ObjectId) {
    const descendants = await this.departmentModel
      .find({ ancestors: departmentId })
      .select('_id');
    return [
      departmentId,
      ...descendants.map((row) => row._id as Types.ObjectId),
    ];
  }

  // =========================================================== gửi lên trên

  async listRecipients(userId: string, q?: string) {
    const data = await this.findRecipientsUp(userId, q);
    return { message: 'OK', data };
  }

  /**
   * Cán bộ chọn được làm người phối hợp: đơn vị mình và các đơn vị cấp dưới.
   *
   * KHÔNG lọc theo vai trò như `findRecipientsUp`: phối hợp là làm cùng nhau,
   * không phải trình lên - đội trưởng phối hợp với cán bộ là chuyện bình thường,
   * chặn theo bậc ở đây là chặn nhầm.
   *
   * Không lấy đơn vị cấp trên: người ngoài nhánh mình quản lý thì mình không có
   * cơ sở để khai thay họ là "có phối hợp".
   */
  async listColleagues(userId: string, q?: string) {
    const me = await this.userModel.findById(userId).select('departmentId');
    if (!me?.departmentId) return { message: 'OK', data: { people: [] } };

    const departmentIds = await this.departmentSubtreeIds(
      new Types.ObjectId(String(me.departmentId)),
    );

    const filter: Record<string, unknown> = {
      isActive: true,
      _id: { $ne: me._id },
      departmentId: { $in: departmentIds },
    };
    if (q?.trim()) {
      const regex = this.likeRegex(q);
      filter.$or = [{ fullName: regex }, { username: regex }];
    }

    const found = await this.userModel
      .find(filter)
      .select('fullName username rank departmentId')
      .populate('departmentId', 'code name')
      .sort({ fullName: 1, username: 1 })
      .limit(200)
      .lean();

    const people = found.map((user) => {
      const dept = user.departmentId as unknown as { name?: string } | null;
      return {
        id: String(user._id),
        fullName: user.fullName?.trim() || user.username,
        rank: (user as { rank?: string }).rank ?? '',
        departmentName: dept?.name ?? '',
      };
    });

    return { message: 'OK', data: { people } };
  }

  /**
   * Cấp trên hợp lệ để nhận một bản trình, dùng cho module khác (báo cáo tổng
   * hợp). Mở ra ở đây để cả hệ thống chỉ có một định nghĩa "cấp trên của tôi".
   */
  async resolveRecipientUp(userId: string, recipientId: string) {
    const target = await this.requireValidRecipient(userId, recipientId);
    return {
      id: target.id,
      name: target.name,
      departmentId: target.departmentId,
    };
  }

  /** Cán bộ gửi báo cáo ngày của chính mình lên cấp trên (lượt cấp 1). */
  async submit(
    userId: string,
    reportDate: string,
    dto: SubmitPersonalMissionDto,
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
    /*
      Bảng khối A chốt theo THÁNG: gửi kèm báo cáo của ngày nào trong tháng cũng
      được, và cả tháng chỉ có một bảng để gửi.
    */
    const sheets = dto.includeCriteria
      ? [await this.requireSendableCriteriaSheet(actor.id, serverMonth(date))]
      : [];
    if (!items.length && !sheets.length) {
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
    await this.stampCriteriaTemplates(sheets);
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
      sheets,
      sourceSubmissionIds: [],
      message: (count, sheetCount) => {
        const parts = [
          count ? `${count} nhiệm vụ` : '',
          sheetCount ? 'bảng khối A' : '',
        ]
          .filter(Boolean)
          .join(' và ');
        return `Đã gửi ${parts} tới ${target.name}.`;
      },
    });
  }

  /**
   * Bảng khối A của ngày, đã kiểm là gửi được.
   *
   * Bảng đã nằm ở tay cấp trên thì KHÔNG gửi lại - đúng luật của nhiệm vụ
   * (`holderLevel: 0` + trạng thái cán bộ còn sửa được). Muốn đổi số thì dùng
   * đường cập nhật, hoặc chờ bị trả lại.
   */
  private async requireSendableCriteriaSheet(
    ownerId: Types.ObjectId,
    periodMonth: string,
  ) {
    const sheet = await this.criteriaSheetModel.findOne({
      ownerId,
      periodMonth,
    });
    if (!sheet) {
      throw new BadRequestException(
        'Chưa có bảng khối A của tháng này để gửi - lưu nháp bảng trước.',
      );
    }
    if (!OWNER_EDITABLE.includes(sheet.reviewStatus)) {
      throw new BadRequestException(
        sheet.reviewStatus === 'COMPLETED'
          ? 'Bảng khối A của tháng này đã chốt - không gửi lại nữa.'
          : 'Bảng khối A của tháng này đã gửi lên trên rồi.',
      );
    }
    const filled = sheet.rows.some(
      (row) =>
        Object.values(row.fieldValues ?? {}).some(
          (value) => String(value ?? '').trim() !== '',
        ) || Object.keys(row.catalogValues ?? {}).length > 0,
    );
    if (!filled) {
      throw new BadRequestException(
        'Bảng khối A chưa chấm ô nào - không gửi bảng trống.',
      );
    }
    return sheet;
  }

  /** Chốt mẫu `forCriteria` cho các bảng khối A chưa từng gửi. */
  private async stampCriteriaTemplates(
    sheets: PersonalMissionCriteriaSheetDocument[],
  ) {
    const pending = sheets.filter((sheet) => !sheet.formTemplateId);
    if (!pending.length) return;

    const template = await this.formTemplateModel.findOne({
      forCriteria: true,
      isActive: true,
    });
    if (!template) {
      throw new BadRequestException(
        'Khối A chưa được gán mẫu bảng nên chưa gửi được. Cấu hình tại Cấu hình form nhiệm vụ › Mẫu bảng nhiệm vụ.',
      );
    }
    for (const sheet of pending) {
      sheet.formTemplateId = template._id as Types.ObjectId;
      sheet.formTemplateVersion = template.version ?? 1;
    }
  }

  /** Cấp trên gửi tiếp các nhiệm vụ / bảng khối A đang giữ lên cấp cao hơn. */
  async forward(userId: string, dto: ForwardPersonalMissionDto) {
    const actor = await this.requireActor(userId);
    const target = await this.requireValidRecipient(userId, dto.recipientId);
    const note = this.requireNote(dto.note);

    const ids = (dto.itemIds ?? []).map((id) =>
      this.requireObjectId(id, 'Nhiệm vụ'),
    );
    const sheetIds = (dto.criteriaSheetIds ?? []).map((id) =>
      this.requireObjectId(id, 'Bảng khối A'),
    );
    if (!ids.length && !sheetIds.length) {
      throw new BadRequestException('Chưa tích dòng nào để gửi lên.');
    }

    // Chuyển lên trên CHÍNH LÀ hành động duyệt - nhận cả việc đang chờ duyệt,
    // không bắt bấm "Duyệt" trước rồi mới được gửi. Việc đã chốt hoàn thành thì
    // không nằm trong danh sách này nữa.
    const forwardable: PersonalMissionReviewStatus[] = [
      'PENDING',
      'APPROVED',
      'RETURNED',
    ];
    const holding = {
      currentRecipientId: actor.id,
      holderLevel: { $gte: 1 },
      reviewStatus: { $in: forwardable },
    };
    const [items, sheets] = await Promise.all([
      ids.length
        ? this.itemModel.find({ _id: { $in: ids }, ...holding })
        : Promise.resolve([]),
      sheetIds.length
        ? this.criteriaSheetModel.find({ _id: { $in: sheetIds }, ...holding })
        : Promise.resolve([]),
    ]);

    if (!items.length && !sheets.length) {
      throw new BadRequestException(
        'Không có dòng nào chuyển lên được - việc đã chốt hoàn thành thì không gửi nữa.',
      );
    }
    if (items.length !== ids.length || sheets.length !== sheetIds.length) {
      throw new BadRequestException(
        'Một số dòng không nằm ở chỗ bạn hoặc đã chốt hoàn thành.',
      );
    }

    // Mỗi dòng đi lên đúng một bậc so với vị trí hiện tại của nó.
    const moving: SubmittableDoc[] = [...items, ...sheets];
    const levels = new Set(moving.map((doc) => doc.holderLevel));
    if (levels.size > 1) {
      throw new BadRequestException(
        'Các dòng đang ở khác cấp nhau - gửi từng nhóm một.',
      );
    }
    /*
      Chỉ NHIỆM VỤ mới phải cùng một ngày báo cáo. Bảng khối A chốt theo tháng,
      không có ngày báo cáo của riêng nó - nó đi kèm lượt gửi của ngày nào thì
      mang ngày đó, nên không tham gia phép kiểm này.
    */
    const dates = new Set(items.map((item) => item.reportDate));
    if (dates.size > 1) {
      throw new BadRequestException(
        'Các nhiệm vụ thuộc nhiều ngày báo cáo - gửi từng ngày một.',
      );
    }

    const currentLevel = moving[0]!.holderLevel;
    const sourceSubmissionIds = [
      ...new Set(
        moving
          .map((doc) => doc.currentSubmissionId)
          .filter((id): id is Types.ObjectId => Boolean(id))
          .map((id) => String(id)),
      ),
    ].map((id) => new Types.ObjectId(id));

    /*
      Ngày của lượt gửi lấy theo nhiệm vụ. Lượt chỉ có bảng khối A thì bảng
      không mang ngày nào - dùng ngày lượt gửi TRƯỚC của chính nó để lượt mới
      vẫn nằm đúng chỗ trong hộp đến, chứ không nhảy sang hôm nay.
    */
    const forwardDate =
      items[0]?.reportDate ??
      (
        await this.submissionModel
          .findOne({ criteriaSheetIds: { $in: sheetIds } })
          .sort({ createdAt: -1 })
          .select('reportDate')
      )?.reportDate ??
      serverDateYmd();

    return this.createSubmission({
      level: currentLevel + 1,
      sender: actor,
      target,
      note,
      reportDate: forwardDate,
      items,
      sheets,
      sourceSubmissionIds,
      message: (count, sheetCount) => {
        const parts = [
          count ? `${count} nhiệm vụ` : '',
          sheetCount ? `${sheetCount} bảng khối A` : '',
        ]
          .filter(Boolean)
          .join(' và ');
        return `Đã gửi ${parts} lên ${target.name}.`;
      },
    });
  }

  // ============================================================ cấp trên duyệt

  /** Duyệt hoặc trả lại nhiều dòng đã tích trong bảng tổng. */
  async review(userId: string, dto: ReviewPersonalMissionDto) {
    const actor = await this.requireActor(userId);
    const ids = (dto.itemIds ?? []).map((id) =>
      this.requireObjectId(id, 'Nhiệm vụ'),
    );
    const sheetIds = (dto.criteriaSheetIds ?? []).map((id) =>
      this.requireObjectId(id, 'Bảng khối A'),
    );
    if (!ids.length && !sheetIds.length) {
      throw new BadRequestException('Chưa tích dòng nào để duyệt.');
    }

    // Chốt hoàn thành áp cho việc đã duyệt; duyệt/trả lại áp cho việc đang chờ.
    const allowed: PersonalMissionReviewStatus[] =
      dto.decision === 'COMPLETE' ? ['PENDING', 'APPROVED'] : ['PENDING'];

    const holding = {
      currentRecipientId: actor.id,
      reviewStatus: { $in: allowed },
    };
    const [items, sheets] = await Promise.all([
      ids.length
        ? this.itemModel.find({ _id: { $in: ids }, ...holding })
        : Promise.resolve([]),
      sheetIds.length
        ? this.criteriaSheetModel.find({ _id: { $in: sheetIds }, ...holding })
        : Promise.resolve([]),
    ]);
    if (!items.length && !sheets.length) {
      throw new BadRequestException(
        dto.decision === 'COMPLETE'
          ? 'Không có dòng nào ở chỗ bạn để chốt hoàn thành.'
          : 'Không có dòng nào đang chờ bạn duyệt.',
      );
    }

    const now = new Date();
    const touched: SubmittableDoc[] = [...items, ...sheets];
    /** Câu đếm cho thông báo - "3 nhiệm vụ và 1 bảng khối A". */
    const countText = [
      items.length ? `${items.length} nhiệm vụ` : '',
      sheets.length ? `${sheets.length} bảng khối A` : '',
    ]
      .filter(Boolean)
      .join(' và ');

    if (dto.decision === 'COMPLETE') {
      /*
        Không chặn theo tiến độ nữa: chỉ huy được chốt ở bất kỳ mức nào - việc
        dừng giữa chừng vẫn phải khoá sổ và tính điểm theo thực tế. Cảnh báo
        "chưa đủ 100%" đặt ở giao diện, ngay trước lúc bấm.
      */
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
      for (const sheet of sheets) {
        sheet.reviewStatus = 'COMPLETED';
        sheet.returnReason = '';
        sheet.lastDecidedById = actor.id;
        sheet.lastDecidedAt = now;
        this.appendLog(sheet, { type: 'COMPLETE', actor, at: now });
        await sheet.save();
      }
      await this.closeSubmissionsIfSettled(touched);
      return {
        message: `Đã chốt hoàn thành ${countText}.`,
        data: { count: items.length, criteriaCount: sheets.length },
      };
    }

    const reason = dto.reason?.trim() ?? '';
    if (!reason) {
      throw new BadRequestException('Lý do trả lại là bắt buộc.');
    }

    // Trả lại rơi về đúng người đã gửi lượt đó, không nhảy thẳng xuống cán bộ.
    for (const doc of touched) {
      const backTo = doc.lastSenderId ?? doc.ownerId;
      const backDept = doc.lastSenderDepartmentId ?? doc.ownerDepartmentId;
      doc.reviewStatus = 'RETURNED';
      doc.returnReason = reason;
      doc.lastDecidedById = actor.id;
      doc.lastDecidedAt = now;
      doc.holderLevel = Math.max(0, doc.holderLevel - 1);
      doc.currentRecipientId = backTo;
      doc.currentRecipientDepartmentId = backDept;
      // Lý do trả lại lần này ghi vào nhật ký; trường returnReason chỉ giữ lần
      // gần nhất nên không đủ để đọc lại lịch sử.
      this.appendLog(doc, { type: 'RETURN', actor, note: reason, at: now });
      await doc.save();
    }
    await this.closeSubmissionsIfSettled(touched);

    return {
      message: `Đã trả lại ${countText}.`,
      data: { count: items.length, criteriaCount: sheets.length },
    };
  }

  /**
   * Cấp trên sửa nội dung nhiệm vụ đang nằm ở tay mình - luôn lưu vết.
   *
   * Sửa được MỌI trường: trục, nội dung công việc, và mọi ô của mẫu (tên nhiệm
   * vụ, điểm chuẩn, hạn, ghi chú...). Đổi trục thì mẫu bảng cũng phải đóng dấu
   * lại theo trục mới, nếu không nhiệm vụ sẽ mang bộ cột của trục cũ.
   *
   * Mọi thay đổi vào cả hai chỗ: `edits` để tra cứu chi tiết, và một mốc EDIT
   * trong nhật ký để hiện ngay ở "Nhật ký theo ngày" của nhiệm vụ.
   */
  async reviewerEdit(
    userId: string,
    id: string,
    dto: ReviewerEditPersonalMissionDto,
  ) {
    const actor = await this.requireActor(userId);
    const item = await this.itemModel.findById(
      this.requireObjectId(id, 'Nhiệm vụ'),
    );
    if (!item) throw new NotFoundException('Không tìm thấy nhiệm vụ.');

    /*
      Hai đường được sửa:

      - Nhiệm vụ ĐANG chờ quyết ở chỗ mình: đường thường ngày, sửa rồi chốt.
      - Nhiệm vụ ĐÃ CHỐT hoàn thành: chỉ cấp trên trong nhánh đơn vị của cán bộ
        mới đụng được, và phải hiểu là đang đổi số đã vào bảng nhiệm vụ - điểm trục,
        thống kê, mọi báo cáo tổng hợp chứa nhiệm vụ này đều đổi theo. Vì vậy
        vẫn bắt nêu lý do và vẫn ghi vào nhật ký như mọi lần sửa khác.
    */
    if (item.reviewStatus === 'COMPLETED') {
      const branch = actor.departmentId
        ? await this.departmentSubtreeIds(actor.departmentId)
        : [];
      const ownerDept = item.ownerDepartmentId;
      const inBranch =
        ownerDept && branch.some((deptId) => deptId.equals(ownerDept));
      if (!inBranch) {
        throw new BadRequestException(
          'Nhiệm vụ đã chốt hoàn thành - chỉ cấp trên trong nhánh đơn vị của cán bộ mới sửa được.',
        );
      }
    } else {
      if (String(item.currentRecipientId ?? '') !== String(actor.id)) {
        throw new NotFoundException('Không tìm thấy nhiệm vụ ở chỗ bạn.');
      }
      if (item.holderLevel < 1) {
        throw new BadRequestException(
          'Nhiệm vụ đang ở chỗ cán bộ - để cán bộ tự sửa.',
        );
      }
    }

    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Lý do sửa là bắt buộc.');
    }

    const template = await this.trackingTemplateOf(item);
    const changes = await this.diffContent(item, dto, template);
    if (!changes.length) {
      throw new BadRequestException('Không có thay đổi nào để lưu.');
    }

    if (dto.axisId !== undefined || dto.workContentId !== undefined) {
      const { axis, workContent } = await this.requireAxisAndContent(
        dto.axisId ?? String(item.axisId),
        dto.workContentId ?? String(item.workContentId),
      );
      const axisChanged = String(item.axisId) !== String(axis._id);
      item.axisId = axis._id;
      item.workContentId = workContent._id;
      if (axisChanged) {
        // Đóng dấu lại mẫu của trục mới: xoá dấu cũ rồi để stampTemplates chạy.
        item.formTemplateId = null;
        item.formTemplateVersion = null;
        await this.stampTemplates([item]);
      }
    }

    await this.applyContent(item, dto);
    // Cấp trên sửa cột chất lượng thì điểm tự chấm phải chạy lại theo.
    await this.applyDerivedColumns([item]);
    this.dropStaleReviewValues(item, dto, template);

    const now = new Date();
    item.edits.push({
      byId: actor.id,
      byName: actor.name,
      byDepartmentId: actor.departmentId,
      level: item.holderLevel,
      changes,
      reason,
      at: now,
    });
    this.appendLog(item, {
      type: 'EDIT',
      actor,
      note: reason,
      at: now,
      changes: changes.map((change) => ({
        field: 'content' as const,
        detail: change.label,
        from: this.changeText(change.from),
        to: this.changeText(change.to),
      })),
    });
    await item.save();

    return {
      message: `Đã sửa ${changes.length} trường và lưu vết.`,
      data: item,
    };
  }

  /**
   * Ô nào vừa bị sửa thì bỏ luôn số chỉ huy đã chấm cho ô đó.
   *
   * `cellNumber` ưu tiên đọc `reviewValues`, nên giữ lại số chốt cũ là sửa xong
   * mà bảng vẫn hiện số cũ - người sửa tưởng mình bấm hụt. Bỏ cả ô tự tính ăn
   * theo (điểm tự chấm quy từ % vừa sửa), vì số cũ của nó cũng hết đúng.
   */
  private dropStaleReviewValues(
    item: PersonalMissionItemDocument,
    dto: ReviewerEditPersonalMissionDto,
    template?: TrackingTemplate | null,
  ) {
    const touched = new Set([
      ...Object.keys(dto.fieldValues ?? {}),
      ...Object.keys(dto.catalogValues ?? {}),
    ]);
    if (!touched.size) return;

    for (const column of template?.columns ?? []) {
      const auto = column.autoValue;
      if (!auto) continue;
      if (
        touched.has(auto.percentColumnKey) ||
        touched.has(auto.baseColumnKey)
      ) {
        touched.add(column.key);
      }
    }

    const reviewValues = { ...(item.reviewValues ?? {}) };
    const reviewCatalogValues = { ...(item.reviewCatalogValues ?? {}) };
    let changed = false;
    for (const key of touched) {
      if (key in reviewValues) {
        delete reviewValues[key];
        changed = true;
      }
      if (key in reviewCatalogValues) {
        delete reviewCatalogValues[key];
        changed = true;
      }
    }
    if (!changed) return;

    item.reviewValues = reviewValues;
    item.reviewCatalogValues = reviewCatalogValues;
    item.markModified('reviewValues');
    item.markModified('reviewCatalogValues');
  }

  /** Giá trị trong nhật ký chỉ là chữ - ô trống ghi rỗng chứ không ghi "null". */
  private changeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  // ======================================================= bảng tổng theo trục

  /**
   * Bảng tổng của cấp trên: mọi nhiệm vụ đang nằm ở tay mình, gom
   * Trục → Nội dung công việc → dòng, kèm bộ cột của mẫu đã khoá lúc gửi.
   */
  async board(userId: string, query: PersonalMissionBoardQueryDto) {
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

    if (query.axisId)
      filter.axisId = this.requireObjectId(query.axisId, 'Trục');
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
      .populate('workContentId', 'code name description note sortOrder')
      .populate('ownerId', 'fullName username')
      .populate('ownerDepartmentId', 'code name')
      .populate('lastSenderId', 'fullName username')
      .populate('lastSenderDepartmentId', 'code name');

    const axes = await this.groupRowsByAxis(rows);
    const criteria = await this.boardCriteria(filter);

    // Đếm theo TOÀN BỘ việc đang ở chỗ mình, không theo bộ lọc trạng thái đang
    // xem - để thanh tab luôn nói được còn bao nhiêu việc đã duyệt chờ gửi lên.
    const countFilter = { ...filter };
    delete countFilter.reviewStatus;
    const countRows = await this.itemModel.aggregate<{
      _id: PersonalMissionReviewStatus;
      total: number;
    }>([
      { $match: countFilter },
      { $group: { _id: '$reviewStatus', total: { $sum: 1 } } },
    ]);
    // Bảng khối A đếm chung vào thanh tab: đếm sót thì tab "Chờ duyệt" hiện 0
    // trong khi vẫn còn một bảng A nằm đó chờ.
    const criteriaCountRows = await this.criteriaSheetModel.aggregate<{
      _id: PersonalMissionReviewStatus;
      total: number;
    }>([
      { $match: this.criteriaBoardFilter(countFilter) },
      { $group: { _id: '$reviewStatus', total: { $sum: 1 } } },
    ]);
    const countMap = new Map(countRows.map((row) => [row._id, row.total]));
    for (const row of criteriaCountRows) {
      countMap.set(row._id, (countMap.get(row._id) ?? 0) + row.total);
    }
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
        criteria,
        counts,
        canForwardUp,
        rowCount: rows.length,
        truncated: rows.length >= BOARD_MAX_ROWS,
      },
    };
  }

  /**
   * Bộ lọc bảng tổng, dịch sang thứ bảng khối A hiểu được.
   *
   * Bảng khối A không có trục, không có nội dung công việc, và không có ô chữ
   * để tìm từ khoá - lọc theo mấy thứ đó thì phải giấu khối A đi chứ không phải
   * trả về bảng rỗng, nếu không người dùng lọc theo trục lại tưởng mất bảng.
   *
   * Nó cũng không có NGÀY báo cáo, chỉ có kỳ tháng: lọc ngày phải quy sang lọc
   * tháng, giữ nguyên thì mọi bộ lọc ngày đều không khớp bảng nào.
   */
  private criteriaBoardFilter(filter: Record<string, unknown>) {
    const {
      axisId: _axisId,
      workContentId: _workContentId,
      $expr: _expr,
      reportDate,
      ...rest
    } = filter;

    if (typeof reportDate === 'string') {
      return { ...rest, periodMonth: serverMonth(reportDate) };
    }
    if (reportDate && typeof reportDate === 'object') {
      const bounds = reportDate as { $gte?: string; $lte?: string };
      const periodMonth: Record<string, string> = {};
      if (bounds.$gte) periodMonth.$gte = serverMonth(bounds.$gte);
      if (bounds.$lte) periodMonth.$lte = serverMonth(bounds.$lte);
      return Object.keys(periodMonth).length ? { ...rest, periodMonth } : rest;
    }
    return rest;
  }

  /** Các bảng khối A đang nằm ở chỗ tôi, kèm bộ cột để dựng bảng. */
  private async boardCriteria(filter: Record<string, unknown>) {
    // Lọc theo trục hoặc nội dung công việc thì khối A không thuộc phạm vi hỏi.
    if (filter.axisId || filter.workContentId || filter.$expr) return null;

    const sheets = await this.criteriaSheetModel
      .find(this.criteriaBoardFilter(filter))
      .sort({ periodMonth: -1, createdAt: 1 })
      .limit(BOARD_MAX_ROWS)
      .populate('ownerId', 'fullName username')
      .populate('ownerDepartmentId', 'code name')
      .populate('lastSenderId', 'fullName username')
      .populate('lastSenderDepartmentId', 'code name');
    if (!sheets.length) return null;

    /*
      Tách theo phiên bản mẫu như `groupRowsByAxis` làm với trục: mẫu đổi giữa
      chừng thì bảng gửi trước vẫn dựng đúng bộ cột của thời điểm gửi.
    */
    const blocks = new Map<
      string,
      {
        formTemplateId: string | null;
        formTemplateVersion: number | null;
        template: Awaited<ReturnType<typeof this.criteriaTemplateOf>>;
        sheets: typeof sheets;
      }
    >();
    for (const sheet of sheets) {
      const key = `${String(sheet.formTemplateId ?? 'live')}:${
        sheet.formTemplateVersion ?? 'live'
      }`;
      let block = blocks.get(key);
      if (!block) {
        block = {
          formTemplateId: sheet.formTemplateId
            ? String(sheet.formTemplateId)
            : null,
          formTemplateVersion: sheet.formTemplateVersion ?? null,
          template: await this.criteriaTemplateOf(sheet),
          sheets: [],
        };
        blocks.set(key, block);
      }
      block.sheets.push(sheet);
    }

    /*
      Ghi chú của tiêu chí không nằm trong bản chụp của bảng (nó là chữ mô tả,
      không phải số để chấm) nhưng chỉ huy cần đọc nó mới biết trừ điểm theo
      căn cứ nào - trả kèm một bảng tra dùng chung cho mọi khối.
    */
    const criterionIds = [
      ...new Set(
        sheets.flatMap((sheet) =>
          sheet.rows.map((row) => String(row.criterionId)),
        ),
      ),
    ].map((id) => new Types.ObjectId(id));
    const criterionNotes = Object.fromEntries(
      (
        await this.criterionModel
          .find({ _id: { $in: criterionIds } })
          .select('note')
      ).map((row) => [String(row._id), row.note ?? '']),
    );

    return [...blocks.values()].map((block) => ({
      formTemplateId: block.formTemplateId,
      formTemplateVersion: block.formTemplateVersion,
      template: block.template,
      criterionNotes,
      sheets: block.sheets,
    }));
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
    query: PersonalMissionReportsQueryDto,
  ) {
    const actor = await this.requireActor(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter: Record<string, unknown> = { recipientId: actor.id };

    const range: Record<string, string> = {};
    if (query.fromDate)
      range.$gte = this.requireYmd(query.fromDate, 'fromDate');
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

  private countIf(status: PersonalMissionReviewStatus) {
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
    items: PersonalMissionItemDocument[];
    /** Bảng khối A đi kèm lượt này - rỗng là lượt chỉ có nhiệm vụ. */
    sheets?: PersonalMissionCriteriaSheetDocument[];
    sourceSubmissionIds: Types.ObjectId[];
    message: (count: number, sheetCount: number) => string;
  }) {
    const { level, sender, target, note, reportDate, items } = input;
    const sheets = input.sheets ?? [];
    const itemIds = items.map((item) => item._id as Types.ObjectId);
    const sheetIds = sheets.map((sheet) => sheet._id as Types.ObjectId);
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
      criteriaSheetIds: sheetIds,
      sourceSubmissionIds: input.sourceSubmissionIds,
      note,
      status: 'PENDING' as const,
    });

    // Bảng khối A đi cùng chuỗi với nhiệm vụ nên nhận đúng bộ trường vị trí -
    // lệch một trường là bảng tổng của cấp trên không nhìn thấy nó nữa.
    const move = {
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
      ...(level > 1 ? { lastDecidedById: sender.id, lastDecidedAt: now } : {}),
    };

    if (itemIds.length) {
      await this.itemModel.updateMany(
        { _id: { $in: itemIds } },
        { $set: move },
      );
    }
    if (sheetIds.length) {
      await this.criteriaSheetModel.updateMany(
        { _id: { $in: sheetIds } },
        { $set: move },
      );
    }

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
    for (const sheet of sheets) {
      // Bảng A không có phần trăm tiến độ - mốc chỉ ghi ai gửi cho ai, lúc nào.
      this.appendLog(sheet, {
        type: 'SUBMIT',
        actor: sender,
        toName: target.name,
        note,
        level,
        at: now,
      });
      await sheet.save();
    }

    return {
      message: input.message(items.length, sheets.length),
      data: {
        submissionId: String(submission._id),
        reportDate,
        level,
        sentCount: items.length,
        criteriaSentCount: sheets.length,
        recipientId: String(target.id),
        recipientName: target.name,
      },
    };
  }

  /**
   * Lượt gửi không còn thứ gì chờ duyệt thì đánh dấu đã xử lý xong.
   * Đếm cả nhiệm vụ lẫn bảng khối A: chỉ đếm một loại thì lượt gửi kèm bảng A
   * bị đóng sớm ngay khi duyệt xong phần nhiệm vụ.
   */
  private async closeSubmissionsIfSettled(docs: SubmittableDoc[]) {
    const ids = [
      ...new Set(
        docs
          .map((doc) => doc.currentSubmissionId)
          .filter((id): id is Types.ObjectId => Boolean(id))
          .map((id) => String(id)),
      ),
    ];

    for (const id of ids) {
      const submissionId = new Types.ObjectId(id);
      const [pendingItems, pendingSheets] = await Promise.all([
        this.itemModel.countDocuments({
          currentSubmissionId: submissionId,
          reviewStatus: 'PENDING',
        }),
        this.criteriaSheetModel.countDocuments({
          currentSubmissionId: submissionId,
          reviewStatus: 'PENDING',
        }),
      ]);
      if (pendingItems === 0 && pendingSheets === 0) {
        await this.submissionModel.updateOne(
          { _id: submissionId },
          { $set: { status: 'REVIEWED' } },
        );
      }
    }
  }

  /** Chốt mẫu bảng cho các nhiệm vụ chưa từng gửi. */
  private async stampTemplates(items: PersonalMissionItemDocument[]) {
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
  private async applyDerivedColumns(items: PersonalMissionItemDocument[]) {
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

    /*
      Nhiệm vụ được chọn có thể mang điểm chuẩn riêng - cùng một mục nhưng cấp
      ghi nhận khác nhau thì điểm khác nhau (Bộ Công an 03 điểm, Công an tỉnh
      01-02...). Có thì lấy của nhiệm vụ, không thì mới lùi về nội dung.
    */
    const taskIds = new Set<string>();
    for (const item of items) {
      for (const value of Object.values(item.catalogValues ?? {})) {
        if (value?.id) taskIds.add(value.id);
      }
    }
    const workTasks = taskIds.size
      ? await this.workTaskModel
          .find({
            _id: { $in: [...taskIds].map((id) => new Types.ObjectId(id)) },
          })
          .select('scoreGroupId')
      : [];
    const groupIdByTask = new Map(
      workTasks.map((row) => [
        String(row._id),
        row.scoreGroupId ? String(row.scoreGroupId) : '',
      ]),
    );

    // Tên nhóm điểm chép vào catalogValues; phần trăm tra theo mức đã chọn.
    const groupIds = [
      ...new Set([...groupIdByContent.values(), ...groupIdByTask.values()]),
    ].filter(Boolean);
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

      /*
        Điểm chuẩn ưu tiên theo NHIỆM VỤ đã chọn; nhiệm vụ không khai riêng thì
        mới lấy của nội dung công việc.
      */
      const taskId = template.columns
        .filter((column) => column.semanticKey === 'work_task')
        .map((column) => catalogValues[column.key]?.id)
        .find(Boolean);
      const groupId =
        (taskId ? groupIdByTask.get(taskId) : '') ||
        groupIdByContent.get(String(item.workContentId)) ||
        '';
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
  private async assertWorkContentScoreGroups(
    items: PersonalMissionItemDocument[],
  ) {
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
        'Báo quản trị bổ sung trong Cấu hình form nhiệm vụ › Nội dung công việc.',
    );
  }

  /**
   * Cột super admin tích "bắt buộc" trong mẫu phải có dữ liệu trước khi gửi.
   * Kiểm ở đây chứ không chỉ ở client, vì cờ required chỉ có nghĩa khi server
   * thật sự chặn.
   */
  private async assertRequiredColumnsFilled(
    items: PersonalMissionItemDocument[],
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
   * Thêm một mốc vào nhật ký của nhiệm vụ hoặc của bảng khối A.
   *
   * Mọi loại mốc (cập nhật, gửi, trả lại, chốt) nằm chung một mảng để màn hình
   * dựng được một dòng thời gian duy nhất - tách bảng riêng cho từng loại thì
   * ghép lại lúc hiển thị vừa tốn truy vấn vừa dễ lệch thứ tự.
   */
  private appendLog(
    item: LoggableDoc,
    entry: {
      type: PersonalMissionLogType;
      actor: { id: Types.ObjectId; name: string };
      percent?: number | null;
      note?: string;
      toName?: string;
      level?: number;
      changes?: PersonalMissionProgressChange[];
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

  /** Phần trăm tiến độ hiện tại của từng nhiệm vụ, tra theo id. */
  private async progressPercentOf(items: PersonalMissionItemDocument[]) {
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
    item: PersonalMissionItemDocument,
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
   * Ghi một ô theo dõi. Ô chọn mức lưu vào catalogValues kèm tên chép sẵn, ô số
   * lưu vào fieldValues sau khi kẹp về 0-100.
   */
  private async writeTrackingValue(
    column: { key: string; semanticKey: string; title: string },
    raw: string | undefined,
    fieldValues: Record<string, string | number>,
    catalogValues: Record<string, PersonalMissionCatalogValue>,
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
    dto: UpdatePersonalMissionProgressDto,
  ) {
    const item = await this.requireOwned(ownerId, id);
    if (item.reviewStatus === 'COMPLETED') {
      throw new BadRequestException(
        'Nhiệm vụ đã chốt hoàn thành - không cập nhật tiến độ nữa.',
      );
    }

    const template = await this.trackingTemplateOf(item);
    const columns = resolveTrackingColumns(template);
    /*
      Trục chấm theo mục (công thức cộng dồn) không có cột phần trăm nào: cập
      nhật của cán bộ là khai điểm ở cột Đạt hoặc tích ô Không đạt. Chỉ khi mẫu
      không có cả hai loại cột thì mới thật sự không cập nhật được.
    */
    const results = resolveResultColumns(template);
    const hasResultColumns =
      results.scores.length > 0 || results.flags.length > 0;
    if (!columns.progress && !hasResultColumns) {
      throw new BadRequestException(
        'Mẫu nhiệm vụ của trục này chưa có cột tiến độ nên chưa cập nhật được. Liên hệ quản trị để bổ sung cột.',
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
    /** Giá trị cũ của các ô kết quả - để dựng danh sách "đã đổi những gì". */
    const resultBefore = new Map(
      [...results.scores, ...results.flags].map((column) => [
        column.key,
        String(fieldValues[column.key] ?? '').trim(),
      ]),
    );

    if (columns.progress) {
      await this.writeTrackingValue(
        columns.progress,
        dto.progress,
        fieldValues,
        catalogValues,
      );
    }

    /*
      Ô kết quả: chỉ nhận đúng cột nằm trong công thức cộng dồn và ô tích của
      mẫu. Client gửi khoá lạ thì bỏ qua chứ không ghi bừa vào nhiệm vụ.
    */
    if (dto.results) {
      const allowed = new Map(
        [...results.scores, ...results.flags].map((column) => [
          column.key,
          column,
        ]),
      );
      for (const [key, raw] of Object.entries(dto.results)) {
        const column = allowed.get(key);
        if (!column) continue;
        const value = String(raw ?? '').trim();
        if (column.dataType === 'boolean') {
          // Ô tích lưu "1"; bỏ tích thì xoá hẳn khoá cho ô trống là ô trống.
          if (value === '1' || value === 'true') fieldValues[key] = '1';
          else delete fieldValues[key];
          continue;
        }
        if (!value) {
          delete fieldValues[key];
          continue;
        }
        const parsed = Number(value.replace(',', '.'));
        if (!Number.isFinite(parsed)) {
          throw new BadRequestException(
            `Giá trị cột "${column.title}" phải là số.`,
          );
        }
        fieldValues[key] = parsed;
      }
    }

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
    const changes: PersonalMissionProgressChange[] = [];
    const pushChange = (
      field: PersonalMissionProgressField,
      from: string,
      to: string,
      detail = '',
    ) => {
      if (from !== to) changes.push({ field, from, to, detail });
    };
    const percentText = (value: number | null) =>
      value === null ? '' : String(value);

    pushChange('progress', percentText(percentBefore), percentText(percentNow));
    // Ô kết quả ghi kèm TÊN CỘT ở `detail`: mẫu mỗi trục một bộ cột, nhật ký
    // không có tên thì đọc lại chỉ thấy "đổi 0 thành 2".
    for (const [key, before] of resultBefore) {
      const column = [...results.scores, ...results.flags].find(
        (entry) => entry.key === key,
      );
      pushChange(
        'result',
        before,
        String(item.fieldValues?.[key] ?? '').trim(),
        column?.title ?? '',
      );
    }
    if (columns.quality) {
      pushChange(
        'quality',
        percentText(qualityBefore),
        percentText(readItemPercent(item, columns.quality, percentByLevelId)),
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
    /*
      Người phối hợp đổi được ngay trong lượt cập nhật tiến độ: người cùng làm
      thường chỉ lộ ra lúc chạy việc, bắt quay về form khai lại từ đầu chỉ để
      thêm một cái tên là vô lý.

      Nhật ký ghi TÊN chứ không ghi id - đọc lại mới biết ai vừa được thêm vào.
    */
    if (dto.collaboratorIds !== undefined) {
      const before = (item.collaborators ?? [])
        .map((person) => person.name)
        .join(', ');
      item.collaborators = await this.resolveCollaborators(
        dto.collaboratorIds,
        item.ownerId,
      );
      item.markModified('collaborators');
      pushChange(
        'collaborators',
        before,
        item.collaborators.map((person) => person.name).join(', '),
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
      { path: 'workContentId', select: 'code name description note' },
    ]);

    return { message: 'Đã cập nhật tiến độ.', data: item };
  }

  /**
   * Chỉ huy chấm điểm rồi chốt hoàn thành trong một thao tác.
   *
   * Điểm chấm ghi vào `reviewValues` chứ không đè lên ô của cán bộ: số tự chấm
   * phải còn để đối chiếu. Công thức tính điểm trục vẫn y nguyên như cấu hình,
   * chỉ khác nguồn đọc - ô nào chỉ huy đã chấm thì lấy số đó.
   *
   * Không đòi tiến độ phải đủ 100%: nhiệm vụ dừng giữa chừng vẫn phải khoá sổ
   * và ăn điểm theo phần đã làm. Giao diện cảnh báo trước khi chỉ huy bấm chốt.
   */
  async scoreAndComplete(
    userId: string,
    id: string,
    dto: ScorePersonalMissionDto,
  ) {
    const actor = await this.requireActor(userId);
    const item = await this.itemModel.findOne({
      _id: this.requireObjectId(id, 'Nhiệm vụ'),
      currentRecipientId: actor.id,
      reviewStatus: { $in: ['PENDING', 'APPROVED'] },
    });
    if (!item) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ đang chờ bạn chốt.');
    }

    const template = await this.trackingTemplateOf(item);
    const scoreColumns = resolveScoreColumns(template);
    /*
      Trục chấm theo mục (Đạt / Không đạt) không có công thức tỉ lệ: chỉ huy
      chấm thẳng vào ô điểm và ô tích - hạ điểm, hoặc tích Không đạt là 0 điểm.
    */
    const resultColumns = resolveResultColumns(template);
    if (!scoreColumns.entries.length && !resultColumns.scores.length) {
      throw new BadRequestException(
        'Mẫu nhiệm vụ của trục này chưa cấu hình công thức điểm nên chưa chấm được. Cấu hình tại Cấu hình form nhiệm vụ › Mẫu bảng nhiệm vụ.',
      );
    }

    // Chỉ nhận đúng các cột chấm được - gửi thừa khoá khác thì bỏ qua.
    const allowed = new Map<string, FormTemplateColumn>();
    for (const entry of scoreColumns.entries) {
      allowed.set(entry.score.key, entry.score);
      if (entry.percent) allowed.set(entry.percent.key, entry.percent);
    }
    for (const column of [...resultColumns.scores, ...resultColumns.flags]) {
      allowed.set(column.key, column);
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

      // Ô tích "Không đạt": lưu "1", bỏ tích thì xoá hẳn khoá.
      if (column.dataType === 'boolean') {
        if (value === '1' || value === 'true') reviewValues[key] = '1';
        else delete reviewValues[key];
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
      Không đạt thì KHÔNG có điểm - ép mọi ô điểm của trục chấm theo mục về 0.
      Để chỉ huy vừa tích "Không đạt" vừa để nguyên điểm cũ thì công thức cộng
      dồn vẫn cộng số điểm đó vào tổng trục.
    */
    const failed = resultColumns.flags.some(
      (column) =>
        String(
          reviewValues[column.key] ?? item.fieldValues?.[column.key] ?? '',
        ) === '1',
    );
    if (failed) {
      for (const column of resultColumns.scores) reviewValues[column.key] = 0;
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
        reviewValues[auto.baseColumnKey] ??
          item.fieldValues?.[auto.baseColumnKey],
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
  private async assertScoreRangesValid(items: PersonalMissionItemDocument[]) {
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

      const columnByKey = new Map(
        template.columns.map((column) => [column.key, column]),
      );

      for (const column of template.columns) {
        if (!column.visible || !column.rangeFromColumnKey) continue;

        /*
          Trần lấy từ cột Điểm tối đa của tiêu chí ở CÙNG DÒNG: điểm đạt không
          được vượt điểm tối đa. Chưa chọn tiêu chí thì chưa có trần để so, để
          yên - bắt lỗi lúc đó là bắt người ta nhập ngược thứ tự.
        */
        const source = columnByKey.get(column.rangeFromColumnKey);
        if (source?.semanticKey === 'criterion_max_score') {
          const raw = item.fieldValues?.[column.key];
          if (raw === undefined || raw === null || String(raw).trim() === '') {
            continue;
          }
          const score = Number(raw);
          if (!Number.isFinite(score)) {
            problems.push(
              `dòng ${index + 1} - "${column.title}" không phải số`,
            );
            continue;
          }
          const ceiling = Number(item.fieldValues?.[column.rangeFromColumnKey]);
          if (!Number.isFinite(ceiling)) continue;
          if (score < 0 || score > ceiling) {
            problems.push(
              `dòng ${index + 1} - "${column.title}" = ${score}, phải trong khoảng 0 - ${ceiling} của "${source.title}"`,
            );
          }
          continue;
        }

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
      throw new BadRequestException(
        `Điểm không hợp lệ - ${problems.join('; ')}.`,
      );
    }
  }

  private isColumnEmpty(
    item: PersonalMissionItemDocument,
    column: { semanticKey: string; key: string; dataType: string },
  ): boolean {
    switch (column.semanticKey) {
      case 'score_group':
      case 'quality_level':
      case 'work_task':
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
  async groupRowsByAxis(rows: PersonalMissionItemDocument[]) {
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
            rows: PersonalMissionItemDocument[];
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
          formTemplateId: row.formTemplateId
            ? String(row.formTemplateId)
            : null,
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

  // ================================================ khối A - báo cáo cá nhân

  /**
   * Bảng khối A của một THÁNG, kèm vị trí của nó trong chuỗi gửi duyệt.
   *
   * Nhận cả YYYY-MM lẫn YYYY-MM-DD: màn nhập luôn đứng ở một ngày cụ thể, bắt
   * nó tự cắt ra tháng thì chỗ nào quên cắt là tra nhầm sang một kỳ không có.
   *
   * Bảng CÒN Ở CHỖ CÁN BỘ thì ghép với danh mục tiêu chí đang hoạt động: tiêu
   * chí mới thêm phải hiện ra để chấm, tiêu chí đã ngừng thì không bày nữa -
   * điểm cũ vẫn nằm nguyên trong bản ghi, không xoá đi.
   *
   * Bảng ĐÃ GỬI thì vẽ thuần từ bản đã lưu. Ghép tiếp là tiêu chí mới mọc vào
   * một bảng người ta đã trình lên, và cấp trên duyệt một bảng khác với bảng
   * cán bộ đã ký.
   */
  async getCriteriaSheet(userId: string, period?: string) {
    const actor = await this.requireActor(userId);
    const periodMonth = this.resolveCriteriaPeriod(period);

    const sheet = await this.criteriaSheetModel.findOne({
      ownerId: actor.id,
      periodMonth,
    });

    return {
      message: 'OK',
      data: {
        period: periodMonth,
        ...this.criteriaSheetState(sheet),
        /*
          Trả kèm bộ cột thay vì để client tự đi lấy mẫu đang bật: bảng đã gửi
          phải vẽ theo mẫu ĐÃ KHOÁ của nó. Client đọc mẫu live thì admin đổi
          cột giữa chừng là màn hình bày một bảng khác với bảng server đang
          kiểm, và ô của cột lạ bị bỏ im lặng lúc lưu.
        */
        template: await this.criteriaTemplateOf(sheet),
        rows: await this.buildCriteriaRows(sheet),
      },
    };
  }

  /**
   * Các bảng khối A của tôi trong một khoảng ngày, mỗi THÁNG một dòng tóm tắt.
   *
   * Nhận khoảng NGÀY rồi tự quy ra khoảng tháng: mọi màn hình gọi nó đều đang
   * lọc theo ngày, bắt chúng tự đổi sang tháng thì chỗ nào quên là mất dòng.
   * Xem một tuần vắt qua hai tháng thì ra hai bảng, đúng như thực tế.
   *
   * Điểm tổng và tiến độ chấm tính sẵn ở server - client không biết cột nào là
   * cột điểm của mẫu, và mỗi màn tự cộng thì mỗi màn ra một số.
   */
  async listCriteriaSheets(userId: string, fromDate?: string, toDate?: string) {
    const actor = await this.requireActor(userId);
    const range: Record<string, string> = {};
    if (fromDate) {
      range.$gte = serverMonth(this.requireYmd(fromDate, 'fromDate'));
    }
    if (toDate) range.$lte = serverMonth(this.requireYmd(toDate, 'toDate'));

    const sheets = await this.criteriaSheetModel
      .find({
        ownerId: actor.id,
        ...(Object.keys(range).length ? { periodMonth: range } : {}),
      })
      .sort({ periodMonth: -1 })
      .populate('currentRecipientId', 'fullName username');

    /** Cột điểm của mẫu, tra theo phiên bản - cả tuần thường chung một mẫu. */
    const columnCache = new Map<string, string[]>();
    /* Suy kiểu từ chính `criteriaSheetState` để hai chỗ không trôi lệch nhau. */
    const data: Array<
      Omit<
        ReturnType<PersonalMissionService['criteriaSheetState']>,
        'progressLogs'
      > & {
        period: string;
        totalScore: number;
        maxScore: number;
        scoredCount: number;
        rowCount: number;
        recipientName: string;
        updatedAt: Date | null;
      }
    > = [];

    for (const sheet of sheets) {
      const key = `${String(sheet.formTemplateId ?? 'live')}:${
        sheet.formTemplateVersion ?? 'live'
      }`;
      let scoreKeys = columnCache.get(key);
      if (!scoreKeys) {
        const columns = (await this.criteriaTemplateOf(sheet))?.columns ?? [];
        const maxScoreKeys = new Set(
          columns
            .filter((column) => column.semanticKey === 'criterion_max_score')
            .map((column) => column.key),
        );
        scoreKeys = columns
          .filter(
            (column) =>
              column.dataType === 'number' &&
              column.rangeFromColumnKey &&
              maxScoreKeys.has(column.rangeFromColumnKey),
          )
          .map((column) => column.key);
        columnCache.set(key, scoreKeys);
      }

      let totalScore = 0;
      let maxScore = 0;
      let scoredCount = 0;
      for (const row of sheet.rows) {
        maxScore += row.maxScore ?? 0;
        // Ô nào chỉ huy đã chấm thì lấy số đó - cùng luật với báo cáo tổng hợp.
        const values = { ...row.fieldValues, ...row.reviewValues };
        for (const scoreKey of scoreKeys) {
          const value = this.toNumberOrNull(values[scoreKey]);
          if (value !== null) totalScore += value;
        }
        /*
          "Đã chấm" tính theo CÓ ĐỘNG VÀO Ô NÀO KHÔNG, không theo riêng ô điểm:
          tiêu chí tích "Không đảm bảo" và để điểm 0 vẫn là đã đánh giá.
        */
        const touched =
          Object.values(values).some(
            (value) => value !== '' && value !== false && value !== null,
          ) || Object.keys(row.catalogValues ?? {}).length > 0;
        if (touched) scoredCount += 1;
      }

      const recipient = sheet.currentRecipientId as unknown as {
        fullName?: string;
        username?: string;
      } | null;

      // Nhật ký không đi kèm danh sách: mỗi bảng vài chục mốc, nhân với cả kỳ
      // là một phản hồi to gấp mấy lần thứ danh sách cần.
      const { progressLogs: _logs, ...state } = this.criteriaSheetState(sheet);

      data.push({
        ...state,
        period: sheet.periodMonth,
        totalScore,
        maxScore,
        scoredCount,
        rowCount: sheet.rows.length,
        recipientName: recipient?.fullName?.trim() || recipient?.username || '',
        updatedAt: sheet.updatedAt ?? null,
      });
    }

    return { message: 'OK', data };
  }

  /** Lưu nháp cả bảng khối A của một THÁNG - ghi đè nguyên bộ, không lưu vết. */
  async saveCriteriaSheet(userId: string, dto: SavePersonalCriteriaSheetDto) {
    const actor = await this.requireActor(userId);
    const periodMonth = this.resolveCriteriaPeriod(dto.period);

    /*
      Bảng đã gửi thì đường này đóng: ghi đè im lặng một bảng đang nằm ở tay
      cấp trên là sửa sau lưng người duyệt. Muốn đổi số thì đi đường cập nhật
      (`updateCriteriaSheet`) - đường đó ghi vết vào nhật ký.
    */
    const current = await this.criteriaSheetModel.findOne({
      ownerId: actor.id,
      periodMonth,
    });
    if (current && !OWNER_EDITABLE.includes(current.reviewStatus)) {
      throw new BadRequestException(
        current.reviewStatus === 'COMPLETED'
          ? 'Bảng khối A của tháng này đã chốt - không sửa được nữa.'
          : 'Bảng khối A đã gửi lên trên - dùng "Cập nhật" để sửa, mọi thay đổi sẽ được ghi vào nhật ký.',
      );
    }

    const rows = this.withPriorReview(
      await this.buildCriteriaRowValues(dto.rows, current, 'catalog'),
      current,
    );

    await this.criteriaSheetModel.updateOne(
      { ownerId: actor.id, periodMonth },
      {
        $set: { rows, ownerDepartmentId: actor.departmentId },
        $setOnInsert: { ownerId: actor.id, periodMonth },
      },
      { upsert: true },
    );

    return {
      message: 'Đã lưu bảng tiêu chí chung.',
      data: { period: periodMonth, rowCount: rows.length },
    };
  }

  /**
   * Cán bộ sửa lại bảng khối A ĐÃ GỬI - chạy được cả khi bảng đang ở tay cấp
   * trên, đổi lại mọi ô đổi giá trị đều vào nhật ký.
   *
   * Cùng cặp với `updateProgress` của nhiệm vụ: lưu nháp là ghi đè im lặng khi
   * còn ở chỗ mình, cập nhật là sửa công khai khi đã trình lên. Chốt hoàn thành
   * rồi thì khoá hẳn - báo cáo tổng hợp đã lấy số của bảng này để chấm.
   */
  async updateCriteriaSheet(
    userId: string,
    dto: UpdatePersonalCriteriaSheetDto,
  ) {
    const actor = await this.requireActor(userId);
    const periodMonth = this.resolveCriteriaPeriod(dto.period);

    const sheet = await this.criteriaSheetModel.findOne({
      ownerId: actor.id,
      periodMonth,
    });
    if (!sheet) {
      throw new NotFoundException('Chưa có bảng khối A của tháng này.');
    }
    if (sheet.reviewStatus === 'COMPLETED') {
      throw new BadRequestException(
        'Bảng khối A đã chốt hoàn thành - không cập nhật nữa.',
      );
    }

    const columns = (await this.criteriaTemplateOf(sheet))?.columns ?? [];
    const titleByKey = new Map(
      columns.map((column) => [column.key, column.title]),
    );
    /** Giá trị cũ của từng ô, khoá "<id tiêu chí>:<khoá cột>". */
    const before = new Map<string, string>();
    const nameById = new Map<string, string>();
    for (const row of sheet.rows) {
      const id = String(row.criterionId);
      nameById.set(id, row.criterionName ?? '');
      for (const column of columns) {
        before.set(
          `${id}:${column.key}`,
          this.criteriaCellText(row, column.key),
        );
      }
    }

    /*
      Bảng đã gửi thì danh sách tiêu chí và trần điểm đứng yên theo bản đã chụp;
      bảng bị trả lại về nháp thì mở lại theo danh mục hiện hành.
    */
    const rows = this.withPriorReview(
      await this.buildCriteriaRowValues(
        dto.rows,
        sheet,
        OWNER_EDITABLE.includes(sheet.reviewStatus) ? 'catalog' : 'sheet',
      ),
      sheet,
    );
    sheet.rows = rows;
    sheet.markModified('rows');

    /*
      Ghi lại từng ô đã đổi, chỉ giá trị thô - đọc nhật ký là biết hôm đó cán bộ
      động vào tiêu chí nào, không phải so hai bản chụp. Dùng loại `result` vì
      ô khối A đúng là ô kết quả: tên cột nằm ở `detail`, kèm tên tiêu chí để
      phân biệt sáu dòng cùng bộ cột.
    */
    const changes: PersonalMissionProgressChange[] = [];
    for (const row of rows) {
      const id = String(row.criterionId);
      for (const column of columns) {
        const from = before.get(`${id}:${column.key}`) ?? '';
        const to = this.criteriaCellText(row, column.key);
        if (from === to) continue;
        changes.push({
          field: 'result',
          from,
          to,
          detail: `${nameById.get(id) ?? row.criterionName} · ${
            titleByKey.get(column.key) ?? column.key
          }`,
        });
      }
    }

    const now = new Date();
    sheet.lastProgressAt = now;
    this.appendLog(sheet, {
      type: 'PROGRESS',
      actor,
      note: dto.note,
      changes,
      at: now,
    });
    await sheet.save();

    return {
      message: changes.length
        ? `Đã cập nhật bảng tiêu chí chung - ${changes.length} ô thay đổi.`
        : 'Đã cập nhật bảng tiêu chí chung.',
      data: {
        period: periodMonth,
        ...this.criteriaSheetState(sheet),
        template: await this.criteriaTemplateOf(sheet),
        rows: await this.buildCriteriaRows(sheet),
      },
    };
  }

  /**
   * Chỉ huy chấm lại cả bảng khối A rồi chốt hoàn thành.
   *
   * Điểm ghi vào `reviewValues` của từng dòng chứ không đè lên ô của cán bộ -
   * cùng nguyên tắc với `scoreAndComplete` của nhiệm vụ. Chốt áp cho CẢ BẢNG:
   * bảng A là một lá phiếu đánh giá, duyệt một nửa thì không còn nghĩa gì.
   */
  async scoreCriteriaSheet(
    userId: string,
    id: string,
    dto: ScorePersonalCriteriaSheetDto,
  ) {
    const actor = await this.requireActor(userId);
    const sheet = await this.criteriaSheetModel.findOne({
      _id: this.requireObjectId(id, 'Bảng khối A'),
      currentRecipientId: actor.id,
      reviewStatus: { $in: ['PENDING', 'APPROVED'] },
    });
    if (!sheet) {
      throw new NotFoundException(
        'Không tìm thấy bảng khối A đang chờ bạn chốt.',
      );
    }

    const scored = await this.buildCriteriaRowValues(
      dto.rows.map((row) => ({
        criterionId: row.criterionId,
        fieldValues: row.values as Record<string, string | number | boolean>,
      })),
      sheet,
      'sheet',
    );
    const byCriterion = new Map(
      scored.map((row) => [String(row.criterionId), row]),
    );

    // Chấm đè lên đúng dòng đang có chứ không dựng lại mảng: bảng đã gửi thì
    // danh sách tiêu chí phải đứng yên, và số cán bộ tự chấm không được đụng tới.
    for (const row of sheet.rows) {
      const patch = byCriterion.get(String(row.criterionId));
      if (!patch) continue;
      row.reviewValues = patch.fieldValues;
      row.reviewCatalogValues = patch.catalogValues;
    }
    sheet.markModified('rows');

    const now = new Date();
    sheet.reviewNote = dto.note?.trim() ?? '';
    sheet.reviewScoredById = actor.id;
    sheet.reviewScoredByName = actor.name;
    sheet.reviewScoredAt = now;
    sheet.reviewStatus = 'COMPLETED';
    sheet.returnReason = '';
    sheet.lastDecidedById = actor.id;
    sheet.lastDecidedAt = now;
    this.appendLog(sheet, {
      type: 'COMPLETE',
      actor,
      note: sheet.reviewNote,
      at: now,
    });
    await sheet.save();
    await this.closeSubmissionsIfSettled([sheet]);

    return {
      message: 'Đã chấm điểm và chốt bảng tiêu chí chung.',
      data: { id: String(sheet._id) },
    };
  }

  /** Lịch sử một bảng khối A: đã đi qua những lượt gửi nào. */
  async criteriaHistory(userId: string, id: string) {
    const sheetId = this.requireObjectId(id, 'Bảng khối A');
    const actor = await this.requireActor(userId);

    const sheet = await this.criteriaSheetModel
      .findById(sheetId)
      .populate('ownerId', 'fullName username');
    if (!sheet) throw new NotFoundException('Không tìm thấy bảng khối A.');

    const submissions = await this.submissionModel
      .find({ criteriaSheetIds: sheetId })
      .sort({ level: 1, createdAt: 1 });

    const involved =
      String(sheet.ownerId?._id ?? sheet.ownerId) === String(actor.id) ||
      String(sheet.currentRecipientId ?? '') === String(actor.id) ||
      submissions.some(
        (row) =>
          String(row.senderId) === String(actor.id) ||
          String(row.recipientId) === String(actor.id),
      );
    if (!involved) {
      throw new NotFoundException('Không tìm thấy bảng khối A.');
    }

    return { message: 'OK', data: { sheet, submissions } };
  }

  /**
   * Bản MỚI NHẤT trong kỳ của từng cán bộ - báo cáo tổng hợp nạp sẵn số này.
   *
   * Bảng khối A chốt theo THÁNG, nên kỳ báo cáo trải mấy tháng thì lấy bảng của
   * tháng cuối cùng có trong kỳ, không cộng các tháng lại: mỗi bảng đã là đánh
   * giá trọn vẹn 30 điểm của tháng đó, cộng vào là nhân điểm lên theo số tháng.
   *
   * Bản ĐÃ GỬI luôn thắng bản còn nháp, dù nháp thuộc tháng sau: bảng chưa gửi
   * là bảng đang chấm dở, không được đè mất bản chỉ huy đã duyệt.
   *
   * Nhưng vẫn nhận bản nháp khi cán bộ KHÔNG có bản đã gửi nào trong kỳ - lọc
   * thẳng tay thì mọi bảng lưu từ trước lúc khối A có chuỗi duyệt (toàn bộ đang
   * là nháp) biến mất khỏi báo cáo tổng hợp.
   */
  async latestCriteriaSheets(
    ownerIds: Types.ObjectId[],
    fromDate: string,
    toDate: string,
  ) {
    if (!ownerIds.length)
      return new Map<string, PersonalMissionCriterionRow[]>();

    const sheets = await this.criteriaSheetModel
      .find({
        ownerId: { $in: ownerIds },
        ...(fromDate && toDate
          ? {
              periodMonth: {
                $gte: serverMonth(fromDate),
                $lte: serverMonth(toDate),
              },
            }
          : {}),
      })
      .sort({ periodMonth: 1, createdAt: 1 });

    // Sắp tăng dần rồi ghi đè: bản cuối cùng ghi vào map là bản mới nhất.
    const latest = new Map<string, PersonalMissionCriterionRow[]>();
    const hasSent = new Set<string>();
    for (const sheet of sheets) {
      const owner = String(sheet.ownerId);
      const draft = sheet.reviewStatus === 'DRAFT';
      if (draft && hasSent.has(owner)) continue;
      if (!draft) hasSent.add(owner);
      latest.set(owner, sheet.rows);
    }
    return latest;
  }

  // ------------------------------------------------- khối A - dùng chung

  /**
   * Mẫu của một bảng khối A: bản đã khoá lúc gửi, chưa gửi thì lấy mẫu đang bật.
   * Cùng cách làm với `resolveBoardTemplate` của nhiệm vụ.
   */
  private async criteriaTemplateOf(
    sheet?: {
      formTemplateId?: Types.ObjectId | null;
      formTemplateVersion?: number | null;
    } | null,
  ) {
    if (sheet?.formTemplateId && sheet.formTemplateVersion) {
      const resolved = await this.formTemplatesService.resolveVersion(
        sheet.formTemplateId,
        sheet.formTemplateVersion,
      );
      if (resolved) return resolved;
    }
    const live = await this.formTemplateModel.findOne({
      forCriteria: true,
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

  /** Chữ hiện trong nhật ký của một ô - ô chọn danh mục lấy tên đã chép. */
  private criteriaCellText(row: PersonalMissionCriterionRow, key: string) {
    const picked = row.catalogValues?.[key];
    if (picked?.id) return picked.name ?? '';
    const raw = row.fieldValues?.[key];
    /*
      Ô tích lưu boolean. Quy về "1" / rỗng cho khớp cách nhật ký của nhiệm vụ
      ghi ô tích - để nguyên thì dòng nhật ký hiện chữ "false", và client dịch
      "1" thành "Có" sẽ không bắt được nó.
    */
    if (typeof raw === 'boolean') return raw ? '1' : '';
    return String(raw ?? '').trim();
  }

  /**
   * Các dòng để bày ra màn hình: ghép danh mục khi bảng còn ở chỗ cán bộ, vẽ
   * thuần bản đã lưu khi bảng đã gửi. Xem `getCriteriaSheet` về lý do.
   */
  private async buildCriteriaRows(
    sheet: PersonalMissionCriteriaSheetDocument | null,
  ) {
    const locked = sheet && !OWNER_EDITABLE.includes(sheet.reviewStatus);
    if (locked) {
      /*
        Ghi chú của tiêu chí đọc LIVE từ danh mục, khác tên và điểm tối đa vốn
        được chụp lại: nó là chữ mô tả admin khai sẵn, không phải số để chấm.
        Bỏ trống thì cột "Ghi chú" của mọi bảng đã gửi trắng trơn, trong khi bản
        in có sẵn chữ ở đó.
      */
      const notes = new Map(
        (
          await this.criterionModel
            .find({ _id: { $in: sheet.rows.map((row) => row.criterionId) } })
            .select('note')
        ).map((row) => [String(row._id), row.note ?? '']),
      );
      return sheet.rows.map((row) => ({
        criterionId: String(row.criterionId),
        criterionName: row.criterionName ?? '',
        criterionNote: notes.get(String(row.criterionId)) ?? '',
        maxScore: row.maxScore ?? 0,
        fieldValues: row.fieldValues ?? {},
        catalogValues: row.catalogValues ?? {},
        reviewValues: row.reviewValues ?? {},
        reviewCatalogValues: row.reviewCatalogValues ?? {},
      }));
    }

    const criteria = await this.criterionModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 });
    const saved = new Map(
      (sheet?.rows ?? []).map((row) => [String(row.criterionId), row]),
    );
    return criteria.map((criterion) => {
      const row = saved.get(String(criterion._id));
      return {
        criterionId: String(criterion._id),
        criterionName: criterion.name,
        /** Ghi chú admin khai sẵn ở danh mục - cột criterion_note đọc nó. */
        criterionNote: criterion.note ?? '',
        maxScore: criterion.maxScore ?? 0,
        fieldValues: row?.fieldValues ?? {},
        catalogValues: row?.catalogValues ?? {},
        reviewValues: row?.reviewValues ?? {},
        reviewCatalogValues: row?.reviewCatalogValues ?? {},
      };
    });
  }

  /**
   * Kỳ tháng của bảng khối A, nhận cả YYYY-MM lẫn YYYY-MM-DD.
   * Chuỗi rác thì báo lỗi chứ không âm thầm rơi về tháng này - rơi về là người
   * dùng sửa nhầm bảng của tháng khác mà không biết.
   */
  private resolveCriteriaPeriod(value?: string) {
    const raw = value?.trim();
    if (!raw) return serverMonth();
    if (!isYearMonth(raw) && !isYmd(raw)) {
      throw new BadRequestException(
        'Kỳ báo cáo phải là YYYY-MM hoặc YYYY-MM-DD.',
      );
    }
    return serverMonth(raw);
  }

  /** Vị trí của bảng trong chuỗi gửi duyệt - màn nhập khoá / mở theo bộ này. */
  private criteriaSheetState(
    sheet: PersonalMissionCriteriaSheetDocument | null,
  ) {
    const status: PersonalMissionReviewStatus = sheet?.reviewStatus ?? 'DRAFT';
    return {
      sheetId: sheet ? String(sheet._id) : null,
      reviewStatus: status,
      holderLevel: sheet?.holderLevel ?? 0,
      returnReason: sheet?.returnReason ?? '',
      lastSentAt: sheet?.lastSentAt ?? null,
      lastProgressAt: sheet?.lastProgressAt ?? null,
      reviewNote: sheet?.reviewNote ?? '',
      reviewScoredByName: sheet?.reviewScoredByName ?? '',
      reviewScoredAt: sheet?.reviewScoredAt ?? null,
      progressLogs: sheet?.progressLogs ?? [],
      /** Còn ở chỗ cán bộ: lưu nháp và gửi được. */
      canEdit: OWNER_EDITABLE.includes(status),
      /** Đã gửi nhưng chưa chốt: sửa được qua đường cập nhật, có lưu vết. */
      canUpdate: Boolean(sheet) && status !== 'COMPLETED',
    };
  }

  /**
   * Lọc và kiểm các ô của một bộ dòng khối A theo mẫu.
   *
   * Dùng chung cho cán bộ tự chấm và chỉ huy chấm lại: hai đường ghi vào hai
   * túi khác nhau nhưng luật cột và trần điểm phải y hệt - tách ra là hai chỗ
   * kiểm khác nhau trên cùng một bảng.
   *
   * Bảng đã gửi đọc mẫu ĐÃ KHOÁ của chính nó; bảng chưa gửi đọc mẫu đang bật.
   *
   * `source` nói lấy tên tiêu chí và trần điểm ở đâu: `catalog` cho bảng còn
   * nháp, `sheet` cho bảng đã gửi.
   */
  private async buildCriteriaRowValues(
    input: Array<{
      criterionId: string;
      fieldValues?: Record<string, string | number | boolean>;
      catalogValues?: Record<string, { id: string; name: string }>;
    }>,
    sheet: PersonalMissionCriteriaSheetDocument | null,
    source: 'catalog' | 'sheet',
  ) {
    const ids = [...new Set(input.map((row) => row.criterionId))].map((value) =>
      this.requireObjectId(value, 'Tiêu chí'),
    );

    /*
      Bảng đã gửi chấm theo BẢN ĐÃ CHỤP của chính nó, không tra lại danh mục:
      tiêu chí bị ngừng hoặc xoá sau khi cán bộ gửi thì bảng vẫn phải chấm được,
      và trần điểm phải là trần của kỳ đó chứ không phải trần hôm nay.
    */
    const byId = new Map<
      string,
      { _id: Types.ObjectId; name: string; maxScore: number }
    >(
      source === 'sheet'
        ? (sheet?.rows ?? []).map((row) => [
            String(row.criterionId),
            {
              _id: row.criterionId,
              name: row.criterionName ?? '',
              maxScore: row.maxScore ?? 0,
            },
          ])
        : (
            await this.criterionModel
              .find({ _id: { $in: ids } })
              .select('name maxScore')
          ).map((row) => [
            String(row._id),
            {
              _id: row._id as Types.ObjectId,
              name: row.name,
              maxScore: row.maxScore ?? 0,
            },
          ]),
    );
    if (input.some((row) => !byId.has(row.criterionId))) {
      throw new BadRequestException(
        source === 'sheet'
          ? 'Có tiêu chí không nằm trong bảng đang chấm.'
          : 'Có tiêu chí không tồn tại.',
      );
    }

    /*
      Bảng A do mẫu `forCriteria` quyết định có cột gì, nên luật kiểm cũng phải
      đọc từ mẫu: cột số nào khai `rangeFromColumnKey` trỏ vào cột Điểm tối đa
      (tiêu chí) thì giá trị phải nằm trong 0 - điểm tối đa của CHÍNH dòng đó.
    */
    const columns = (await this.criteriaTemplateOf(sheet))?.columns ?? [];
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
    /*
      Mọi ô tích của một dòng là một nhóm loại trừ: "Đảm bảo" và "Không đảm bảo"
      là hai nửa của cùng một kết luận. Giao diện đã chặn, nhưng gọi thẳng API
      thì vẫn ghi được cả hai - và dòng đó về sau không ai đọc ra nổi.
    */
    const flagKeys = new Map(
      columns
        .filter((column) => column.dataType === 'boolean')
        .map((column) => [column.key, column.title]),
    );

    const seen = new Set<string>();
    return input.map((row) => {
      const criterion = byId.get(row.criterionId)!;
      if (seen.has(row.criterionId)) {
        throw new BadRequestException(
          `Tiêu chí "${criterion.name}" bị chấm hai lần.`,
        );
      }
      seen.add(row.criterionId);

      const max = criterion.maxScore;
      // Chỉ giữ ô của cột đang có trong mẫu - cột đã bỏ thì không nhận thêm giá
      // trị mới, nhưng dữ liệu cũ trong bản ghi vẫn còn nguyên.
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

      const ticked = [...flagKeys.keys()].filter(
        (key) => fieldValues[key] === true,
      );
      if (ticked.length > 1) {
        throw new BadRequestException(
          `"${criterion.name}": chỉ được tích một trong các ô ${ticked
            .map((key) => `"${flagKeys.get(key)}"`)
            .join(', ')}.`,
        );
      }

      const catalogValues: Record<string, { id: string; name: string }> = {};
      for (const [key, value] of Object.entries(row.catalogValues ?? {})) {
        if (!known.has(key) || !value?.id) continue;
        catalogValues[key] = { id: String(value.id), name: String(value.name) };
      }

      return {
        criterionId: criterion._id,
        criterionName: criterion.name,
        maxScore: max,
        fieldValues,
        catalogValues,
      };
    });
  }

  /**
   * Ghép bộ ô cán bộ vừa khai với điểm chỉ huy đã chấm trước đó của cùng dòng.
   * Không ghép thì mỗi lần cán bộ lưu lại bảng là xoá sạch số chỉ huy đã chấm.
   */
  private withPriorReview(
    rows: Array<{
      criterionId: Types.ObjectId;
      criterionName: string;
      maxScore: number;
      fieldValues: Record<string, string | number | boolean>;
      catalogValues: Record<string, { id: string; name: string }>;
    }>,
    sheet: PersonalMissionCriteriaSheetDocument | null,
  ): PersonalMissionCriterionRow[] {
    const prior = new Map(
      (sheet?.rows ?? []).map((row) => [String(row.criterionId), row]),
    );
    return rows.map((row) => {
      const before = prior.get(String(row.criterionId));
      return {
        ...row,
        reviewValues: before?.reviewValues ?? {},
        reviewCatalogValues: before?.reviewCatalogValues ?? {},
      };
    });
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

  private async mapContent(dto: CreatePersonalMissionDto) {
    return {
      fieldValues: dto.fieldValues ?? {},
      catalogValues: await this.resolveCatalogValues(dto.catalogValues),
      attachments: await this.sanitizeAttachments(dto.attachments),
    };
  }

  /**
   * Tra tên cán bộ phối hợp, bỏ id không có thật hoặc tài khoản đã khoá.
   *
   * `excludeUserId` là người xử lý chính (chủ nhiệm vụ): tự thêm mình vào danh
   * sách phối hợp thì tên hiện hai lần trên cùng một dòng, mà cũng chẳng nói
   * thêm được gì - đã là người khai rồi.
   *
   * Bỏ im lặng id không hợp lệ chứ không ném lỗi, giống cách `resolveCatalogValues`
   * xử lý: người dùng đang lưu nháp cả chục dòng, chặn cả lượt lưu chỉ vì một
   * tài khoản vừa bị khoá là mất trắng phần vừa gõ.
   */
  private async resolveCollaborators(
    raw: string[] | undefined,
    excludeUserId: Types.ObjectId,
  ): Promise<Array<{ userId: Types.ObjectId; name: string }>> {
    if (!raw?.length) return [];

    const wanted = [
      ...new Set(
        raw
          .map((id) => String(id ?? '').trim())
          .filter((id) => Types.ObjectId.isValid(id))
          .filter((id) => id !== String(excludeUserId)),
      ),
    ];
    if (!wanted.length) return [];

    const users = await this.userModel
      .find({ _id: { $in: wanted.map((id) => new Types.ObjectId(id)) }, isActive: true })
      .select('fullName username');

    const byId = new Map(users.map((user) => [String(user._id), user]));
    // Giữ đúng thứ tự người dùng đã chọn, không theo thứ tự Mongo trả về.
    return wanted.flatMap((id) => {
      const user = byId.get(id);
      if (!user) return [];
      return [
        {
          userId: user._id as Types.ObjectId,
          name: user.fullName?.trim() || user.username,
        },
      ];
    });
  }

  /**
   * Tra tên cho các id danh mục client gửi lên, bỏ id không có thật.
   * Tra ở cả hai danh mục thay vì suy từ mẫu bảng: mẫu có thể chưa được khoá
   * lúc lưu nháp, còn id thì luôn đủ để biết nó thuộc danh mục nào.
   */
  private async resolveCatalogValues(
    raw: Record<string, unknown> | undefined,
  ): Promise<Record<string, PersonalMissionCatalogValue>> {
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
    const [scoreGroups, qualityLevels, workTasks] = await Promise.all([
      this.scoreGroupModel.find({ _id: { $in: ids } }).select('name'),
      this.qualityLevelModel.find({ _id: { $in: ids } }).select('name'),
      // Nhiệm vụ khai sẵn (trục chấm theo mục) - cán bộ chọn chứ không gõ.
      this.workTaskModel.find({ _id: { $in: ids } }).select('name'),
    ]);

    const nameById = new Map<string, string>();
    for (const row of [...scoreGroups, ...qualityLevels, ...workTasks]) {
      nameById.set(String(row._id), row.name);
    }

    const result: Record<string, PersonalMissionCatalogValue> = {};
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
  ): Promise<Record<string, PersonalMissionAttachment[]>> {
    if (!raw) return {};

    const candidates: Array<{ key: string; file: PersonalMissionAttachment }> =
      [];
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

    const result: Record<string, PersonalMissionAttachment[]> = {};
    for (const item of candidates) {
      if (!existing.has(item.file.id)) continue;
      (result[item.key] ??= []).push(item.file);
    }
    return result;
  }

  private async applyContent(
    item: PersonalMissionItemDocument,
    dto: UpdatePersonalMissionDto | ReviewerEditPersonalMissionDto,
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
    // Cũng thay nguyên danh sách: gửi mảng rỗng là cách gỡ hết người phối hợp.
    if (dto.collaboratorIds !== undefined) {
      item.collaborators = await this.resolveCollaborators(
        dto.collaboratorIds,
        item.ownerId,
      );
      item.markModified('collaborators');
    }
  }

  /**
   * Trường nào thực sự đổi - dùng để ghi lịch sử sửa của cấp trên.
   *
   * Nhãn lấy TÊN CỘT trong mẫu chứ không phải khoá cột: người đọc nhật ký cần
   * thấy "Thời hạn hoàn thành", không phải "deadline". Ô danh mục so theo tên
   * đã chép sẵn, tệp đính kèm so theo số lượng - đọc ra được là đủ.
   */
  private async diffContent(
    item: PersonalMissionItemDocument,
    dto: ReviewerEditPersonalMissionDto,
    template?: TrackingTemplate | null,
  ) {
    const changes: Array<{
      field: string;
      label: string;
      from: unknown;
      to: unknown;
    }> = [];

    /*
      Tên cột kèm NHÓM HEADER bọc ngoài: mẫu thật đặt hai cột trùng tên "Thực tế
      hoàn thành %" cho cả nhóm tiến độ (B) lẫn nhóm chất lượng (C). Ghi mỗi tên
      cột thì đọc nhật ký thấy hai dòng y hệt nhau, không biết số nào của nhóm
      nào - và ở client hai dòng đó còn trùng cả key React.
    */
    const titleOf = (key: string) => {
      const column = template?.columns?.find((entry) => entry.key === key);
      if (!column) return key;
      const group = (column.headerPath ?? []).filter(Boolean).join(' · ');
      return group ? `${group} · ${column.title}` : column.title;
    };

    if (dto.axisId !== undefined && String(item.axisId) !== dto.axisId) {
      const axis = await this.axisModel
        .findById(this.requireObjectId(dto.axisId, 'Trục'))
        .select('name code');
      changes.push({
        field: 'axisId',
        label: 'Trục',
        from: await this.axisLabel(item.axisId),
        to: axis?.name ?? axis?.code ?? dto.axisId,
      });
    }

    if (
      dto.workContentId !== undefined &&
      String(item.workContentId) !== dto.workContentId
    ) {
      const content = await this.workContentModel
        .findById(this.requireObjectId(dto.workContentId, 'Nội dung công việc'))
        .select('name code');
      changes.push({
        field: 'workContentId',
        label: 'Nội dung công việc',
        from: await this.workContentLabel(item.workContentId),
        to: content?.name ?? content?.code ?? dto.workContentId,
      });
    }

    for (const [key, next] of Object.entries(dto.fieldValues ?? {})) {
      const current = item.fieldValues?.[key];
      if (String(current ?? '') === String(next ?? '')) continue;
      changes.push({
        field: `fieldValues.${key}`,
        label: titleOf(key),
        from: current ?? null,
        to: next ?? null,
      });
    }

    // Ô danh mục: so theo TÊN, vì id đổi mà tên giữ nguyên thì người đọc không
    // hiểu vừa đổi cái gì.
    if (dto.catalogValues !== undefined) {
      const resolved = await this.resolveCatalogValues(dto.catalogValues);
      const keys = new Set([
        ...Object.keys(item.catalogValues ?? {}),
        ...Object.keys(resolved),
      ]);
      for (const key of keys) {
        const from = item.catalogValues?.[key]?.name ?? '';
        const to = resolved[key]?.name ?? '';
        if (from === to) continue;
        changes.push({
          field: `catalogValues.${key}`,
          label: titleOf(key),
          from,
          to,
        });
      }
    }

    if (dto.attachments !== undefined) {
      const resolved = await this.sanitizeAttachments(dto.attachments);
      const keys = new Set([
        ...Object.keys(item.attachments ?? {}),
        ...Object.keys(resolved),
      ]);
      for (const key of keys) {
        const from = item.attachments?.[key]?.length ?? 0;
        const to = resolved[key]?.length ?? 0;
        if (from === to) continue;
        changes.push({
          field: `attachments.${key}`,
          label: titleOf(key),
          from: `${from} tệp`,
          to: `${to} tệp`,
        });
      }
    }

    return changes;
  }

  /** Tên trục để ghi vào nhật ký; trục đã xoá thì nói thẳng. */
  private async axisLabel(axisId: unknown): Promise<string> {
    if (!axisId) return '';
    const axis = await this.axisModel.findById(axisId).select('name code');
    return axis?.name ?? axis?.code ?? 'Trục đã bị xoá';
  }

  private async workContentLabel(contentId: unknown): Promise<string> {
    if (!contentId) return '';
    const content = await this.workContentModel
      .findById(contentId)
      .select('name code');
    return content?.name ?? content?.code ?? 'Nội dung đã bị xoá';
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
        .populate('workContentId', 'code name description note');
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
