import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  AdjustmentItem,
  AdjustmentItemDocument,
} from '@/modules/mission-form-config/schemas/adjustment-item.schema';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import {
  DepartmentLevel,
  DepartmentLevelDocument,
} from '@/modules/department-levels/schemas/department-level.schema';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  DecideTeamReportDayDto,
  SaveTeamReportCommendationDto,
  TeamReportAdjustmentInboxQueryDto,
  TeamReportCommendationRowDto,
} from './dto/team-report.dto';
import {
  TeamReportAdjustmentRoute,
  TeamReportAdjustmentRouteDocument,
} from './schemas/team-report-adjustment-route.schema';
import {
  TeamReportCommendation,
  TeamReportCommendationDocument,
  TeamReportCommendationRow,
} from './schemas/team-report-commendation.schema';
import { TeamReportAdjustmentRoutingService } from './team-report-adjustment-routing.service';
import { departmentLabels } from './team-report.department-label';
import {
  applyApprove,
  isApprover,
  isHandler,
  leadInboxFilter,
  resetStages,
} from './team-report.stages';
import { serverDateYmd } from './team-report.time';

type Actor = { id: Types.ObjectId; name: string; departmentId: Types.ObjectId };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const KIND = 'COMMENDATION' as const;

/**
 * Đơn vị được chọn vào cột "Đơn vị, địa phương": Công an các phòng và cấp cơ
 * sở (xã / phường / đồn / đặc khu) - đúng phạm vi "Công an các đơn vị, địa
 * phương" của mẫu. Không gồm đội / tổ (thuộc phòng) và khối gom nhóm.
 */
const TARGET_LEVELS = ['PHONG', 'XA', 'PHUONG', 'DON', 'DACKHU'];

/**
 * Luồng MẶC ĐỊNH tạo một lần khi chưa có luồng nào cho loại này: trưởng phòng
 * (vai UNIT_ADMIN ở CẤP PHÒNG - trưởng xã cũng mang vai UNIT_ADMIN nên phải
 * khoá thêm cấp) gửi về tài khoản duyệt các đội Phòng Tham mưu. Đội CNTT chủ
 * trì như bảng thẩm định; quản trị sửa ở Luồng trình báo cáo.
 */
const DEFAULT_LEAD = 'pv01.cntt.duyet';
const DEFAULT_RECEIVERS = [
  'pv01.cntt.duyet',
  'pv01.tmth.duyet',
  'pv01.tman.duyet',
  'pv01.tmcs.duyet',
  'pv01.ttttch.duyet',
  'pv01.phongtrao.duyet',
];

/**
 * "Bảng đề xuất biểu dương, phê bình" tháng của các phòng.
 *
 * Phòng lập, tháng một bản (nhập dần trong tháng rồi gửi), gửi theo luồng
 * COMMENDATION tới các đội Phòng Tham mưu: chủ trì duyệt / trả lại, các đội
 * khác nhận để theo dõi. Cùng vòng đời và duyệt 2 cấp với bảng cộng / trừ.
 */
@Injectable()
export class TeamReportCommendationService implements OnModuleInit {
  private readonly logger = new Logger(TeamReportCommendationService.name);

  constructor(
    @InjectModel(TeamReportCommendation.name)
    private readonly sheetModel: Model<TeamReportCommendationDocument>,
    @InjectModel(AdjustmentItem.name)
    private readonly itemModel: Model<AdjustmentItemDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(DepartmentLevel.name)
    private readonly levelModel: Model<DepartmentLevelDocument>,
    @InjectModel(TeamReportAdjustmentRoute.name)
    private readonly routeModel: Model<TeamReportAdjustmentRouteDocument>,
    private readonly routing: TeamReportAdjustmentRoutingService,
  ) {}

  async onModuleInit() {
    try {
      await this.seedDefaultRoute();
    } catch (error) {
      // Thiếu dữ liệu nền thì bỏ qua - quản trị tự tạo luồng, app vẫn chạy.
      this.logger.warn(`Không tạo được luồng mặc định: ${String(error)}`);
    }
  }

  /** Cổng menu: được lập bảng / được nhận bảng. */
  async access(userId: string) {
    const [allowed, listed] = await Promise.all([
      this.routing.matchesSender(KIND, userId),
      this.routing.isListedRecipient(KIND, userId),
    ]);
    const addressed =
      listed ||
      (Types.ObjectId.isValid(userId) &&
        Boolean(
          await this.sheetModel.exists({
            $or: [
              { recipientId: new Types.ObjectId(userId) },
              { finalRecipientId: new Types.ObjectId(userId) },
              { 'participants.userId': new Types.ObjectId(userId) },
            ],
          }),
        ));
    return { allowed, canReceive: addressed };
  }

  // ------------------------------------------------------------ người lập

  async get(userId: string, periodMonth: string) {
    const actor = await this.requireComposer(userId);
    this.assertMonth(periodMonth);
    const sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    return {
      message: 'OK',
      data: {
        ...(await this.toClient(sheet, periodMonth, actor.departmentId)),
        criteria: await this.criteria(),
        departmentChoices: await this.departmentChoices(),
        route: {
          units: await this.routing.unitsFor(KIND, userId),
          finalReviewer: await this.routing.finalReviewerFor(KIND, userId),
        },
        canEdit:
          !sheet || sheet.status === 'DRAFT' || sheet.status === 'RETURNED',
      },
    };
  }

  async save(
    userId: string,
    periodMonth: string,
    dto: SaveTeamReportCommendationDto,
  ) {
    const actor = await this.requireComposer(userId);
    this.assertMonth(periodMonth);
    let sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    if (sheet && sheet.status !== 'DRAFT' && sheet.status !== 'RETURNED') {
      throw new BadRequestException(
        'Bảng đã gửi - chờ duyệt hoặc bị trả lại mới sửa được.',
      );
    }
    if (sheet && dto.version !== undefined && dto.version !== sheet.version) {
      throw new ConflictException(
        'Bảng vừa được sửa ở nơi khác - tải lại trang rồi nhập tiếp.',
      );
    }

    const items = await this.itemModel.find({ section: 'BONUS' });
    const itemById = new Map(items.map((item) => [String(item._id), item]));
    const allIds = [...dto.praises, ...dto.criticisms].flatMap(
      (row) => row.departmentIds,
    );
    const known = await this.departmentModel
      .find({ _id: { $in: allIds } })
      .select('_id');
    const knownIds = new Set(known.map((dept) => String(dept._id)));
    const labels = await departmentLabels(this.departmentModel, allIds);

    const toRow = (
      row: TeamReportCommendationRowDto,
      praise: boolean,
    ): TeamReportCommendationRow => {
      const ids = [...new Set(row.departmentIds)];
      if (ids.some((id) => !knownIds.has(id))) {
        throw new BadRequestException('Có đơn vị không còn trong danh mục.');
      }
      const item = praise && row.itemId ? itemById.get(row.itemId) : null;
      if (praise && row.itemId && !item) {
        throw new BadRequestException(
          'Có nhóm nội dung biểu dương không còn trong danh mục.',
        );
      }
      return {
        _id: new Types.ObjectId(),
        itemId: item?._id ?? null,
        itemName: item?.name ?? '',
        departmentIds: ids.map((id) => new Types.ObjectId(id)),
        departmentNames: ids.map((id) => labels.get(id) ?? ''),
        content: row.content?.trim() ?? '',
        evidence: row.evidence?.trim() ?? '',
        note: row.note?.trim() ?? '',
      };
    };
    // Dòng trống hẳn (bấm "Thêm" rồi thôi) thì bỏ, không lưu thành dòng rỗng.
    const filled = (row: TeamReportCommendationRowDto) =>
      row.departmentIds.length ||
      row.content?.trim() ||
      row.evidence?.trim() ||
      row.note?.trim();

    if (!sheet) {
      sheet = new this.sheetModel({
        departmentId: actor.departmentId,
        periodMonth,
      });
    }
    sheet.praises = dto.praises.filter(filled).map((row) => toRow(row, true));
    sheet.criticisms = dto.criticisms
      .filter(filled)
      .map((row) => toRow(row, false));
    sheet.updatedById = actor.id;
    sheet.updatedByName = actor.name;
    sheet.version += 1;
    await sheet.save();

    return {
      message: 'Đã lưu.',
      data: await this.toClient(sheet, periodMonth, actor.departmentId),
    };
  }

  /** Gửi theo luồng: một đội chủ trì duyệt, các đội khác nhận để theo dõi. */
  async send(userId: string, periodMonth: string) {
    const actor = await this.requireComposer(userId);
    this.assertMonth(periodMonth);
    const sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    if (!sheet) throw new BadRequestException('Lưu bảng trước khi gửi.');
    if (sheet.status !== 'DRAFT' && sheet.status !== 'RETURNED') {
      throw new BadRequestException('Bảng này đã gửi rồi.');
    }
    if (!sheet.praises.length && !sheet.criticisms.length) {
      throw new BadRequestException(
        'Bảng chưa có dòng biểu dương hay phê bình nào.',
      );
    }
    const rows = [
      ...sheet.praises.map((row) => ({ row, praise: true })),
      ...sheet.criticisms.map((row) => ({ row, praise: false })),
    ];
    for (const [index, { row, praise }] of rows.entries()) {
      const where = praise ? 'biểu dương' : 'phê bình';
      if (!row.departmentIds.length) {
        throw new BadRequestException(
          `Có dòng ${where} chưa chọn đơn vị (dòng ${index + 1}).`,
        );
      }
      if (!row.content.trim()) {
        throw new BadRequestException(
          `Có dòng ${where} chưa ghi nội dung (dòng ${index + 1}).`,
        );
      }
      if (praise && !row.itemId) {
        throw new BadRequestException(
          'Có dòng biểu dương chưa chọn nhóm nội dung.',
        );
      }
    }

    const fixed = await this.routing.fixedTargets(KIND, actor);
    if (!fixed) {
      throw new BadRequestException(
        'Chưa có luồng gửi bảng biểu dương, phê bình cho tài khoản này - báo quản trị cấu hình ở Luồng trình báo cáo.',
      );
    }
    sheet.status = 'PENDING';
    sheet.recipientId = fixed.recipient.id;
    sheet.recipientName = fixed.recipient.name;
    sheet.recipientDepartmentId = fixed.recipient.departmentId;
    resetStages(sheet, fixed.final);
    sheet.participants = fixed.participants;
    sheet.markModified('participants');
    sheet.sentById = actor.id;
    sheet.sentByName = actor.name;
    sheet.sentAt = new Date();
    sheet.decidedById = null;
    sheet.decidedByName = '';
    sheet.decidedAt = null;
    sheet.returnReason = '';
    sheet.version += 1;
    await sheet.save();

    return {
      message: `Đã gửi bảng lên ${fixed.recipient.name}${
        fixed.participants.length
          ? `, kèm ${fixed.participants.length} đội theo dõi`
          : ''
      }.`,
      data: await this.toClient(sheet, periodMonth, actor.departmentId),
    };
  }

  // ------------------------------------------------------------ người nhận

  /** Hộp đến: `box` LEAD = chủ trì duyệt; INFORM / COORDINATE = theo dõi. */
  async inbox(userId: string, query: TeamReportAdjustmentInboxQueryDto) {
    const actor = await this.requireActor(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const box = query.box ?? 'LEAD';
    const filter: Record<string, unknown> =
      box === 'LEAD'
        ? leadInboxFilter(actor.id, query.status)
        : {
            participants: { $elemMatch: { userId: actor.id, role: box } },
            status: query.status ? query.status : { $ne: 'DRAFT' },
          };
    const [rows, total] = await Promise.all([
      this.sheetModel
        .find(filter)
        .sort({ sentAt: -1, periodMonth: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.sheetModel.countDocuments(filter),
    ]);
    const labels = await departmentLabels(
      this.departmentModel,
      rows.map((row) => row.departmentId),
    );
    return {
      message: 'OK',
      data: rows.map((row) => ({
        _id: String(row._id),
        periodMonth: row.periodMonth,
        status: row.status,
        stage: row.stage ?? 'FIRST',
        departmentName: labels.get(String(row.departmentId)) ?? '',
        praiseCount: row.praises.length,
        criticismCount: row.criticisms.length,
        recipientName: row.recipientName,
        finalRecipientName: row.finalRecipientName ?? '',
        sentByName: row.sentByName,
        sentAt: row.sentAt,
        decidedByName: row.decidedByName,
        decidedAt: row.decidedAt,
        returnReason: row.returnReason,
        /** Đội theo dõi đã mở bản này chưa. */
        seen: box === 'LEAD' ? true : !!this.participantOf(row, actor)?.seenAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** Mở một bản - chủ trì / duyệt cuối, hoặc đội nhận để theo dõi. */
  async incomingDetail(userId: string, id: string) {
    const actor = await this.requireActor(userId);
    const { sheet, viewerRole } = await this.requireVisible(actor, id);
    if (viewerRole !== 'RECIPIENT') {
      const mine = this.participantOf(sheet, actor);
      if (mine && !mine.seenAt) {
        mine.seenAt = new Date();
        sheet.markModified('participants');
        await sheet.save();
      }
    }
    return {
      message: 'OK',
      data: {
        ...(await this.toClient(sheet, sheet.periodMonth, sheet.departmentId)),
        // Đủ các nhóm như mẫu giấy, kể cả nhóm chưa có dòng nào.
        criteria: await this.criteria(),
        viewerRole,
        canDecide: isHandler(sheet, actor.id),
      },
    };
  }

  async decide(userId: string, id: string, dto: DecideTeamReportDayDto) {
    const actor = await this.requireActor(userId);
    const { sheet, viewerRole } = await this.requireVisible(actor, id);
    if (viewerRole !== 'RECIPIENT') {
      throw new ForbiddenException('Chỉ đơn vị chủ trì mới duyệt được bảng.');
    }
    if (sheet.status !== 'PENDING') {
      throw new BadRequestException('Chỉ duyệt được bảng đang chờ duyệt.');
    }
    if (!isHandler(sheet, actor.id)) {
      throw new BadRequestException(
        'Bảng đang chờ cấp duyệt khác - không quyết được lúc này.',
      );
    }
    let outcome: 'RETURNED' | 'FORWARDED' | 'APPROVED' = 'RETURNED';
    if (dto.decision === 'RETURN') {
      const reason = dto.reason?.trim() ?? '';
      if (!reason) throw new BadRequestException('Lý do trả lại là bắt buộc.');
      sheet.status = 'RETURNED';
      sheet.returnReason = reason;
    } else {
      outcome = applyApprove(sheet, actor);
      sheet.returnReason = '';
    }
    sheet.markModified('firstApproval');
    if (outcome !== 'FORWARDED') {
      sheet.decidedById = actor.id;
      sheet.decidedByName = actor.name;
      sheet.decidedAt = new Date();
    }
    sheet.version += 1;
    await sheet.save();
    return {
      message:
        outcome === 'RETURNED'
          ? 'Đã trả lại.'
          : outcome === 'FORWARDED'
            ? `Đã duyệt cấp 1 - chuyển ${sheet.finalRecipientName} duyệt cuối.`
            : 'Đã duyệt.',
      data: {
        ...(await this.toClient(sheet, sheet.periodMonth, sheet.departmentId)),
        viewerRole,
        canDecide: isHandler(sheet, actor.id),
      },
    };
  }

  // ---------------------------------------------------------------- nội bộ

  private async toClient(
    sheet: TeamReportCommendationDocument | null,
    periodMonth: string,
    departmentId: Types.ObjectId,
  ) {
    const unit =
      (await departmentLabels(this.departmentModel, [departmentId])).get(
        String(departmentId),
      ) ?? '';
    const short = await this.shortNames([
      ...(sheet?.praises ?? []),
      ...(sheet?.criticisms ?? []),
    ]);
    const rowView = (row: TeamReportCommendationRow) => ({
      _id: String(row._id),
      itemId: row.itemId ? String(row.itemId) : null,
      itemName: row.itemName,
      departmentIds: row.departmentIds.map(String),
      departmentNames: row.departmentNames,
      /** Tên gọn khi in: phòng in MÃ (PC03), cấp xã giữ tên. */
      departmentShortNames: row.departmentIds.map(
        (id, index) =>
          short.get(String(id)) ?? row.departmentNames[index] ?? '',
      ),
      content: row.content,
      evidence: row.evidence,
      note: row.note,
    });
    return {
      _id: sheet ? String(sheet._id) : null,
      periodMonth,
      departmentName: unit,
      status: sheet?.status ?? 'DRAFT',
      stage: sheet?.stage ?? 'FIRST',
      version: sheet?.version ?? 0,
      praises: (sheet?.praises ?? []).map(rowView),
      criticisms: (sheet?.criticisms ?? []).map(rowView),
      recipientName: sheet?.recipientName ?? '',
      finalRecipientName: sheet?.finalRecipientName ?? '',
      firstApproval: sheet?.firstApproval ?? null,
      participants: sheet?.participants ?? [],
      sentByName: sheet?.sentByName ?? '',
      sentAt: sheet?.sentAt ?? null,
      decidedByName: sheet?.decidedByName ?? '',
      decidedAt: sheet?.decidedAt ?? null,
      returnReason: sheet?.returnReason ?? '',
      updatedAt: sheet?.updatedAt ?? null,
    };
  }

  /** Mã của các PHÒNG có trong các dòng - cấp xã không có trong map (giữ tên). */
  private async shortNames(rows: TeamReportCommendationRow[]) {
    const ids = rows.flatMap((row) => row.departmentIds);
    const result = new Map<string, string>();
    if (!ids.length) return result;
    const phong = await this.levelModel
      .findOne({ code: 'PHONG' })
      .select('_id');
    if (!phong) return result;
    const departments = await this.departmentModel
      .find({ _id: { $in: ids }, levelId: phong._id })
      .select('code');
    for (const dept of departments) {
      if (dept.code) result.set(String(dept._id), dept.code);
    }
    return result;
  }

  /** Nhóm nội dung biểu dương = danh mục Điểm cộng (I). */
  private async criteria() {
    const items = await this.itemModel
      .find({ section: 'BONUS', isActive: true })
      .sort({ sortOrder: 1, code: 1 });
    return items.map((item) => ({ id: String(item._id), name: item.name }));
  }

  /** Đơn vị cho ô chọn: phòng (nhãn có mã) rồi tới cấp cơ sở, theo cây. */
  private async departmentChoices() {
    const levels = await this.levelModel
      .find({ code: { $in: TARGET_LEVELS } })
      .select('code');
    const levelCode = new Map(
      levels.map((level) => [String(level._id), level.code]),
    );
    const departments = await this.departmentModel
      .find({ isActive: true, levelId: { $in: levels.map((l) => l._id) } })
      .select('code name levelId sortOrder')
      .sort({ sortOrder: 1, name: 1 });
    const labels = await departmentLabels(
      this.departmentModel,
      departments.map((dept) => dept._id),
    );
    const phong = (dept: DepartmentDocument) =>
      levelCode.get(String(dept.levelId)) === 'PHONG';
    return [...departments]
      .sort((a, b) => Number(phong(b)) - Number(phong(a)))
      .map((dept) => ({
        id: String(dept._id),
        code: dept.code,
        name: labels.get(String(dept._id)) ?? dept.name,
        group: phong(dept) ? 'Phòng' : 'Công an cấp xã',
      }));
  }

  private participantOf(sheet: TeamReportCommendationDocument, actor: Actor) {
    return (sheet.participants ?? []).find(
      (item) => String(item.userId) === String(actor.id),
    );
  }

  private async requireVisible(actor: Actor, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy bảng.');
    }
    const sheet = await this.sheetModel.findById(id);
    if (!sheet || sheet.status === 'DRAFT') {
      throw new NotFoundException('Không tìm thấy bảng.');
    }
    if (isApprover(sheet, actor.id)) {
      return { sheet, viewerRole: 'RECIPIENT' as const };
    }
    const mine = this.participantOf(sheet, actor);
    if (mine) {
      return {
        sheet,
        viewerRole:
          mine.role === 'COORDINATE'
            ? ('COORDINATOR' as const)
            : ('INFORMED' as const),
      };
    }
    throw new ForbiddenException('Bảng này không gửi tới tài khoản bạn.');
  }

  private async seedDefaultRoute() {
    if (await this.routeModel.exists({ kind: KIND })) return;
    const phong = await this.levelModel
      .findOne({ code: 'PHONG' })
      .select('_id');
    const users = await this.userModel
      .find({ username: { $in: DEFAULT_RECEIVERS } })
      .select('username');
    if (!phong || !users.length) return;
    const lead =
      users.find((user) => user.username === DEFAULT_LEAD) ?? users[0];
    await this.routeModel.create({
      kind: KIND,
      name: 'Trưởng phòng → các đội Phòng Tham mưu',
      sortOrder: 0,
      isActive: true,
      units: users.map((user) => ({
        userId: user._id,
        role: String(user._id) === String(lead._id) ? 'LEAD' : 'INFORM',
      })),
      finalUserId: null,
      sender: {
        roleCodes: ['UNIT_ADMIN'],
        levelIds: [phong._id],
        departmentIds: [],
        includeDescendants: true,
        userIds: [],
        senderSuperiorOnly: false,
        senderSubordinatesOnly: false,
      },
      recipients: {
        roleCodes: [],
        levelIds: [],
        departmentIds: [],
        includeDescendants: true,
        userIds: [],
        senderSuperiorOnly: false,
        senderSubordinatesOnly: false,
      },
      updatedByName: 'Hệ thống',
    });
    this.logger.log(
      `Đã tạo luồng mặc định bảng biểu dương, phê bình (${users.length} đội nhận).`,
    );
  }

  private async requireComposer(userId: string) {
    const actor = await this.requireActor(userId);
    if (!(await this.routing.matchesSender(KIND, userId))) {
      throw new ForbiddenException(
        'Chỉ trưởng phòng mới lập bảng biểu dương, phê bình - xem Luồng trình báo cáo.',
      );
    }
    return actor;
  }

  private assertMonth(periodMonth: string) {
    if (!MONTH.test(periodMonth)) {
      throw new BadRequestException('Tháng không hợp lệ (YYYY-MM).');
    }
    if (periodMonth > serverDateYmd().slice(0, 7)) {
      throw new BadRequestException('Chưa tới tháng này.');
    }
  }

  private async requireActor(userId: string): Promise<Actor> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }
    const user = await this.userModel
      .findById(userId)
      .select('fullName username departmentId');
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    if (!user.departmentId) {
      throw new BadRequestException('Tài khoản chưa gắn đơn vị.');
    }
    return {
      id: user._id,
      name: user.fullName?.trim() || user.username,
      departmentId: new Types.ObjectId(String(user.departmentId)),
    };
  }
}
