import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import { Role, RoleDocument } from '@/modules/roles/schemas/role.schema';
import { Permission } from '@/common/enums/permission.enum';
import {
  WorkContent,
  WorkContentDocument,
} from '@/modules/mission-form-config/schemas/work-content.schema';
import {
  ScoreGroup,
  ScoreGroupDocument,
} from '@/modules/mission-form-config/schemas/score-group.schema';
import {
  Axis,
  AxisDocument,
} from '@/modules/mission-form-config/schemas/axis.schema';
import {
  WorkTask,
  WorkTaskDocument,
} from '@/modules/mission-form-config/schemas/work-task.schema';
import {
  QualityLevel,
  QualityLevelDocument,
} from '@/modules/mission-form-config/schemas/quality-level.schema';
import {
  Criterion,
  CriterionDocument,
} from '@/modules/mission-form-config/schemas/criterion.schema';
import {
  catalogOfSemantic,
  computeAutoValue,
  FormTemplate,
  FormTemplateColumn,
  FormTemplateDocument,
} from '@/modules/mission-form-config/schemas/form-template.schema';
import { FormTemplatesService } from '@/modules/mission-form-config/form-templates.service';
import {
  TeamReportTask,
  TeamReportTaskDocument,
} from './schemas/team-report-task.schema';
import {
  TeamReportDay,
  TeamReportDayDocument,
  TeamReportDayRow,
} from './schemas/team-report-day.schema';
import {
  TeamReportUnitDay,
  TeamReportUnitDayDocument,
} from './schemas/team-report-unit-day.schema';
import {
  TeamReportSummary,
  TeamReportSummaryDocument,
  type TeamReportPeriod,
} from './schemas/team-report-summary.schema';
import {
  ChangeTeamReportSummaryTasksDto,
  ClassifyTeamReportTaskDto,
  CloseTeamReportTaskDto,
  CreateTeamReportSummaryDto,
  CreateTeamReportTaskDto,
  EditTeamReportSummaryDto,
  PreviewTeamReportSummaryDto,
  ReopenTeamReportTaskDto,
  DecideTeamReportDayDto,
  PromoteTeamReportDto,
  ReviewTeamReportDayDto,
  SendTeamReportSummaryDto,
  SubmitTeamReportDayDto,
  TeamReportClassifyQueryDto,
  TeamReportInboxQueryDto,
  TeamReportSheetQueryDto,
  TeamReportSummaryCandidatesQueryDto,
  TeamReportSummaryListQueryDto,
  UpdateTeamReportTaskDto,
} from './dto/team-report.dto';
import { isYmd, serverDateYmd } from './team-report.time';
import {
  computeAxisFooter,
  describeFooter,
  type ScoreCatalogs,
} from './team-report.score';

/**
 * Bộ cột của một mẫu, đã rút gọn còn đúng thứ bảng cần để dựng.
 *
 * Mang theo cả `_id` và `version` vì nhiệm vụ phải đóng dấu lại được: quản trị
 * sửa mẫu về sau thì bản đã gửi vẫn bày đúng bộ cột lúc gửi.
 */
type ResolvedTemplate = {
  _id: string;
  code: string;
  name: string;
  version: number;
  columns: FormTemplateColumn[];
  headerGroups: unknown[];
  footer?: unknown;
};

/**
 * Trần dòng cho kho nhiệm vụ của báo cáo tổng hợp.
 *
 * Không phân trang vì tích chọn chỉ có nghĩa khi nhìn được cả kỳ một lượt; trần
 * này chỉ để một kỳ bất thường không kéo về vài nghìn dòng. Chạm trần thì báo
 * `truncated` để người dùng thu hẹp kỳ lại, chứ không cắt im lặng.
 */
const SUMMARY_CANDIDATES_MAX = 500;

/** Người đang thao tác - luôn là tài khoản dùng chung của một đơn vị. */
type Actor = {
  id: Types.ObjectId;
  name: string;
  departmentId: Types.ObjectId;
};

@Injectable()
export class TeamReportService {
  constructor(
    @InjectModel(TeamReportTask.name)
    private readonly taskModel: Model<TeamReportTaskDocument>,
    @InjectModel(TeamReportDay.name)
    private readonly dayModel: Model<TeamReportDayDocument>,
    @InjectModel(TeamReportUnitDay.name)
    private readonly unitDayModel: Model<TeamReportUnitDayDocument>,
    @InjectModel(TeamReportSummary.name)
    private readonly summaryModel: Model<TeamReportSummaryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(Role.name)
    private readonly roleModel: Model<RoleDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(ScoreGroup.name)
    private readonly scoreGroupModel: Model<ScoreGroupDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
    @InjectModel(WorkTask.name)
    private readonly workTaskModel: Model<WorkTaskDocument>,
    @InjectModel(QualityLevel.name)
    private readonly qualityLevelModel: Model<QualityLevelDocument>,
    @InjectModel(Criterion.name)
    private readonly criterionModel: Model<CriterionDocument>,
    @InjectModel(FormTemplate.name)
    private readonly formTemplateModel: Model<FormTemplateDocument>,
    private readonly formTemplatesService: FormTemplatesService,
  ) {}

  // ==================================================== giai đoạn 1: nhập thô

  /**
   * Bảng nhập của đội cho một ngày.
   *
   * Gồm mọi việc CÒN MỞ, không riêng việc khai hôm nay: việc chưa xong phải tự
   * hiện lại để đội cập nhật tiến độ, không bắt khai lại một dòng mới mỗi ngày.
   *
   * Đánh dấu xong là RỜI BẢNG NGAY, không chờ sang ngày mai. Bảng này là danh
   * sách việc đang phải làm; để việc đã xong nằm lại đó thì mỗi ngày một dài
   * thêm, mà đội chỉ cần nhìn phần còn phải làm. Muốn nó hiện lại thì vào tab
   * Phân loại bỏ đánh dấu xong - ở đó việc đã đóng vẫn còn (tab "Đã đóng").
   *
   * Riêng NGÀY CŨ thì vẫn thấy việc đóng đúng hôm đó: bảng hôm qua là bản đã
   * chốt, mất những việc chốt hôm qua thì nó không còn khớp báo cáo đã gửi.
   */
  async sheet(userId: string, query: TeamReportSheetQueryDto) {
    const actor = await this.requireActor(userId);
    const reportDate = this.requireDate(query.reportDate);
    const today = serverDateYmd();

    const filter: Record<string, unknown> = {
      departmentId: actor.departmentId,
      // Việc khai sau ngày đang xem thì chưa tồn tại vào hôm đó.
      createdDate: { $lte: reportDate },
      ...(reportDate === today
        ? { isOpen: true }
        : { $or: [{ isOpen: true }, { closedDate: reportDate }] }),
    };
    if (query.q?.trim()) {
      const like = { $regex: this.likeRegex(query.q) };
      /* Đi vào `$and` chứ không đặt thẳng: `$or` ở trên đang giữ điều kiện
         còn-mở/đóng-đúng-ngày, thêm một `$or` nữa ở cùng tầng là đè mất nó. */
      filter.$and = [{ $or: [{ name: like }, { product: like }] }];
    }

    const [tasks, day] = await Promise.all([
      this.taskModel
        .find(filter)
        .sort({ createdDate: -1, createdAt: 1 })
        .populate('workContentId', 'code name'),
      this.dayModel.findOne({
        departmentId: actor.departmentId,
        reportDate,
      }),
    ]);

    return {
      message: 'OK',
      data: {
        reportDate,
        /** Đã gửi thì bảng của ngày đó khoá lại, không sửa được nữa. */
        locked: !!day && day.status !== 'RETURNED',
        day,
        tasks,
        unclassified: tasks.filter((task) => !task.workContentId).length,
      },
    };
  }

  async createTask(userId: string, dto: CreateTeamReportTaskDto) {
    const actor = await this.requireActor(userId);
    const today = serverDateYmd();
    await this.assertDayEditable(actor.departmentId, today);

    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Tên nhiệm vụ là bắt buộc.');

    const task = await this.taskModel.create({
      departmentId: actor.departmentId,
      name,
      deadline: this.optionalDate(dto.deadline),
      product: dto.product?.trim() ?? '',
      evidence: this.mapEvidence(dto.evidence),
      createdDate: today,
      isOpen: true,
      version: 1,
    });

    return { message: 'Đã thêm nhiệm vụ.', data: task };
  }

  async updateTask(userId: string, id: string, dto: UpdateTeamReportTaskDto) {
    const actor = await this.requireActor(userId);
    const task = await this.requireOwnTask(actor, id);
    await this.assertDayEditable(actor.departmentId, serverDateYmd());
    this.assertClosedNotEdited(task);
    this.assertVersion(task, dto.version);

    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Tên nhiệm vụ là bắt buộc.');

    task.name = name;
    task.deadline = this.optionalDate(dto.deadline);
    task.product = dto.product?.trim() ?? '';
    if (dto.evidence) task.evidence = this.mapEvidence(dto.evidence);

    /* Đẩy luôn sang bộ cột của mẫu nếu nhiệm vụ đã chọn trục. Bảng nhập là nguồn
       của tên / hạn / sản phẩm, nên sửa ở đây mà bảng chấm vẫn giữ số cũ là hai
       màn nói hai chuyện khác nhau về cùng một nhiệm vụ. */
    await this.syncEntryColumns(task);

    task.version += 1;
    await task.save();

    return { message: 'Đã lưu.', data: task };
  }

  async deleteTask(userId: string, id: string) {
    const actor = await this.requireActor(userId);
    const task = await this.requireOwnTask(actor, id);
    await this.assertDayEditable(actor.departmentId, serverDateYmd());

    /*
      Việc đã nằm trong một báo cáo đã gửi thì không xoá được nữa - xoá đi là
      bản chụp của ngày đó trỏ tới một nhiệm vụ không còn tồn tại. Muốn dừng thì
      dùng đường "đóng kèm lý do".
    */
    const sent = await this.dayModel.exists({
      departmentId: actor.departmentId,
      'rows.taskId': task._id,
    });
    if (sent) {
      throw new BadRequestException(
        'Nhiệm vụ đã nằm trong báo cáo đã gửi, chỉ dừng được chứ không xoá.',
      );
    }

    await task.deleteOne();
    return { message: 'Đã xoá nhiệm vụ.', data: { id } };
  }

  /**
   * Đóng một nhiệm vụ: làm xong, hoặc dừng giữa chừng.
   *
   * Đóng có hiệu lực NGAY, không chờ tới lượt gửi. Nhiệm vụ đóng hôm nay vẫn
   * nằm trong bảng của hôm nay (xem bộ lọc `closedDate === reportDate`), chỉ
   * biến mất từ ngày mai - nên đánh dấu sớm không làm mất nó khỏi báo cáo.
   *
   * Nhờ vậy không phải gom việc "đánh dấu đã xong" vào một danh sách tích lúc
   * gửi: một ngày vài chục nhiệm vụ thì danh sách đó không ai dò nổi.
   */
  async closeTask(userId: string, id: string, dto: CloseTeamReportTaskDto) {
    const actor = await this.requireActor(userId);
    const task = await this.requireOwnTask(actor, id);
    this.assertVersion(task, dto.version);

    const done = dto.done === true;
    const reason = dto.reason?.trim() ?? '';
    if (!done && !reason) {
      throw new BadRequestException(
        'Dừng giữa chừng thì phải nêu lý do. Làm xong thì đánh dấu hoàn thành.',
      );
    }

    task.isOpen = false;
    task.closedDate = serverDateYmd();
    task.closedReason = done ? '' : reason;
    task.version += 1;
    this.appendEdit(
      task,
      actor,
      'Tình trạng',
      'đang làm',
      done ? 'hoàn thành' : 'dừng giữa chừng',
      done ? 'Đội đánh dấu đã xong' : reason,
    );
    await task.save();

    return {
      message: done ? 'Đã đánh dấu hoàn thành.' : 'Đã dừng nhiệm vụ.',
      data: task,
    };
  }

  /**
   * Mở lại một nhiệm vụ đã đóng.
   *
   * Đóng có hiệu lực ngay nên bấm nhầm là mất luôn khỏi bảng ngày mai - phải có
   * đường lùi, không thì cách duy nhất là khai lại một dòng mới.
   */
  async reopenTask(userId: string, id: string, dto: ReopenTeamReportTaskDto) {
    const actor = await this.requireActor(userId);
    const task = await this.requireOwnTask(actor, id);
    this.assertVersion(task, dto.version);

    if (task.isOpen) {
      throw new BadRequestException('Nhiệm vụ này đang mở.');
    }

    task.isOpen = true;
    task.closedDate = '';
    task.closedReason = '';
    task.version += 1;
    this.appendEdit(task, actor, 'Tình trạng', 'đã đóng', 'đang làm', '');
    await task.save();

    return { message: 'Đã mở lại nhiệm vụ.', data: task };
  }

  // ================================================= giai đoạn 2: phân loại

  /**
   * Tab phân loại: việc của ngày, kèm danh mục trục / nội dung công việc và bộ
   * cột của từng trục.
   *
   * Trả cả MẪU BẢNG của mọi trục trong một lượt: chọn trục xong là client dựng
   * ngay bộ cột đúng như quản trị cấu hình, không phải gọi thêm một lượt cho
   * mỗi lần đổi trục.
   */
  async classifyBoard(userId: string, query: TeamReportClassifyQueryDto) {
    const actor = await this.requireActor(userId);
    const reportDate = this.requireDate(query.reportDate);

    const filter: Record<string, unknown> = {
      departmentId: actor.departmentId,
      createdDate: { $lte: reportDate },
      $or: [{ isOpen: true }, { closedDate: reportDate }],
    };
    if (query.onlyUnclassified) filter.workContentId = null;

    const [tasks, axes, contents, day] = await Promise.all([
      this.taskModel
        .find(filter)
        .sort({ axisId: 1, workContentId: 1, createdDate: -1, createdAt: 1 })
        .populate('axisId', 'code name sortOrder')
        .populate('workContentId', 'code name'),
      this.axisModel
        .find({ isActive: true })
        .select('code name sortOrder maxScore')
        .sort({ sortOrder: 1, code: 1 }),
      this.workContentModel
        .find({ isActive: true })
        .select('code name axisId scoreGroupId sortOrder')
        .sort({ sortOrder: 1, code: 1 }),
      this.dayModel.findOne({
        departmentId: actor.departmentId,
        reportDate,
      }),
    ]);

    const templates = await this.templatesByAxis(
      axes.map((axis) => String(axis._id)),
    );
    const catalogs = await this.catalogsForTemplates(
      Object.values(templates).filter(Boolean),
    );

    const unclassified = tasks.filter((task) => !task.workContentId).length;

    /* Điểm trục ngay trên màn phân loại: đội phải thấy mình đang được bao nhiêu
       TRƯỚC khi gửi, không phải chờ cấp trên mở ra mới biết. */
    const axisScores = await this.axisScoresOf(
      tasks.map((task) => ({
        axisId: this.axisIdOf(task) || null,
        formTemplateId: task.formTemplateId,
        formTemplateVersion: task.formTemplateVersion,
        fieldValues: task.fieldValues,
        catalogValues: task.catalogValues,
        reviewValues: task.reviewValues,
        reviewCatalogValues: task.reviewCatalogValues,
      })),
      Object.fromEntries(
        Object.values(templates)
          .filter((template): template is ResolvedTemplate => !!template)
          .map((template) => [`${template._id}:${template.version}`, template]),
      ),
      catalogs,
    );

    return {
      message: 'OK',
      data: {
        reportDate,
        axisScores,
        locked: !!day && day.status !== 'RETURNED',
        day,
        tasks,
        axes,
        workContents: contents,
        /** Bộ cột theo trục, tra bằng id trục. null = trục chưa gán mẫu. */
        templates,
        /** Danh mục cho các cột kiểu chọn, tra theo loại danh mục. */
        catalogs,
        unclassified,
        /* Phải phân loại hết mới gửi được - cấp trên nhận một dòng chưa biết
           thuộc nội dung nào thì không cộng vào đâu được. */
        canSubmit: tasks.length > 0 && unclassified === 0,
      },
    };
  }

  /**
   * Lưu phân loại của một nhiệm vụ.
   *
   * Đổi trục là đổi cả bộ cột, nên giá trị cột của trục cũ phải bỏ đi - giữ lại
   * là mang theo một mớ khoá không thuộc mẫu nào, đọc ra không ai hiểu của cột
   * gì mà lại vẫn chiếm chỗ trong bản chụp.
   */
  async classifyTask(
    userId: string,
    id: string,
    dto: ClassifyTeamReportTaskDto,
  ) {
    const actor = await this.requireActor(userId);
    const task = await this.requireOwnTask(actor, id);
    await this.assertDayEditable(actor.departmentId, serverDateYmd());
    this.assertClosedNotEdited(task);
    this.assertVersion(task, dto.version);

    if (dto.axisId !== undefined) {
      const nextAxisId = dto.axisId
        ? this.requireObjectId(dto.axisId, 'Trục')
        : null;
      if (String(task.axisId ?? '') !== String(nextAxisId ?? '')) {
        task.axisId = nextAxisId;
        // Đổi trục thì nội dung công việc cũ không còn thuộc trục nữa.
        task.workContentId = null;
        task.fieldValues = {};
        task.catalogValues = {};
        task.reviewValues = {};
        task.reviewCatalogValues = {};
        await this.stampTemplate(task);
        await this.syncEntryColumns(task);
      }
    }

    if (dto.workContentId !== undefined) {
      task.workContentId = dto.workContentId
        ? await this.requireWorkContentOfAxis(dto.workContentId, task.axisId)
        : null;
    }

    if (dto.fieldValues || dto.catalogValues) {
      await this.stampTemplate(task);
      const template = await this.templateOfTask(task);
      const before = this.snapshotValues(task, template);
      const merged = await this.applyColumnValues(
        task,
        template,
        { fieldValues: dto.fieldValues, catalogValues: dto.catalogValues },
        // Đội đang tự phân loại - cột sản phẩm / tên / hạn ghi ngược lên GĐ1.
        { syncEntryFields: true },
      );
      /* Tính lại ô tự chấm NGAY trong lượt này: đổi phần trăm hay đổi điểm gốc
         thì điểm quy đổi phải đổi theo cùng lúc, không thì bảng bày một con số
         thuộc về lần chấm trước. */
      task.fieldValues = await this.computeAutoColumns(
        template,
        merged.fieldValues,
        merged.catalogValues,
      );
      task.catalogValues = merged.catalogValues;
      task.markModified('fieldValues');
      task.markModified('catalogValues');
      // Đội tự chấm cũng vào nhật ký - trace được thì phải trace được cả hai bên.
      this.logValueChanges(task, template, before, actor, '');
    }

    task.version += 1;
    await task.save();
    await task.populate([
      { path: 'axisId', select: 'code name sortOrder' },
      { path: 'workContentId', select: 'code name' },
    ]);

    return { message: 'Đã lưu phân loại.', data: task };
  }

  // ===================================================== gửi lên cấp phòng

  /**
   * Gửi báo cáo ngày lên phòng.
   *
   * Chép TOÀN BỘ giá trị của từng nhiệm vụ vào `rows` chứ không giữ tham chiếu:
   * nhiệm vụ còn chạy tiếp những ngày sau, giữ tham chiếu thì mở lại báo cáo đã
   * duyệt sẽ ra số của hôm nay chứ không phải số đã trình.
   */
  async submitDay(userId: string, dto: SubmitTeamReportDayDto) {
    const actor = await this.requireActor(userId);
    const reportDate = this.requireDate(dto.reportDate);

    const existing = await this.dayModel.findOne({
      departmentId: actor.departmentId,
      reportDate,
    });
    if (existing && existing.status !== 'RETURNED') {
      throw new BadRequestException('Báo cáo ngày này đã gửi rồi.');
    }

    const tasks = await this.taskModel
      .find({
        departmentId: actor.departmentId,
        createdDate: { $lte: reportDate },
        $or: [{ isOpen: true }, { closedDate: reportDate }],
      })
      /* PHẢI populate cả trục: `snapshotOf` chép tên trục vào bản chụp, thiếu
         populate thì bản đã trình không có tên trục và cấp trên đọc ra một mớ
         nhiệm vụ không rõ thuộc trục nào. */
      .populate('axisId', 'code name')
      .populate('workContentId', 'code name');

    if (!tasks.length) {
      throw new BadRequestException('Chưa có nhiệm vụ nào để gửi.');
    }
    const missing = tasks.filter((task) => !task.workContentId).length;
    if (missing) {
      throw new BadRequestException(
        `Còn ${missing} nhiệm vụ chưa phân loại, chưa gửi được.`,
      );
    }

    /* Đóng việc đã là hành động riêng ngay trên màn phân loại, nên tới đây
       chỉ việc chép lại trạng thái đang có - không còn danh sách tích lúc gửi. */
    const rows: TeamReportDayRow[] = tasks.map((task) =>
      this.snapshotOf(task, !task.isOpen),
    );

    const recipientDepartmentId = await this.resolveRecipientDepartment(
      actor.departmentId,
    );
    if (!recipientDepartmentId) {
      throw new BadRequestException(
        'Không tìm được cấp trên nhận báo cáo. Kiểm tra lại cây đơn vị và tài khoản cấp trên.',
      );
    }

    const payload = {
      departmentId: actor.departmentId,
      reportDate,
      status: 'PENDING' as const,
      rows,
      sentById: actor.id,
      sentByName: actor.name,
      sentAt: new Date(),
      note: dto.note?.trim() ?? '',
      recipientDepartmentId,
      returnReason: '',
      decidedById: null,
      decidedByName: '',
      decidedAt: null,
    };

    /*
      upsert theo (đội, ngày) và bắt lỗi trùng khoá: cả đội dùng chung một tài
      khoản nên hai người bấm gửi gần như cùng lúc là chuyện thường, kiểm bằng
      findOne ở trên thôi thì vẫn lọt qua khe.
    */
    let day: TeamReportDayDocument | null;
    try {
      day = await this.dayModel.findOneAndUpdate(
        { departmentId: actor.departmentId, reportDate },
        { $set: payload },
        { upsert: true, new: true },
      );
    } catch (error) {
      if ((error as { code?: number })?.code === 11000) {
        throw new ConflictException(
          'Vừa có người khác gửi báo cáo ngày này. Tải lại để xem.',
        );
      }
      throw error;
    }

    return {
      message: `Đã gửi báo cáo ngày ${reportDate}.`,
      data: { dayId: String(day?._id), rowCount: rows.length },
    };
  }

  // ============================================== cấp trên: duyệt và gộp

  /** Hộp đến: báo cáo các đội gửi lên đơn vị của mình. */
  async inbox(userId: string, query: TeamReportInboxQueryDto) {
    const actor = await this.requireActor(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 100);

    const filter: Record<string, unknown> = {
      recipientDepartmentId: actor.departmentId,
    };
    if (query.status) filter.status = query.status;
    if (query.departmentId) {
      filter.departmentId = this.requireObjectId(query.departmentId, 'Đội');
    }
    const range: Record<string, string> = {};
    if (query.fromDate) range.$gte = this.requireDate(query.fromDate);
    if (query.toDate) range.$lte = this.requireDate(query.toDate);
    if (Object.keys(range).length) filter.reportDate = range;

    const [data, total] = await Promise.all([
      this.dayModel
        .find(filter)
        .sort({ reportDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('departmentId', 'code name')
        .populate('sentById', 'fullName username'),
      this.dayModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async dayDetail(userId: string, id: string) {
    const actor = await this.requireActor(userId);
    const day = await this.dayModel
      .findById(this.requireObjectId(id, 'Báo cáo'))
      .populate('departmentId', 'code name')
      .populate('sentById', 'fullName username');
    if (!day) throw new NotFoundException('Không tìm thấy báo cáo.');

    const mine =
      String(day.recipientDepartmentId ?? '') === String(actor.departmentId) ||
      String(day.departmentId) === String(actor.departmentId);
    if (!mine) {
      throw new ForbiddenException('Báo cáo này không gửi tới đơn vị bạn.');
    }

    /*
      Trả kèm BỘ CỘT của từng mẫu có mặt trong báo cáo.

      Mỗi dòng đóng dấu mẫu và phiên bản riêng, mà quản trị có thể đã sửa mẫu
      sau ngày gửi - phải tra đúng phiên bản đã đóng dấu thì bảng mới bày lại
      được đúng bộ cột của hôm gửi.
    */
    const templates: Record<string, ResolvedTemplate> = {};
    for (const row of day.rows) {
      if (!row.formTemplateId) continue;
      const key = `${String(row.formTemplateId)}:${row.formTemplateVersion ?? 1}`;
      if (templates[key]) continue;
      const resolved = await this.formTemplatesService.resolveVersion(
        row.formTemplateId,
        row.formTemplateVersion ?? 1,
      );
      if (resolved) {
        templates[key] = { _id: String(row.formTemplateId), ...resolved };
      }
    }

    const catalogs = await this.catalogsForTemplates(Object.values(templates));
    const axisScores = await this.axisScoresOf(day.rows, templates, catalogs);

    return { message: 'OK', data: { day, templates, catalogs, axisScores } };
  }

  /**
   * Cấp trên chỉnh giá trị trên báo cáo đã nhận.
   *
   * Ghi vào CẢ bản chụp lẫn nhiệm vụ sống. Chỉ sửa bản chụp thì hôm sau đội vẫn
   * khai số cũ và cấp trên phải chỉnh lại y hệt mỗi ngày; chỉ sửa nhiệm vụ sống
   * thì bản đã trình lại không khớp con số đã duyệt.
   *
   * Trên nhiệm vụ sống thì ghi vào `reviewValues` chứ không đè lên `fieldValues`
   * của đội: phải đọc được cả hai để đối chiếu ai khai gì, ai chấm lại gì.
   */
  async reviewEdit(userId: string, id: string, dto: ReviewTeamReportDayDto) {
    const actor = await this.requireActor(userId);
    const day = await this.requireIncomingDay(actor, id);
    if (day.status === 'APPROVED') {
      throw new BadRequestException('Báo cáo đã duyệt, không chỉnh được nữa.');
    }

    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('Lý do chỉnh là bắt buộc.');

    const patches = dto.rows ?? [];
    if (!patches.length) throw new BadRequestException('Chưa chọn dòng nào.');

    const byTaskId = new Map(day.rows.map((row) => [String(row.taskId), row]));
    let changed = 0;

    for (const patch of patches) {
      const row = byTaskId.get(patch.taskId);
      if (!row) continue;

      const task = await this.taskModel.findOne({
        _id: this.requireObjectId(patch.taskId, 'Nhiệm vụ'),
        departmentId: day.departmentId,
      });
      if (!task) {
        throw new BadRequestException(
          `Không tìm thấy nhiệm vụ "${row.name}" để ghi giá trị đã chỉnh.`,
        );
      }

      const template = await this.templateOfTask(task);
      if (!template) {
        throw new BadRequestException(
          `Nhiệm vụ "${row.name}" chưa gắn mẫu bảng nên không chỉnh được.`,
        );
      }
      const titleOf = (key: string) =>
        template.columns.find((column) => column.key === key)?.title ?? key;

      // Ghi vào reviewValues của nhiệm vụ sống, và ghi thẳng giá trị chốt vào
      // bản chụp - bản chụp là thứ đã trình nên chỉ có một con số duy nhất.
      const merged = await this.applyColumnValues(task, template, {
        fieldValues: patch.fieldValues,
        catalogValues: patch.catalogValues,
      });

      for (const key of Object.keys(patch.fieldValues ?? {})) {
        const before = row.fieldValues?.[key];
        const value = merged.fieldValues[key] ?? '';
        if (String(before ?? '') === String(value)) continue;
        row.fieldValues = { ...(row.fieldValues ?? {}), [key]: value };
        task.reviewValues = { ...(task.reviewValues ?? {}), [key]: value };
        const label = titleOf(key);
        const from = this.text(before);
        const to = this.text(value);
        this.appendEdit(day, actor, label, from, to, reason);
        this.appendEdit(task, actor, label, from, to, reason);
        changed += 1;
      }

      for (const key of Object.keys(patch.catalogValues ?? {})) {
        const before = row.catalogValues?.[key]?.name ?? '';
        const picked = merged.catalogValues[key];
        const to = picked?.name ?? '';
        if (before === to) continue;
        const nextCatalog = { ...(row.catalogValues ?? {}) };
        if (picked) nextCatalog[key] = picked;
        else delete nextCatalog[key];
        row.catalogValues = nextCatalog;
        task.reviewCatalogValues = {
          ...(task.reviewCatalogValues ?? {}),
          ...(picked ? { [key]: picked } : {}),
        };
        const label = titleOf(key);
        this.appendEdit(day, actor, label, before, to, reason);
        this.appendEdit(task, actor, label, before, to, reason);
        changed += 1;
      }

      /*
        Cấp trên chỉnh điểm gốc hay mức phần trăm thì ô tự chấm cũng phải đổi
        theo - không tính lại là bản đã trình mang một con số thuộc về lần chấm
        trước, mà nó lại là con số cấp tỉnh đọc.

        Tính trên giá trị CHỐT (số đội khai đã ghép số cấp trên chỉnh), rồi ghi
        vào cả bản chụp lẫn `reviewValues` - hai nơi phải khớp nhau.
      */
      const finalField = { ...(task.fieldValues ?? {}), ...task.reviewValues };
      const finalCatalog = {
        ...(task.catalogValues ?? {}),
        ...task.reviewCatalogValues,
      };
      const recomputed = await this.computeAutoColumns(
        template,
        finalField,
        finalCatalog,
      );
      for (const column of template.columns) {
        if (!column.autoValue) continue;
        const value = recomputed[column.key] ?? '';
        if (String(row.fieldValues?.[column.key] ?? '') === String(value)) {
          continue;
        }
        row.fieldValues = { ...(row.fieldValues ?? {}), [column.key]: value };
        task.reviewValues = {
          ...(task.reviewValues ?? {}),
          [column.key]: value,
        };
      }

      task.markModified('reviewValues');
      task.markModified('reviewCatalogValues');
      task.version += 1;
      await task.save();
    }

    if (!changed) {
      throw new BadRequestException('Không có giá trị nào thay đổi.');
    }

    day.markModified('rows');
    await day.save();

    return { message: `Đã chỉnh ${changed} giá trị.`, data: day };
  }

  async decideDay(userId: string, id: string, dto: DecideTeamReportDayDto) {
    const actor = await this.requireActor(userId);
    const day = await this.requireIncomingDay(actor, id);
    if (day.status === 'APPROVED') {
      throw new BadRequestException('Báo cáo đã được duyệt.');
    }

    if (dto.decision === 'RETURN') {
      const reason = dto.reason?.trim() ?? '';
      if (!reason) throw new BadRequestException('Lý do trả lại là bắt buộc.');
      day.status = 'RETURNED';
      day.returnReason = reason;
    } else {
      day.status = 'APPROVED';
      day.returnReason = '';
    }
    day.decidedById = actor.id;
    day.decidedByName = actor.name;
    day.decidedAt = new Date();
    await day.save();

    return {
      message: dto.decision === 'RETURN' ? 'Đã trả lại.' : 'Đã duyệt.',
      data: day,
    };
  }

  /** Phòng gộp các báo cáo đội ĐÃ DUYỆT thành một bản, trình lên tỉnh. */
  async promote(userId: string, dto: PromoteTeamReportDto) {
    const actor = await this.requireActor(userId);
    const reportDate = this.requireDate(dto.reportDate);

    const days = await this.dayModel
      .find({
        _id: {
          $in: dto.dayIds.map((id) => this.requireObjectId(id, 'Báo cáo')),
        },
        recipientDepartmentId: actor.departmentId,
      })
      .populate('departmentId', 'code name');

    if (days.length !== dto.dayIds.length) {
      throw new BadRequestException(
        'Có báo cáo không thuộc đơn vị bạn hoặc không tồn tại.',
      );
    }
    const notApproved = days.filter((day) => day.status !== 'APPROVED');
    if (notApproved.length) {
      throw new BadRequestException(
        `Còn ${notApproved.length} báo cáo chưa duyệt, chưa gộp được.`,
      );
    }
    const wrongDate = days.filter((day) => day.reportDate !== reportDate);
    if (wrongDate.length) {
      throw new BadRequestException(
        'Một bản gộp chỉ được gồm báo cáo của cùng một ngày.',
      );
    }

    const rows = days.flatMap((day) => {
      const dept = day.departmentId as unknown as {
        _id?: Types.ObjectId;
        name?: string;
      } | null;
      /*
        Liệt kê từng trường, KHÔNG dùng `{...row}`: trải một tài liệu con của
        Mongoose ra chỉ được mấy thuộc tính nội bộ ($__, _doc, __parentArray),
        và vì có `_doc` nên Mongoose lấy đúng nó làm nguồn - hai trường thêm
        vào ở ngoài rơi mất, bản gộp ra dòng không có tên đội.

        Viết tay dài hơn nhưng trình biên dịch kiểm được, và thêm cột vào bản
        chụp thì bắt buộc phải sửa ở đây chứ không im lặng bỏ sót.
      */
      return day.rows.map((row) => ({
        taskId: row.taskId,
        name: row.name,
        deadline: row.deadline,
        product: row.product,
        axisId: row.axisId,
        axisName: row.axisName,
        workContentId: row.workContentId,
        workContentName: row.workContentName,
        formTemplateId: row.formTemplateId,
        formTemplateVersion: row.formTemplateVersion,
        fieldValues: row.fieldValues,
        catalogValues: row.catalogValues,
        evidenceCount: row.evidenceCount,
        closed: row.closed,
        teamDepartmentId: dept?._id ?? null,
        teamDepartmentName: dept?.name ?? '',
      }));
    });

    const recipientDepartmentId = await this.resolveRecipientDepartment(
      actor.departmentId,
    );
    if (!recipientDepartmentId) {
      throw new BadRequestException(
        'Không tìm được cấp trên nhận báo cáo. Kiểm tra lại cây đơn vị và tài khoản cấp trên.',
      );
    }

    const unitDay = await this.unitDayModel.findOneAndUpdate(
      { departmentId: actor.departmentId, reportDate },
      {
        $set: {
          departmentId: actor.departmentId,
          reportDate,
          status: 'PENDING',
          sourceDayIds: days.map((day) => day._id),
          rows,
          sentById: actor.id,
          sentByName: actor.name,
          sentAt: new Date(),
          note: dto.note?.trim() ?? '',
          recipientDepartmentId,
          returnReason: '',
        },
      },
      { upsert: true, new: true },
    );

    return {
      message: `Đã trình bản gộp ngày ${reportDate} lên cấp trên.`,
      data: { unitDayId: String(unitDay?._id), rowCount: rows.length },
    };
  }

  /** Hộp đến của tỉnh: bản gộp các phòng trình lên. */
  async unitInbox(userId: string, query: TeamReportInboxQueryDto) {
    const actor = await this.requireActor(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 100);

    const filter: Record<string, unknown> = {
      recipientDepartmentId: actor.departmentId,
    };
    if (query.status) filter.status = query.status;
    const range: Record<string, string> = {};
    if (query.fromDate) range.$gte = this.requireDate(query.fromDate);
    if (query.toDate) range.$lte = this.requireDate(query.toDate);
    if (Object.keys(range).length) filter.reportDate = range;

    const [data, total] = await Promise.all([
      this.unitDayModel
        .find(filter)
        .sort({ reportDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('departmentId', 'code name'),
      this.unitDayModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  // ======================================== mẫu bảng động theo trục

  /**
   * Bộ cột của từng trục, tra bằng id trục.
   *
   * Quản trị gán mỗi trục đúng một mẫu đang hoạt động, nên tra một lượt cho cả
   * danh sách rồi phát cho client - đổi trục là dựng lại bảng ngay, không phải
   * gọi thêm lượt nào.
   */
  private async templatesByAxis(axisIds: string[]) {
    const templates = await this.formTemplateModel
      .find({
        axisIds: { $in: axisIds.map((id) => new Types.ObjectId(id)) },
        isActive: true,
      })
      .select('code name version columns headerGroups footer axisIds');

    const byAxis: Record<string, ResolvedTemplate | null> = {};
    for (const axisId of axisIds) byAxis[axisId] = null;
    for (const template of templates) {
      for (const axisId of template.axisIds ?? []) {
        byAxis[String(axisId)] = {
          _id: String(template._id),
          code: template.code,
          name: template.name,
          version: template.version,
          columns: template.columns,
          headerGroups: template.headerGroups,
          footer: template.footer,
        };
      }
    }
    return byAxis;
  }

  /** Mẫu đang gắn với nhiệm vụ, theo đúng phiên bản đã đóng dấu lúc phân loại. */
  private async templateOfTask(
    task: TeamReportTaskDocument,
  ): Promise<ResolvedTemplate | null> {
    if (!task.formTemplateId) return null;
    const resolved = await this.formTemplatesService.resolveVersion(
      task.formTemplateId,
      task.formTemplateVersion ?? 1,
    );
    if (!resolved) return null;
    return { _id: String(task.formTemplateId), ...resolved };
  }

  /**
   * Đóng dấu mẫu của trục lên nhiệm vụ.
   *
   * Ghi lại cả id lẫn phiên bản: quản trị sửa mẫu về sau thì nhiệm vụ cũ vẫn
   * bày đúng bộ cột lúc khai. Không có trục hoặc trục chưa gán mẫu thì xoá dấu
   * chứ không giữ dấu cũ - giữ lại là bày bộ cột của trục khác.
   */
  private async stampTemplate(task: TeamReportTaskDocument) {
    if (!task.axisId) {
      task.formTemplateId = null;
      task.formTemplateVersion = null;
      return;
    }
    const template = await this.formTemplateModel
      .findOne({ axisIds: task.axisId, isActive: true })
      .select('version');
    task.formTemplateId = template ? template._id : null;
    task.formTemplateVersion = template ? template.version : null;
  }

  /**
   * Ghi giá trị vào đúng các cột của mẫu.
   *
   * Bỏ qua khoá không thuộc mẫu và cột hệ thống tự tính: nhận bừa thì client
   * gửi khoá nào cũng lưu, và dữ liệu rác đó theo lên tận bản chụp của cấp
   * trên. Cột danh mục thì tra lại tên tại thời điểm ghi để bảng đọc được mà
   * không phải tra lại, và để tên giữ nguyên nếu danh mục đổi về sau.
   */
  private async applyColumnValues(
    task: TeamReportTaskDocument,
    template: ResolvedTemplate | null,
    input: {
      fieldValues?: Record<string, string | number>;
      catalogValues?: Record<string, string>;
    },
    options: {
      /**
       * Ghi ngược lên trường giai đoạn 1 hay không.
       *
       * Bật khi người sửa đang chấm chính nhiệm vụ đó: cột "Sản phẩm" của mẫu
       * và ô sản phẩm ở bảng nhập là một thứ, sửa bên nào cũng phải sang bên
       * kia.
       */
      syncEntryFields?: boolean;
      /**
       * Bỏ qua ràng buộc "điểm phải nằm trong dải của nhóm điểm".
       *
       * Bật cho CẤP TRÊN chấm lại: họ là người quyết cuối cùng, chặn họ ở một
       * dải do danh mục khai sẵn là chặn đúng người có thẩm quyền sửa. Đội tự
       * khai thì vẫn giữ ràng buộc - bắt lỗi sớm ngay lúc gõ vẫn tốt hơn để số
       * sai đi lên tới tỉnh.
       */
      skipRangeCheck?: boolean;
    } = {},
  ) {
    const { syncEntryFields = false, skipRangeCheck = false } = options;
    const fieldValues = { ...(task.fieldValues ?? {}) };
    const catalogValues = { ...(task.catalogValues ?? {}) };
    if (!template) return { fieldValues, catalogValues };

    const byKey = new Map(
      template.columns
        .filter((column) => column.visible)
        .map((column) => [column.key, column]),
    );
    /*
      Ba cột này là bản sao của trường giai đoạn 1. Đội sửa ở bảng chấm thì phải
      ghi NGƯỢC lên trường gốc, không thì lần sau ai đó lưu bảng nhập là
      `syncEntryColumns` chép đè lại giá trị cũ và thứ vừa gõ biến mất.
    */
    const entryKeys = syncEntryFields
      ? this.entryColumnKeys(template)
      : ({} as ReturnType<typeof this.entryColumnKeys>);

    for (const [key, raw] of Object.entries(input.fieldValues ?? {})) {
      const column = byKey.get(key);
      if (!column || column.autoValue) continue;
      const value = String(raw ?? '').trim();

      if (key === entryKeys.product) task.product = value;
      else if (key === entryKeys.deadline) task.deadline = value;
      else if (key === entryKeys.title && value) task.name = value;

      if (!value) {
        delete fieldValues[key];
        continue;
      }
      if (column.dataType === 'number') {
        const parsed = Number(value.replace(',', '.'));
        if (!Number.isFinite(parsed)) {
          throw new BadRequestException(`Cột "${column.title}" phải là số.`);
        }
        if (!skipRangeCheck) {
          await this.assertNumberInRange(
            template,
            column,
            parsed,
            catalogValues,
          );
        }
        fieldValues[key] = parsed;
        continue;
      }
      if (column.dataType === 'date' && !isYmd(value)) {
        throw new BadRequestException(
          `Cột "${column.title}" phải có dạng YYYY-MM-DD.`,
        );
      }
      fieldValues[key] = value;
    }

    for (const [key, raw] of Object.entries(input.catalogValues ?? {})) {
      const column = byKey.get(key);
      if (!column) continue;
      const catalog = catalogOfSemantic(column.semanticKey);
      if (!catalog) continue;

      const id = String(raw ?? '').trim();
      if (!id) {
        delete catalogValues[key];
        continue;
      }
      const name = await this.catalogName(catalog, id);
      if (!name) {
        throw new BadRequestException(
          `Giá trị chọn ở cột "${column.title}" không còn trong danh mục.`,
        );
      }
      catalogValues[key] = { id, name };

      /*
        Cột "Nội dung công việc" của mẫu CHÍNH LÀ phân loại của nhiệm vụ.

        Đồng bộ ngược lên trường cứng `workContentId` chứ không để hai nơi giữ
        hai giá trị: chỗ đếm "đã phân loại hết chưa" và chỗ gom nhóm đều đọc
        trường cứng, mà người dùng lại chọn ở cột của mẫu.
      */
      if (column.semanticKey === 'work_content') {
        task.workContentId = await this.requireWorkContentOfAxis(
          id,
          task.axisId,
        );
      }
    }

    return { fieldValues, catalogValues };
  }

  /**
   * Điểm từng trục của một tập dòng.
   *
   * Gom theo TRỤC chứ không theo mẫu: Trục 1, 3, 4 dùng chung một mẫu, gom theo
   * mẫu là ba trục dồn thành một khối và ra một con số không thuộc trục nào.
   *
   * Bộ cột thì lấy theo PHIÊN BẢN MỚI NHẤT trong số các dòng của trục đó - quản
   * trị sửa mẫu giữa kỳ thì các dòng mang hai phiên bản, mà dòng tổng chỉ có
   * một hàng nên phải chọn một bộ tiêu đề.
   */
  private async axisScoresOf(
    rows: Array<{
      axisId: Types.ObjectId | string | null;
      formTemplateId: Types.ObjectId | string | null;
      formTemplateVersion: number | null;
      fieldValues?: Record<string, string | number> | null;
      catalogValues?: Record<string, { id: string; name: string }> | null;
      reviewValues?: Record<string, string | number> | null;
      reviewCatalogValues?: Record<string, { id: string; name: string }> | null;
    }>,
    templates: Record<string, ResolvedTemplate>,
    catalogs: ScoreCatalogs,
  ) {
    const byAxis = new Map<string, typeof rows>();
    for (const row of rows) {
      const id = row.axisId ? String(row.axisId) : '';
      if (!id) continue;
      byAxis.set(id, [...(byAxis.get(id) ?? []), row]);
    }
    if (!byAxis.size) return [];

    const axes = await this.axisModel
      .find({
        _id: { $in: [...byAxis.keys()].map((id) => new Types.ObjectId(id)) },
      })
      .select('code name maxScore sortOrder')
      .sort({ sortOrder: 1, code: 1 });

    return axes.map((axis) => {
      const axisRows = byAxis.get(String(axis._id)) ?? [];

      let key = '';
      let version = -1;
      for (const row of axisRows) {
        if (!row.formTemplateId) continue;
        const rowVersion = row.formTemplateVersion ?? 1;
        if (rowVersion > version) {
          version = rowVersion;
          key = `${String(row.formTemplateId)}:${rowVersion}`;
        }
      }
      const template = templates[key] ?? null;

      const totals = computeAxisFooter(
        axisRows,
        template?.columns ?? [],
        template?.footer as never,
        axis.maxScore ?? 0,
        catalogs,
      );

      return {
        axisId: String(axis._id),
        axisName: axis.name,
        maxScore: axis.maxScore ?? 0,
        taskCount: axisRows.length,
        /** Khoá mẫu để client bày dòng tổng dưới đúng bộ cột. */
        templateKey: key,
        /** Diễn giải công thức - để bảng ghi được "[(B/A)+(C/A)] / 2" như mẫu giấy. */
        formula: describeFooter(
          template?.columns ?? [],
          template?.footer as never,
          totals.columnTotals,
        ),
        ...totals,
      };
    });
  }

  /**
   * Tính lại các ô `autoValue` - "Điểm tự chấm" và những cột cùng loại.
   *
   * Cột tự tính KHÔNG nhận giá trị client gửi lên (`applyColumnValues` bỏ qua
   * chúng), nên nếu không có chỗ nào tính thì ô đó trống vĩnh viễn: chọn xong
   * phần trăm mà điểm vẫn là dấu gạch.
   *
   * Công thức lấy từ CẤU HÌNH của cột (`kind`, `percentColumnKey`,
   * `baseColumnKey`) chứ không đoán theo tiêu đề, và dùng chung hàm
   * `computeAutoValue` với bản nghiệp vụ cũ - hai bản ra hai con số khác nhau
   * cho cùng một mẫu là hỏng hơn cả không tính.
   *
   * Trả về bộ giá trị MỚI, không sửa tại chỗ: chỗ gọi có nơi ghi vào nhiệm vụ
   * sống, có nơi ghi vào bản chụp của cấp trên.
   */
  private async computeAutoColumns(
    template: ResolvedTemplate | null,
    fieldValues: Record<string, string | number>,
    catalogValues: Record<string, { id: string; name: string }>,
  ): Promise<Record<string, string | number>> {
    const autos = (template?.columns ?? []).filter(
      (column) => column.visible && column.autoValue,
    );
    if (!autos.length) return fieldValues;

    const percentIds = new Set<string>();
    for (const column of autos) {
      const id = catalogValues[column.autoValue!.percentColumnKey]?.id;
      if (id) percentIds.add(id);
    }
    const levels = percentIds.size
      ? await this.qualityLevelModel
          .find({
            _id: { $in: [...percentIds].map((id) => new Types.ObjectId(id)) },
          })
          .select('percent')
      : [];
    const percentById = new Map(
      levels.map((row) => [String(row._id), row.percent] as const),
    );

    const next = { ...fieldValues };
    for (const column of autos) {
      const auto = column.autoValue!;
      const percentId = catalogValues[auto.percentColumnKey]?.id ?? '';
      const percent = percentId ? (percentById.get(percentId) ?? null) : null;

      const rawBase = next[auto.baseColumnKey];
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
      /* Thiếu đầu vào thì BỎ TRỐNG chứ không ghi 0: ô hiện 0 đọc ra thành "đã
         chấm 0 điểm", khác hẳn nghĩa "chưa chấm". */
      if (value === null) delete next[column.key];
      else next[column.key] = value;
    }
    return next;
  }

  /**
   * Cột nào của mẫu là bản sao của trường giai đoạn 1 nào.
   *
   * Một chỗ khai duy nhất cho CẢ HAI CHIỀU: bảng nhập ghi xuống cột, và người
   * phân loại gõ vào cột thì ghi ngược lên bảng nhập. Hai chiều mà dò cột theo
   * hai luật riêng thì chỉ cần lệch một cột là giá trị chạy vòng quanh rồi mất.
   */
  private entryColumnKeys(template: ResolvedTemplate | null) {
    if (!template) return {};
    const visible = template.columns.filter(
      (column) => column.visible && !column.autoValue,
    );

    /* Sản phẩm: CHỈ nhận đúng cột khoá 'product'. Không đoán theo tiêu đề - đoán
       trúng cột khác là đè mất thứ người ta đã gõ. */
    const product = visible.find(
      (column) => column.key === 'product' && column.dataType === 'text',
    );

    /*
      Tên việc: cột chữ tự do đầu tiên - ở mẫu mặc định đó là cột "Nhiệm vụ".
      PHẢI loại cột sản phẩm ra: mẫu Trục 2 không có cột tên việc dạng chữ (tên
      lấy từ danh mục), nên cột chữ tự do đầu tiên của nó chính là "Sản phẩm" -
      không loại thì tên nhiệm vụ bị ghi đè lên ô sản phẩm.
    */
    const title = visible.find(
      (column) =>
        column.semanticKey === 'custom' &&
        column.dataType === 'text' &&
        column.key !== 'note' &&
        column.key !== product?.key,
    );

    const deadline = visible.find(
      (column) => column.key === 'deadline' && column.dataType === 'date',
    );

    return {
      product: product?.key,
      title: title?.key,
      deadline: deadline?.key,
    };
  }

  /**
   * Chép những gì giai đoạn 1 đã khai vào đúng cột của mẫu.
   *
   * Mẫu của trục đã có sẵn cột tên nhiệm vụ, cột hạn và cột sản phẩm, mà bảng
   * nhập trong ngày cũng hỏi đúng ba thứ đó. Chạy lại mỗi lần giai đoạn 1 đổi,
   * chứ không phải chỉ điền một lần lúc chọn trục: chỉ điền một lần thì ai gõ
   * sản phẩm sau khi đã chọn trục sẽ thấy ô bên bảng chấm trống mãi.
   */
  private async syncEntryColumns(task: TeamReportTaskDocument) {
    const template = await this.templateOfTask(task);
    if (!template) return;

    const keys = this.entryColumnKeys(template);
    const fieldValues = { ...(task.fieldValues ?? {}) };

    if (keys.product) fieldValues[keys.product] = task.product ?? '';
    if (keys.title && task.name) fieldValues[keys.title] = task.name;
    if (keys.deadline) fieldValues[keys.deadline] = task.deadline ?? '';

    task.fieldValues = fieldValues;
    task.markModified('fieldValues');
  }

  /**
   * Số nhập phải nằm trong dải của nhóm điểm mà cột trỏ tới.
   *
   * CHẶN chứ không chỉ cảnh báo: cảnh báo suông thì con số sai vẫn đi lên tới
   * cấp tỉnh, tới đó mới phát hiện là phải trả ngược cả chuỗi.
   */
  private async assertNumberInRange(
    template: ResolvedTemplate,
    column: FormTemplateColumn,
    value: number,
    catalogValues: Record<string, { id: string; name: string }>,
  ) {
    if (!column.rangeFromColumnKey) return;
    const source = template.columns.find(
      (item) => item.key === column.rangeFromColumnKey,
    );
    if (!source || source.semanticKey !== 'score_group') return;

    const groupId = catalogValues[source.key]?.id;
    if (!groupId) return;

    const group = await this.scoreGroupModel
      .findById(groupId)
      .select('name minScore maxScore');
    if (!group) return;

    if (value < group.minScore || value > group.maxScore) {
      throw new BadRequestException(
        `Cột "${column.title}" phải trong ${group.minScore}-${group.maxScore} của nhóm "${group.name}".`,
      );
    }
  }

  /** Danh mục cho các cột kiểu chọn có mặt trong những mẫu đang dùng. */
  private async catalogsForTemplates(
    templates: Array<ResolvedTemplate | null>,
  ) {
    const needed = new Set<string>();
    for (const template of templates) {
      for (const column of template?.columns ?? []) {
        if (!column.visible) continue;
        const catalog = catalogOfSemantic(column.semanticKey);
        if (catalog) needed.add(catalog);
      }
    }

    const result: Record<string, Array<{ _id: string; name: string }>> = {};
    /*
      Nội dung công việc cũng là một danh mục cột chọn.

      Trả kèm `axisId` để màn nhập lọc lại theo trục đang chọn: bày cả 12 nội
      dung của mọi trục thì người dùng chọn nhầm, mà server lại chặn - hoá ra
      bắt họ đoán xem mục nào thuộc trục nào.
    */
    if (needed.has('work_content')) {
      result.work_content = (
        await this.workContentModel
          .find({ isActive: true })
          .select('name axisId')
          .sort({ sortOrder: 1, code: 1 })
      ).map((row) => ({
        _id: String(row._id),
        name: row.name,
        axisId: String(row.axisId),
      }));
    }
    if (needed.has('work_task')) {
      result.work_task = (
        await this.workTaskModel
          .find({ isActive: true })
          .select('name workContentId')
          .sort({ sortOrder: 1, code: 1 })
      ).map((row) => ({
        _id: String(row._id),
        name: row.name,
        workContentId: String(row.workContentId),
      }));
    }
    if (needed.has('score_group')) {
      result.score_group = (
        await this.scoreGroupModel
          .find({ isActive: true })
          .select('name minScore maxScore')
          .sort({ code: 1 })
      ).map((row) => ({
        _id: String(row._id),
        name: row.name,
        minScore: row.minScore,
        maxScore: row.maxScore,
      }));
    }
    if (needed.has('quality_level')) {
      result.quality_level = (
        await this.qualityLevelModel
          .find({ isActive: true })
          .select('name percent')
          .sort({ percent: -1 })
      ).map((row) => ({
        _id: String(row._id),
        name: row.name,
        percent: row.percent,
      }));
    }
    if (needed.has('criterion')) {
      result.criterion = (
        await this.criterionModel
          .find({ isActive: true })
          .select('name note maxScore')
          .sort({ sortOrder: 1, code: 1 })
      ).map((row) => ({
        _id: String(row._id),
        name: row.name,
        note: row.note,
        maxScore: row.maxScore,
      }));
    }
    return result;
  }

  /** Tên hiện tại của một mục danh mục; rỗng nghĩa là id không còn dùng được. */
  private async catalogName(catalog: string, id: string): Promise<string> {
    if (!Types.ObjectId.isValid(id)) return '';
    const objectId = new Types.ObjectId(id);
    if (catalog === 'work_content') {
      return (
        (await this.workContentModel.findById(objectId).select('name'))?.name ??
        ''
      );
    }
    if (catalog === 'work_task') {
      return (
        (await this.workTaskModel.findById(objectId).select('name'))?.name ?? ''
      );
    }
    if (catalog === 'score_group') {
      return (
        (await this.scoreGroupModel.findById(objectId).select('name'))?.name ??
        ''
      );
    }
    if (catalog === 'quality_level') {
      return (
        (await this.qualityLevelModel.findById(objectId).select('name'))
          ?.name ?? ''
      );
    }
    if (catalog === 'criterion') {
      return (
        (await this.criterionModel.findById(objectId).select('name'))?.name ??
        ''
      );
    }
    return '';
  }

  /** Nội dung công việc phải thuộc đúng trục đã chọn. */
  private async requireWorkContentOfAxis(
    id: string,
    axisId: Types.ObjectId | null,
  ) {
    const content = await this.workContentModel
      .findById(this.requireObjectId(id, 'Nội dung công việc'))
      .select('axisId');
    if (!content) {
      throw new BadRequestException('Nội dung công việc không tồn tại.');
    }
    if (axisId && String(content.axisId) !== String(axisId)) {
      throw new BadRequestException(
        'Nội dung công việc không thuộc trục đã chọn.',
      );
    }
    return content._id;
  }

  // ======================================== báo cáo tổng hợp theo kỳ của đội

  /**
   * Kho nhiệm vụ để tích chọn vào một bản tổng hợp.
   *
   * Chỉ trả việc ĐÃ SẴN SÀNG: đủ trục, đủ nội dung công việc, và không còn ô bắt
   * buộc nào của mẫu bỏ trống. Bày cả việc dở dang thì người lập phải tự đoán
   * dòng nào đủ điều kiện, mà đoán sai là báo cáo trình lên thiếu số.
   *
   * Không phân trang: tích chọn chỉ có nghĩa khi nhìn được cả kỳ một lượt. Chặn
   * bằng trần dòng và báo `truncated` thay vì cắt trang.
   */
  async summaryCandidates(
    userId: string,
    query: TeamReportSummaryCandidatesQueryDto,
  ) {
    const actor = await this.requireActor(userId);
    const { fromDate, toDate } = this.requirePeriod(
      query.fromDate,
      query.toDate,
    );

    /*
      Một nhiệm vụ thuộc về kỳ nếu nó CÒN SỐNG trong kỳ đó: khai trước lúc kỳ
      kết thúc, và chưa đóng hoặc đóng trong kỳ. Đây đúng là luật của bảng ngày,
      chỉ nới từ một ngày thành một khoảng.
    */
    /** Việc có còn sống trong kỳ không - luật của bảng ngày, nới ra một khoảng. */
    const inPeriod = (task: TeamReportTaskDocument) =>
      task.createdDate <= toDate &&
      (task.isOpen || (task.closedDate ?? '') >= fromDate);

    const all = query.scope === 'ALL';
    const filter: Record<string, unknown> = {
      departmentId: actor.departmentId,
      ...(all
        ? {}
        : {
            createdDate: { $lte: toDate },
            $or: [{ isOpen: true }, { closedDate: { $gte: fromDate } }],
          }),
    };
    if (query.q?.trim()) {
      const like = { $regex: this.likeRegex(query.q) };
      filter.$and = [{ $or: [{ name: like }, { product: like }] }];
    }

    const tasks = await this.taskModel
      .find(filter)
      /* Quét cả kho thì việc MỚI phải sống sót qua trần: cắt mất việc vừa khai
         hôm qua để giữ lại việc từ năm ngoái là vô lý. Quét trong kỳ thì gom
         theo trục cho dễ nhìn, vì kỳ đã đủ hẹp. */
      .sort(
        all
          ? { createdDate: -1, axisId: 1, createdAt: -1 }
          : { axisId: 1, workContentId: 1, createdDate: -1, createdAt: 1 },
      )
      .limit(SUMMARY_CANDIDATES_MAX)
      .populate('axisId', 'code name sortOrder')
      .populate('workContentId', 'code name');

    const templates = await this.templatesByAxis([
      ...new Set(tasks.map((task) => this.axisIdOf(task)).filter(Boolean)),
    ]);

    /* Việc đã nằm trong một bản ĐÃ TRÌNH thì đánh dấu, KHÔNG loại bỏ: một việc
       kéo dài cả tháng nằm trong cả bản tuần lẫn bản tháng là chuyện bình
       thường. Người lập cần biết để khỏi trình trùng ngoài ý muốn, chứ không
       phải bị chặn. */
    const sentTaskIds = new Set(
      (
        await this.summaryModel
          .find({
            departmentId: actor.departmentId,
            status: { $ne: 'DRAFT' },
          })
          .select('rows.taskId')
      ).flatMap((summary) =>
        (summary.rows ?? []).map((row) => String(row.taskId)),
      ),
    );

    const ready = tasks.filter((task) =>
      this.isTaskReady(task, templates[this.axisIdOf(task)] ?? null),
    );

    return {
      message: 'OK',
      data: {
        fromDate,
        toDate,
        tasks: ready.map((task) => ({
          task,
          alreadySent: sentTaskIds.has(String(task._id)),
          inPeriod: inPeriod(task),
        })),
        /** Tổng số việc trong kỳ, kể cả việc chưa sẵn sàng - để nói rõ đã lọc. */
        scanned: tasks.length,
        notReady: tasks.length - ready.length,
        truncated: tasks.length >= SUMMARY_CANDIDATES_MAX,
      },
    };
  }

  /**
   * Cấp trên chọn được để nhận bản tổng hợp.
   *
   * Tự dò trong module này chứ không gọi sang `personal-mission`: hai bản nghiệp
   * vụ phải gỡ rời được, mà một lời gọi chéo là đủ để dính vào nhau.
   *
   * Lấy MỌI cấp trên trong nhánh có quyền duyệt, không dừng ở cấp gần nhất như
   * bản ngày - bản tổng hợp là người lập tự quyết trình cho ai.
   */
  async summaryRecipients(userId: string, q?: string) {
    const actor = await this.requireActor(userId);
    const department = await this.departmentModel
      .findById(actor.departmentId)
      .select('ancestors');
    const ancestors = department?.ancestors ?? [];
    if (!ancestors.length) return { message: 'OK', data: { people: [] } };

    const reviewerRoles = await this.roleModel
      .find({ permissions: Permission.TEAM_REPORT_REVIEW, isActive: true })
      .select('code');
    if (!reviewerRoles.length) return { message: 'OK', data: { people: [] } };

    const filter: Record<string, unknown> = {
      isActive: true,
      departmentId: { $in: [...ancestors].reverse() },
      'roleAssignments.roleCode': {
        $in: reviewerRoles.map((role) => role.code),
      },
    };
    if (q?.trim()) {
      const like = { $regex: this.likeRegex(q) };
      filter.$or = [{ fullName: like }, { username: like }];
    }

    const found = await this.userModel
      .find(filter)
      .select('fullName username departmentId')
      .populate('departmentId', 'code name')
      .sort({ fullName: 1, username: 1 })
      .limit(200);

    return {
      message: 'OK',
      data: {
        people: found.map((user) => {
          const dept = user.departmentId as unknown as {
            _id?: Types.ObjectId;
            name?: string;
          } | null;
          return {
            id: String(user._id),
            fullName: user.fullName?.trim() || user.username,
            departmentId: dept?._id ? String(dept._id) : null,
            departmentName: dept?.name ?? '',
          };
        }),
      },
    };
  }

  /**
   * Xem trước điểm của một TẬP NHIỆM VỤ, chưa lập báo cáo nào.
   *
   * Để người lập cân nhắc trước khi chốt: tích thêm bớt vài việc rồi nhìn tổng
   * điểm đổi theo. Không có nó thì phải lập bản, xem điểm, xoá đi, lập lại.
   *
   * Dùng LẠI đúng `axisScoresOf` của bản đã lập - xem trước mà tính bằng công
   * thức khác thì con số xem trước là con số không có thật.
   */
  async previewSummaryScore(userId: string, dto: PreviewTeamReportSummaryDto) {
    const actor = await this.requireActor(userId);
    const ids = [...new Set(dto.taskIds)].map((id) =>
      this.requireObjectId(id, 'Nhiệm vụ'),
    );
    if (!ids.length) {
      return { message: 'OK', data: { axisScores: [] } };
    }

    const tasks = await this.taskModel
      .find({ _id: { $in: ids }, departmentId: actor.departmentId })
      .populate('axisId', 'code name');

    const templates = await this.templatesOfRows(
      tasks.map((task) => ({
        formTemplateId: task.formTemplateId,
        formTemplateVersion: task.formTemplateVersion,
      })) as never,
    );
    const catalogs = await this.catalogsForTemplates(Object.values(templates));
    const axisScores = await this.axisScoresOf(
      tasks.map((task) => ({
        axisId: this.axisIdOf(task) || null,
        formTemplateId: task.formTemplateId,
        formTemplateVersion: task.formTemplateVersion,
        fieldValues: task.fieldValues,
        catalogValues: task.catalogValues,
        reviewValues: task.reviewValues,
        reviewCatalogValues: task.reviewCatalogValues,
      })),
      templates,
      catalogs,
    );

    return { message: 'OK', data: { axisScores } };
  }

  /** Lập một bản tổng hợp ở trạng thái nháp - chưa đi đâu cả. */
  async createSummary(userId: string, dto: CreateTeamReportSummaryDto) {
    const actor = await this.requireActor(userId);
    const { fromDate, toDate } = this.requirePeriod(dto.fromDate, dto.toDate);
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Tên báo cáo là bắt buộc.');

    const ids = [...new Set(dto.taskIds)].map((id) =>
      this.requireObjectId(id, 'Nhiệm vụ'),
    );
    const tasks = await this.taskModel
      .find({ _id: { $in: ids }, departmentId: actor.departmentId })
      .populate('axisId', 'code name')
      .populate('workContentId', 'code name');

    /* Đếm lại thay vì tin danh sách gửi lên: id lạ hoặc id của đội khác lọt vào
       thì báo cáo thiếu dòng mà không ai biết. */
    if (tasks.length !== ids.length) {
      throw new BadRequestException(
        'Một số nhiệm vụ không thuộc đơn vị bạn hoặc không còn tồn tại.',
      );
    }

    const templates = await this.templatesByAxis([
      ...new Set(tasks.map((task) => this.axisIdOf(task)).filter(Boolean)),
    ]);
    const notReady = tasks.filter(
      (task) => !this.isTaskReady(task, templates[this.axisIdOf(task)] ?? null),
    );
    if (notReady.length) {
      throw new BadRequestException(
        `Còn ${notReady.length} nhiệm vụ chưa sẵn sàng: ${notReady
          .map((task) => task.name)
          .slice(0, 3)
          .join(', ')}.`,
      );
    }

    const summary = await this.summaryModel.create({
      departmentId: actor.departmentId,
      title,
      period: dto.period as TeamReportPeriod,
      fromDate,
      toDate,
      rows: tasks.map((task) => this.snapshotOf(task, !task.isOpen)),
      status: 'DRAFT' as const,
      note: dto.note?.trim() ?? '',
    });

    return {
      message: `Đã lập báo cáo với ${tasks.length} nhiệm vụ.`,
      data: summary,
    };
  }

  /**
   * Trình bản tổng hợp lên cấp trên đã chọn.
   *
   * Chụp LẠI nhiệm vụ ngay lúc trình chứ không dùng bản chụp lúc lập: từ lúc lập
   * tới lúc trình đội vẫn chấm tiếp, trình đi con số của mấy hôm trước thì cấp
   * trên duyệt một thứ không còn đúng.
   */
  async sendSummary(userId: string, id: string, dto: SendTeamReportSummaryDto) {
    const actor = await this.requireActor(userId);
    const summary = await this.requireOwnSummary(actor, id);

    if (summary.status !== 'DRAFT' && summary.status !== 'RETURNED') {
      throw new BadRequestException('Báo cáo này đã trình rồi.');
    }

    const recipient = await this.requireSummaryRecipient(
      actor,
      dto.recipientId,
    );

    const tasks = await this.taskModel
      .find({
        _id: { $in: summary.rows.map((row) => row.taskId) },
        departmentId: actor.departmentId,
      })
      .populate('axisId', 'code name')
      .populate('workContentId', 'code name');
    if (!tasks.length) {
      throw new BadRequestException('Báo cáo không còn nhiệm vụ nào để trình.');
    }

    summary.rows = tasks.map((task) => this.snapshotOf(task, !task.isOpen));
    summary.status = 'PENDING';
    summary.recipientId = recipient.id;
    summary.recipientName = recipient.name;
    summary.recipientDepartmentId = recipient.departmentId;
    summary.sentById = actor.id;
    summary.sentByName = actor.name;
    summary.sentAt = new Date();
    summary.returnReason = '';
    if (dto.note?.trim()) summary.note = dto.note.trim();
    this.appendEdit(
      summary,
      actor,
      'Trạng thái',
      'nháp',
      `đã trình ${recipient.name}`,
      '',
    );
    await summary.save();

    return {
      message: `Đã trình báo cáo lên ${recipient.name}.`,
      data: summary,
    };
  }

  /** Danh sách bản tổng hợp đội đã lập. */
  async listSummaries(userId: string, query: TeamReportSummaryListQueryDto) {
    const actor = await this.requireActor(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: Record<string, unknown> = {
      departmentId: actor.departmentId,
    };
    if (query.status) filter.status = query.status;

    const [rows, total] = await Promise.all([
      this.summaryModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.summaryModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(rows, total, page, limit, 'OK');
  }

  /**
   * Hộp đến bản tổng hợp của cấp trên.
   *
   * Lọc theo ĐƠN VỊ nhận chứ không theo đúng người được chọn: cả phòng dùng
   * chung tài khoản, mà kể cả khi không thì trưởng phòng đi vắng vẫn phải có
   * người mở ra duyệt. Lọc theo cá nhân là báo cáo kẹt trong một tài khoản.
   * Tên người được trình đích danh vẫn lưu ở `recipientName` để biết ai được
   * nhắm tới.
   */
  async summaryInbox(userId: string, query: TeamReportSummaryListQueryDto) {
    const actor = await this.requireActor(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const filter: Record<string, unknown> = {
      recipientDepartmentId: actor.departmentId,
      // Bản nháp của đội chưa trình đi thì cấp trên không được thấy.
      status: { $ne: 'DRAFT' },
    };
    if (query.status) filter.status = query.status;

    const [rows, total] = await Promise.all([
      this.summaryModel
        .find(filter)
        .sort({ sentAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('departmentId', 'code name'),
      this.summaryModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(rows, total, page, limit, 'OK');
  }

  /** Đội lập đọc được bản của mình; cấp trên đọc được bản trình tới đơn vị mình. */
  async summaryDetail(userId: string, id: string) {
    const actor = await this.requireActor(userId);
    const summary = await this.requireVisibleSummary(actor, id);
    const templates = await this.templatesOfRows(summary.rows);
    const catalogs = await this.catalogsForTemplates(Object.values(templates));
    const axisScores = await this.axisScoresOf(
      summary.rows,
      templates,
      catalogs,
    );
    return {
      message: 'OK',
      data: { summary, templates, catalogs, axisScores },
    };
  }

  /** Cấp trên duyệt hoặc trả lại một bản tổng hợp. */
  async decideSummary(userId: string, id: string, dto: DecideTeamReportDayDto) {
    const actor = await this.requireActor(userId);
    const summary = await this.summaryModel.findById(
      this.requireObjectId(id, 'Báo cáo'),
    );
    if (!summary) throw new NotFoundException('Không tìm thấy báo cáo.');
    if (
      String(summary.recipientDepartmentId ?? '') !== String(actor.departmentId)
    ) {
      throw new ForbiddenException('Báo cáo này không trình tới đơn vị bạn.');
    }
    if (summary.status === 'DRAFT') {
      throw new BadRequestException('Báo cáo này chưa được trình lên.');
    }
    if (summary.status === 'APPROVED') {
      throw new BadRequestException('Báo cáo đã được duyệt.');
    }

    if (dto.decision === 'RETURN') {
      const reason = dto.reason?.trim() ?? '';
      if (!reason) throw new BadRequestException('Lý do trả lại là bắt buộc.');
      summary.status = 'RETURNED';
      summary.returnReason = reason;
    } else {
      summary.status = 'APPROVED';
      summary.returnReason = '';
    }
    summary.decidedById = actor.id;
    summary.decidedByName = actor.name;
    summary.decidedAt = new Date();
    this.appendEdit(
      summary,
      actor,
      'Trạng thái',
      'đã trình',
      dto.decision === 'RETURN' ? 'trả lại' : 'đã duyệt',
      dto.reason?.trim() ?? '',
    );
    await summary.save();

    return {
      message: dto.decision === 'RETURN' ? 'Đã trả lại.' : 'Đã duyệt.',
      data: summary,
    };
  }

  /**
   * Đội chấm lại ngay trên bản tổng hợp - CHỈ khi bản còn nháp.
   *
   * Ghi thẳng vào NHIỆM VỤ SỐNG rồi chụp lại dòng, không sửa riêng bản chụp:
   * bản nháp chưa trình đi đâu nên nhiệm vụ vẫn là nguồn duy nhất. Sửa riêng
   * bản chụp là con số ở đây một đằng, bảng ngày một nẻo, không ai biết bên nào
   * đúng.
   *
   * Đã trình rồi thì đội hết quyền: bản đó cấp trên đang cầm, đổi số dưới tay
   * họ mà không ai báo là chuyện khác hẳn.
   */
  async editSummaryRows(
    userId: string,
    id: string,
    dto: EditTeamReportSummaryDto,
  ) {
    const actor = await this.requireActor(userId);
    const summary = await this.requireOwnSummary(actor, id);
    /*
      Sửa được khi bản CHƯA TRÌNH, hoặc BỊ TRẢ LẠI.

      Bị trả lại đúng là lúc đội cần sửa nhất - cấp trên vừa nói thiếu chỗ nào
      thì phải chữa được rồi trình lại. Chặn ở đó thì đường duy nhất là lập một
      bản mới, mà lý do trả lại lại nằm ở bản cũ.
    */
    if (summary.status !== 'DRAFT' && summary.status !== 'RETURNED') {
      throw new BadRequestException(
        'Báo cáo đang chờ cấp trên duyệt nên đội không sửa được. Chờ duyệt hoặc chờ trả lại.',
      );
    }

    const inSummary = new Set(summary.rows.map((row) => String(row.taskId)));
    let changed = 0;

    for (const patch of dto.rows) {
      if (!inSummary.has(patch.taskId)) {
        throw new BadRequestException(
          'Có nhiệm vụ không nằm trong báo cáo này.',
        );
      }
      const task = await this.requireOwnTask(actor, patch.taskId);
      // Cùng một luật với tab Phân loại: việc đã chốt thì phải mở lại đã.
      this.assertClosedNotEdited(task);

      const template = await this.templateOfTask(task);
      const before = this.snapshotValues(task, template);
      const merged = await this.applyColumnValues(
        task,
        template,
        { fieldValues: patch.fieldValues, catalogValues: patch.catalogValues },
        // Đội tự chấm nên cột sản phẩm / tên / hạn ghi ngược lên giai đoạn 1.
        { syncEntryFields: true },
      );
      task.fieldValues = await this.computeAutoColumns(
        template,
        merged.fieldValues,
        merged.catalogValues,
      );
      task.catalogValues = merged.catalogValues;
      task.markModified('fieldValues');
      task.markModified('catalogValues');
      // Đội sửa cũng vào nhật ký của cả nhiệm vụ lẫn báo cáo - trace được hết.
      changed += this.logValueChanges(
        task,
        template,
        before,
        actor,
        '',
        summary,
      );
      task.version += 1;
      await task.save();
    }

    /* Chụp lại TOÀN BỘ dòng chứ không chỉ dòng vừa sửa: rẻ như nhau mà không
       phải lo dòng nào lỡ lệch với nhiệm vụ. */
    const tasks = await this.taskModel
      .find({
        _id: { $in: summary.rows.map((row) => row.taskId) },
        departmentId: actor.departmentId,
      })
      .populate('axisId', 'code name')
      .populate('workContentId', 'code name');
    summary.rows = tasks.map((task) => this.snapshotOf(task, !task.isOpen));
    await summary.save();

    return { message: `Đã chấm lại ${changed} nhiệm vụ.`, data: summary };
  }

  /**
   * Thêm / bớt nhiệm vụ của một bản đã lập.
   *
   * Chỉ ĐỘI làm, và chỉ khi bản chưa trình hoặc bị trả lại - cùng luật với sửa
   * điểm. Đội là người quyết bản báo cáo gồm những việc gì; cấp trên thấy thiếu
   * thì trả lại kèm lý do, chứ không tự bốc thêm việc vào bản của đội.
   *
   * Nhiệm vụ thêm vào phải SẴN SÀNG như lúc lập, không thì bản trình lên có
   * dòng thiếu số mà kho ban đầu đã lọc ra rồi.
   */
  async changeSummaryTasks(
    userId: string,
    id: string,
    dto: ChangeTeamReportSummaryTasksDto,
  ) {
    const actor = await this.requireActor(userId);
    const summary = await this.requireOwnSummary(actor, id);
    if (summary.status !== 'DRAFT' && summary.status !== 'RETURNED') {
      throw new BadRequestException(
        'Báo cáo đang chờ cấp trên duyệt nên đội không đổi được danh sách nhiệm vụ.',
      );
    }

    const current = new Set(summary.rows.map((row) => String(row.taskId)));
    const removing = new Set(dto.remove ?? []);
    const adding = (dto.add ?? []).filter((taskId) => !current.has(taskId));

    if (adding.length) {
      const ids = adding.map((taskId) =>
        this.requireObjectId(taskId, 'Nhiệm vụ'),
      );
      const tasks = await this.taskModel
        .find({ _id: { $in: ids }, departmentId: actor.departmentId })
        .populate('axisId', 'code name');
      if (tasks.length !== ids.length) {
        throw new BadRequestException(
          'Một số nhiệm vụ không thuộc đơn vị bạn hoặc không còn tồn tại.',
        );
      }

      const templates = await this.templatesByAxis([
        ...new Set(tasks.map((task) => this.axisIdOf(task)).filter(Boolean)),
      ]);
      const notReady = tasks.filter(
        (task) =>
          !this.isTaskReady(task, templates[this.axisIdOf(task)] ?? null),
      );
      if (notReady.length) {
        throw new BadRequestException(
          `Còn ${notReady.length} nhiệm vụ chưa sẵn sàng: ${notReady
            .map((task) => task.name)
            .slice(0, 3)
            .join(', ')}.`,
        );
      }
      for (const task of tasks) current.add(String(task._id));
    }

    for (const taskId of removing) current.delete(taskId);
    if (!current.size) {
      throw new BadRequestException(
        'Báo cáo phải còn ít nhất một nhiệm vụ. Muốn bỏ hết thì xoá cả bản.',
      );
    }

    /* Chụp lại TOÀN BỘ theo tập mới - vừa gọn vừa không phải lo dòng cũ lệch
       với nhiệm vụ sau khi đội chấm thêm. */
    const tasks = await this.taskModel
      .find({
        _id: { $in: [...current].map((taskId) => new Types.ObjectId(taskId)) },
        departmentId: actor.departmentId,
      })
      .populate('axisId', 'code name')
      .populate('workContentId', 'code name');
    summary.rows = tasks.map((task) => this.snapshotOf(task, !task.isOpen));

    if (adding.length) {
      this.appendEdit(
        summary,
        actor,
        'Danh sách nhiệm vụ',
        '',
        `thêm ${adding.length} nhiệm vụ`,
        '',
      );
    }
    if (removing.size) {
      this.appendEdit(
        summary,
        actor,
        'Danh sách nhiệm vụ',
        '',
        `bỏ ${removing.size} nhiệm vụ`,
        '',
      );
    }
    await summary.save();

    return {
      message: `Báo cáo còn ${summary.rows.length} nhiệm vụ.`,
      data: summary,
    };
  }

  /**
   * Cấp trên chỉnh số trên bản tổng hợp đã nhận.
   *
   * Giống hệt cách chỉnh trên báo cáo ngày: ghi giá trị chốt vào bản chụp, và
   * ghi vào `reviewValues` của nhiệm vụ sống để đối chiếu - số đội khai vẫn còn
   * nguyên bên cạnh.
   */
  async reviewSummary(userId: string, id: string, dto: ReviewTeamReportDayDto) {
    const actor = await this.requireActor(userId);
    const reason = dto.reason?.trim() ?? '';
    if (!reason) throw new BadRequestException('Lý do chỉnh là bắt buộc.');

    const summary = await this.summaryModel.findById(
      this.requireObjectId(id, 'Báo cáo'),
    );
    if (!summary) throw new NotFoundException('Không tìm thấy báo cáo.');
    if (
      String(summary.recipientDepartmentId ?? '') !== String(actor.departmentId)
    ) {
      throw new ForbiddenException('Báo cáo này không trình tới đơn vị bạn.');
    }
    /*
      CHỈ bản đang chờ duyệt.

      Trả lại rồi là trao bóng cho đội - đội đang sửa để trình lại, mà cấp trên
      cũng sửa cùng lúc thì hai bên ghi đè nhau trên cùng một dòng. Mỗi trạng
      thái đúng một bên được ghi.
    */
    if (summary.status !== 'PENDING') {
      throw new BadRequestException(
        summary.status === 'RETURNED'
          ? 'Bản này đã trả lại cho đội - chờ đội sửa và trình lại.'
          : 'Chỉ chỉnh được bản đang chờ duyệt.',
      );
    }

    const byTaskId = new Map(
      summary.rows.map((row) => [String(row.taskId), row]),
    );
    let changed = 0;

    for (const patch of dto.rows ?? []) {
      const row = byTaskId.get(patch.taskId);
      if (!row) continue;

      const task = await this.taskModel.findOne({
        _id: this.requireObjectId(patch.taskId, 'Nhiệm vụ'),
        departmentId: summary.departmentId,
      });
      if (!task) {
        throw new BadRequestException(
          `Không tìm thấy nhiệm vụ "${row.name}" để ghi giá trị đã chỉnh.`,
        );
      }
      const template = await this.templateOfTask(task);
      if (!template) {
        throw new BadRequestException(
          `Nhiệm vụ "${row.name}" chưa gắn mẫu bảng nên không chỉnh được.`,
        );
      }
      /*
        Ghi THẲNG vào nhiệm vụ gốc, không để riêng ở `reviewValues`.

        Để riêng thì mỗi lần đọc phải ghép hai lớp, mà chỗ nào quên ghép là ra
        số cũ: chính vì vậy mà kiểm dải điểm từng đọc nhầm nhóm điểm cũ trong
        khi cấp trên đã đổi sang nhóm khác. Một chỗ giữ giá trị, ai sửa cũng ghi
        vào đó - còn "ai đổi gì" thì tra ở NHẬT KÝ, không phải tra bằng cách so
        hai lớp giá trị.

        Cấp trên chấm tự do, không chặn theo dải nhóm điểm: họ là người quyết
        cuối cùng.
      */
      const before = this.snapshotValues(task, template);
      const merged = await this.applyColumnValues(
        task,
        template,
        { fieldValues: patch.fieldValues, catalogValues: patch.catalogValues },
        { syncEntryFields: true, skipRangeCheck: true },
      );
      task.fieldValues = await this.computeAutoColumns(
        template,
        merged.fieldValues,
        merged.catalogValues,
      );
      task.catalogValues = merged.catalogValues;
      task.markModified('fieldValues');
      task.markModified('catalogValues');

      changed += this.logValueChanges(
        task,
        template,
        before,
        actor,
        reason,
        summary,
      );

      task.version += 1;
      await task.save();

      // Bản chụp phải khớp nhiệm vụ sau khi sửa, kể cả ô tự tính vừa đổi theo.
      const fresh = await this.taskModel
        .findById(task._id)
        .populate('axisId', 'code name')
        .populate('workContentId', 'code name');
      if (fresh) {
        const snapshot = this.snapshotOf(fresh, !fresh.isOpen);
        row.name = snapshot.name;
        row.deadline = snapshot.deadline;
        row.product = snapshot.product;
        row.fieldValues = snapshot.fieldValues;
        row.catalogValues = snapshot.catalogValues;
      }
    }

    if (!changed) {
      throw new BadRequestException('Không có giá trị nào thay đổi.');
    }

    summary.markModified('rows');
    await summary.save();

    return { message: `Đã chỉnh ${changed} giá trị.`, data: summary };
  }

  async deleteSummary(userId: string, id: string) {
    const actor = await this.requireActor(userId);
    const summary = await this.requireOwnSummary(actor, id);
    if (summary.status !== 'DRAFT') {
      throw new BadRequestException('Chỉ xoá được bản còn ở dạng nháp.');
    }
    await summary.deleteOne();
    return { message: 'Đã xoá báo cáo.', data: { id } };
  }

  // ==================================================================== nội bộ

  /** Đầu kỳ không được sau cuối kỳ, và cả hai phải đúng dạng ngày. */
  private requirePeriod(from: string, to: string) {
    const fromDate = this.requireDate(from);
    const toDate = this.requireDate(to);
    if (fromDate > toDate) {
      throw new BadRequestException('Đầu kỳ phải trước hoặc bằng cuối kỳ.');
    }
    return { fromDate, toDate };
  }

  /**
   * Id trục dạng chuỗi, dùng được cả khi `axisId` đã populate thành tài liệu.
   *
   * Sau `populate` thì trường này là một Document chứ không còn là ObjectId -
   * đây đúng là cái bẫy đã làm hỏng vài chỗ trước đây, nên tách hẳn ra một chỗ.
   */
  private axisIdOf(task: TeamReportTaskDocument): string {
    const axis = task.axisId;
    if (!axis) return '';
    const populated = axis as unknown as { _id?: Types.ObjectId };
    return populated._id ? String(populated._id) : String(axis);
  }

  /**
   * Nhiệm vụ đã đủ điều kiện đi vào báo cáo chưa.
   *
   * Cùng một luật với nhãn "Sẵn sàng gửi" trên màn phân loại: đủ trục, đủ nội
   * dung công việc, và mọi ô BẮT BUỘC của mẫu đều có giá trị. Bỏ qua cột hệ
   * thống tự tính - người dùng không gõ được vào đó nên đòi họ điền là đòi một
   * thứ không có cách nào làm.
   */
  private isTaskReady(
    task: TeamReportTaskDocument,
    template: ResolvedTemplate | null,
  ): boolean {
    if (!task.axisId || !task.workContentId) return false;
    if (!template) return false;

    for (const column of template.columns) {
      if (!column.visible || !column.required || column.autoValue) continue;
      if (column.semanticKey === 'stt') continue;

      const filled = catalogOfSemantic(column.semanticKey)
        ? !!(
            task.reviewCatalogValues?.[column.key] ??
            task.catalogValues?.[column.key]
          )
        : String(
            task.reviewValues?.[column.key] ??
              task.fieldValues?.[column.key] ??
              '',
          ).trim() !== '';
      if (!filled) return false;
    }
    return true;
  }

  private async requireOwnSummary(actor: Actor, id: string) {
    const summary = await this.summaryModel.findOne({
      _id: this.requireObjectId(id, 'Báo cáo'),
      departmentId: actor.departmentId,
    });
    if (!summary) throw new NotFoundException('Không tìm thấy báo cáo.');
    return summary;
  }

  /**
   * Bản mà tôi được phép ĐỌC: bản đội tôi lập, hoặc bản trình tới đơn vị tôi.
   *
   * Không populate `departmentId` ở đây - chỗ gọi còn so nó với đơn vị của
   * người dùng, mà tài liệu đã populate thì so không bao giờ khớp.
   */
  private async requireVisibleSummary(actor: Actor, id: string) {
    const summary = await this.summaryModel.findById(
      this.requireObjectId(id, 'Báo cáo'),
    );
    if (!summary) throw new NotFoundException('Không tìm thấy báo cáo.');

    const mine = String(summary.departmentId) === String(actor.departmentId);
    const incoming =
      String(summary.recipientDepartmentId ?? '') ===
        String(actor.departmentId) && summary.status !== 'DRAFT';
    if (!mine && !incoming) {
      throw new ForbiddenException('Báo cáo này không thuộc đơn vị bạn.');
    }
    return summary;
  }

  /** Người nhận phải là cấp trên có quyền duyệt - không trình ngang, không tự trình. */
  private async requireSummaryRecipient(actor: Actor, recipientId: string) {
    const allowed = await this.summaryRecipients(String(actor.id));
    const picked = allowed.data.people.find(
      (person) => person.id === recipientId,
    );
    if (!picked) {
      throw new BadRequestException(
        'Người nhận không hợp lệ - phải là cấp trên có quyền duyệt báo cáo.',
      );
    }
    return {
      id: this.requireObjectId(picked.id, 'Người nhận'),
      name: picked.fullName,
      departmentId: picked.departmentId
        ? this.requireObjectId(picked.departmentId, 'Đơn vị')
        : null,
    };
  }

  /**
   * Mẫu của các dòng trong một bản chụp, tra bằng "<id mẫu>:<phiên bản>".
   *
   * Phải tra ĐÚNG PHIÊN BẢN đã đóng dấu trên từng dòng: quản trị có thể đã sửa
   * mẫu sau ngày trình, lấy bản mới nhất thì bảng bày ra một bộ cột khác với bộ
   * cột lúc gửi.
   */
  private async templatesOfRows(rows: TeamReportDayRow[]) {
    const templates: Record<string, ResolvedTemplate> = {};
    for (const row of rows) {
      if (!row.formTemplateId) continue;
      const key = `${String(row.formTemplateId)}:${row.formTemplateVersion ?? 1}`;
      if (templates[key]) continue;
      const resolved = await this.formTemplatesService.resolveVersion(
        row.formTemplateId,
        row.formTemplateVersion ?? 1,
      );
      if (resolved) {
        templates[key] = { _id: String(row.formTemplateId), ...resolved };
      }
    }
    return templates;
  }

  private async requireActor(userId: string): Promise<Actor> {
    const user = await this.userModel
      .findById(this.requireObjectId(userId, 'Người dùng'))
      .select('fullName username departmentId');
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    if (!user.departmentId) {
      throw new BadRequestException(
        'Tài khoản chưa gắn đơn vị nên chưa dùng được báo cáo ngày.',
      );
    }
    return {
      id: user._id,
      name: user.fullName?.trim() || user.username,
      departmentId: new Types.ObjectId(String(user.departmentId)),
    };
  }

  /**
   * Việc đã chốt thì không sửa nữa - phải mở lại trước.
   *
   * Chặn ở server chứ không chỉ khoá ô trên màn: khoá ô chỉ là chuyện bày biện,
   * một tab mở sẵn từ trước lúc đóng vẫn gửi được lượt lưu như thường.
   *
   * KHÔNG áp cho `closeTask`/`reopenTask` (đó chính là đường mở ra), cũng không
   * áp cho cấp trên chấm lại: cấp trên đọc bản đã trình, mà việc đóng trước khi
   * gửi là chuyện bình thường.
   */
  private assertClosedNotEdited(task: TeamReportTaskDocument) {
    if (task.isOpen) return;
    throw new BadRequestException(
      'Nhiệm vụ đã chốt nên không sửa được. Bấm "Mở lại" nếu cần sửa tiếp.',
    );
  }

  private async requireOwnTask(actor: Actor, id: string) {
    const task = await this.taskModel.findOne({
      _id: this.requireObjectId(id, 'Nhiệm vụ'),
      departmentId: actor.departmentId,
    });
    if (!task) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    return task;
  }

  /**
   * Báo cáo đang nằm ở hộp thư của mình.
   *
   * KHÔNG populate `departmentId`: chỗ gọi còn dùng nó làm điều kiện truy vấn
   * nhiệm vụ, mà truyền cả tài liệu đã populate vào bộ lọc thì không khớp gì và
   * hỏng lặng lẽ. Cần tên đơn vị thì tra riêng.
   */
  private async requireIncomingDay(actor: Actor, id: string) {
    const day = await this.dayModel.findById(
      this.requireObjectId(id, 'Báo cáo'),
    );
    if (!day) throw new NotFoundException('Không tìm thấy báo cáo.');
    if (
      String(day.recipientDepartmentId ?? '') !== String(actor.departmentId)
    ) {
      throw new ForbiddenException('Báo cáo này không gửi tới đơn vị bạn.');
    }
    return day;
  }

  /**
   * Số bản của client phải khớp bản trên server.
   *
   * Đây là toàn bộ cơ chế chống đè: cả đội gõ chung một bảng qua một tài khoản
   * nên không có cách nào phân biệt hai người, chỉ còn cách so số bản.
   */
  private assertVersion(task: TeamReportTaskDocument, version: number) {
    if (task.version !== version) {
      throw new ConflictException(
        'Dòng này vừa được người khác sửa. Tải lại rồi nhập tiếp.',
      );
    }
  }

  /** Báo cáo của ngày đã gửi thì khoá - trừ khi cấp trên đã trả lại. */
  private async assertDayEditable(
    departmentId: Types.ObjectId,
    reportDate: string,
  ) {
    const day = await this.dayModel
      .findOne({ departmentId, reportDate })
      .select('status');
    if (day && day.status !== 'RETURNED') {
      throw new BadRequestException(
        'Báo cáo ngày này đã gửi lên trên, không sửa được nữa.',
      );
    }
  }

  /**
   * Bản chụp một nhiệm vụ tại lúc gửi.
   *
   * Giá trị CHỐT là số cấp trên chỉnh ghép đè lên số đội khai - bản đã trình
   * chỉ có một con số duy nhất, không phải hai. Chép luôn id và phiên bản mẫu
   * để về sau bày lại đúng bộ cột của hôm gửi.
   */
  private snapshotOf(
    task: TeamReportTaskDocument,
    closed: boolean,
  ): TeamReportDayRow {
    const axis = task.axisId as unknown as {
      _id?: Types.ObjectId;
      name?: string;
    } | null;
    const content = task.workContentId as unknown as {
      _id?: Types.ObjectId;
      name?: string;
    } | null;
    return {
      taskId: task._id,
      name: task.name,
      deadline: task.deadline,
      product: task.product ?? '',
      axisId: axis?._id ?? null,
      axisName: axis?.name ?? '',
      workContentId: content?._id ?? null,
      workContentName: content?.name ?? '',
      formTemplateId: task.formTemplateId,
      formTemplateVersion: task.formTemplateVersion,
      fieldValues: {
        ...(task.fieldValues ?? {}),
        ...(task.reviewValues ?? {}),
      },
      catalogValues: {
        ...(task.catalogValues ?? {}),
        ...(task.reviewCatalogValues ?? {}),
      },
      evidenceCount: task.evidence?.length ?? 0,
      closed,
    };
  }

  /**
   * Chụp lại giá trị mọi cột của một nhiệm vụ, để lát nữa so ra ai đổi gì.
   *
   * Chỉ lấy cột của mẫu chứ không lấy cả `fieldValues`: khoá rác còn sót từ mẫu
   * cũ mà đem so thì nhật ký đầy những dòng đổi một cột không còn tồn tại.
   */
  private snapshotValues(
    task: TeamReportTaskDocument,
    template: ResolvedTemplate | null,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const column of template?.columns ?? []) {
      out[column.key] = catalogOfSemantic(column.semanticKey)
        ? (task.catalogValues?.[column.key]?.name ?? '')
        : String(task.fieldValues?.[column.key] ?? '');
    }
    return out;
  }

  /**
   * Ghi vào nhật ký MỌI ô vừa đổi giá trị.
   *
   * Sửa ở đâu cũng phải để lại vết: sau này còn tra được con số trên báo cáo đã
   * duyệt do ai đặt, lúc nào, vì sao. Không ghi thì bản đã trình chỉ còn một
   * con số trần, cãi nhau không có gì để đối chiếu.
   *
   * So THEO CỘT chứ không ghi thẳng thứ client gửi lên: cột tự tính đổi theo mà
   * client không hề gửi, và ô gửi lên trùng giá trị cũ thì không phải một lần
   * sửa.
   */
  private logValueChanges(
    task: TeamReportTaskDocument,
    template: ResolvedTemplate | null,
    before: Record<string, string>,
    actor: Actor,
    reason: string,
    also?: TeamReportSummaryDocument | TeamReportDayDocument,
  ): number {
    const after = this.snapshotValues(task, template);
    let changed = 0;
    for (const column of template?.columns ?? []) {
      const from = before[column.key] ?? '';
      const to = after[column.key] ?? '';
      if (from === to) continue;
      this.appendEdit(task, actor, column.title, from, to, reason);
      if (also) this.appendEdit(also, actor, column.title, from, to, reason);
      changed += 1;
    }
    return changed;
  }

  private appendEdit(
    doc:
      | TeamReportTaskDocument
      | TeamReportDayDocument
      | TeamReportSummaryDocument,
    actor: Actor,
    field: string,
    from: string,
    to: string,
    reason: string,
  ) {
    doc.edits = [
      ...(doc.edits ?? []),
      {
        byId: actor.id,
        byName: actor.name,
        byDepartmentId: actor.departmentId,
        field,
        from,
        to,
        reason,
        at: new Date(),
      },
    ];
    doc.markModified('edits');
  }

  /**
   * Đơn vị nhận báo cáo: đơn vị GẦN NHẤT phía trên có người duyệt được.
   *
   * KHÔNG lấy thẳng đơn vị cha. Cây đơn vị có những cấp gom thuần tổ chức -
   * "Khối An ninh", "Khối Cảnh sát", "Khối Xây dựng lực lượng" - không gắn tài
   * khoản nào và không nhận báo cáo. Lấy cha thì báo cáo của phòng rơi vào một
   * khối rỗng, nằm đó không ai nhìn thấy.
   *
   * Vì vậy đi ngược `ancestors` từ gần lên xa, dừng ở đơn vị đầu tiên có tài
   * khoản đang hoạt động mang vai trò duyệt được báo cáo ngày.
   */
  private async resolveRecipientDepartment(departmentId: Types.ObjectId) {
    const department = await this.departmentModel
      .findById(departmentId)
      .select('ancestors');
    const ancestors = department?.ancestors ?? [];
    if (!ancestors.length) return null;

    const reviewerRoles = await this.roleModel
      .find({ permissions: Permission.TEAM_REPORT_REVIEW, isActive: true })
      .select('code');
    if (!reviewerRoles.length) return null;
    const roleCodes = reviewerRoles.map((role) => role.code);

    // ancestors xếp từ gốc xuống cha, nên đảo lại để xét cấp gần trước.
    const candidates = [...ancestors].reverse();
    const staffed = await this.userModel
      .find({
        isActive: true,
        departmentId: { $in: candidates },
        'roleAssignments.roleCode': { $in: roleCodes },
      })
      .select('departmentId')
      .distinct('departmentId');

    const hasAccount = new Set(staffed.map((id) => String(id)));
    for (const candidate of candidates) {
      if (hasAccount.has(String(candidate))) {
        return new Types.ObjectId(String(candidate));
      }
    }
    return null;
  }

  private async workContentName(id: Types.ObjectId) {
    const content = await this.workContentModel.findById(id).select('name');
    return content?.name ?? '';
  }

  private mapEvidence(list: CreateTeamReportTaskDto['evidence']) {
    return (list ?? []).map((item) => ({
      uploadId: this.requireObjectId(item.uploadId, 'Tệp'),
      name: item.name?.trim() ?? '',
      url: '',
    }));
  }

  private requireDate(value?: string): string {
    const raw = value?.trim();
    if (!raw) return serverDateYmd();
    if (!isYmd(raw)) {
      throw new BadRequestException('Ngày báo cáo phải có dạng YYYY-MM-DD.');
    }
    return raw;
  }

  private optionalDate(value?: string): string {
    const raw = value?.trim() ?? '';
    if (!raw) return '';
    if (!isYmd(raw)) {
      throw new BadRequestException('Hạn hoàn thành phải có dạng YYYY-MM-DD.');
    }
    return raw;
  }

  private requireObjectId(value: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${label} không hợp lệ.`);
    }
    return new Types.ObjectId(value);
  }

  private likeRegex(value: string) {
    return new RegExp(value.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  private text(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    return String(value);
  }
}
