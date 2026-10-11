import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  DecideTeamReportDayDto,
  SaveTeamReportAppraisalDto,
  TeamReportAdjustmentInboxQueryDto,
} from './dto/team-report.dto';
import {
  TeamReportAppraisal,
  TeamReportAppraisalDocument,
  TeamReportAppraisalUnit,
} from './schemas/team-report-appraisal.schema';
import {
  TeamReportSummary,
  TeamReportSummaryDocument,
} from './schemas/team-report-summary.schema';
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
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Điểm của một đơn vị trong bảng thẩm định.
 *
 * - Tổng cộng: cộng theo TIÊU CHÍ rồi chặn ở trần của tiêu chí ("tối đa 02
 *   điểm" là cho cả tiêu chí, không phải cho từng dòng minh chứng).
 * - Tổng trừ: cộng thẳng, không trần.
 * - Sau thẩm định = tự chấm + cộng − trừ; chưa có tự chấm thì null (khác 0).
 */
export function appraisalTotals(unit: {
  selfScore: number | null;
  bonuses: {
    itemId: Types.ObjectId | string | null;
    maxScore: number | null;
    score: number | null;
  }[];
  penalties: { score: number | null }[];
}) {
  const byItem = new Map<string, { sum: number; cap: number | null }>();
  for (const bonus of unit.bonuses) {
    if (bonus.score === null || bonus.score === undefined) continue;
    const key = String(bonus.itemId ?? '');
    const item = byItem.get(key) ?? { sum: 0, cap: bonus.maxScore ?? null };
    item.sum += bonus.score;
    byItem.set(key, item);
  }
  let bonusTotal = 0;
  for (const item of byItem.values()) {
    bonusTotal += item.cap === null ? item.sum : Math.min(item.sum, item.cap);
  }
  const penaltyTotal = unit.penalties.reduce(
    (sum, penalty) => sum + (penalty.score ?? 0),
    0,
  );
  return {
    bonusTotal: round2(bonusTotal),
    penaltyTotal: round2(penaltyTotal),
    finalScore:
      unit.selfScore === null || unit.selfScore === undefined
        ? null
        : round2(unit.selfScore + bonusTotal - penaltyTotal),
  };
}

/**
 * PHỤ LỤC THEO DÕI, THẨM ĐỊNH tháng của các đội PV01.
 *
 * Ai lập = vế "Ai gửi" của luồng APPRAISAL (tài khoản duyệt của đội). Đơn vị
 * nào vào bảng = các đơn vị đang trình báo cáo tổng hợp về tài khoản đó (luồng
 * SUMMARY), đội thêm / bớt tay được. Trình theo bảng nơi nhận cố định của
 * luồng APPRAISAL, duyệt 2 cấp nếu luồng có duyệt cuối.
 */
@Injectable()
export class TeamReportAppraisalService {
  constructor(
    @InjectModel(TeamReportAppraisal.name)
    private readonly sheetModel: Model<TeamReportAppraisalDocument>,
    @InjectModel(TeamReportSummary.name)
    private readonly summaryModel: Model<TeamReportSummaryDocument>,
    @InjectModel(AdjustmentItem.name)
    private readonly itemModel: Model<AdjustmentItemDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly routing: TeamReportAdjustmentRoutingService,
  ) {}

  /** Cổng menu: được lập bảng / được nhận bảng. */
  async access(userId: string) {
    const [allowed, listed] = await Promise.all([
      this.routing.matchesSender('APPRAISAL', userId),
      this.routing.isListedRecipient('APPRAISAL', userId),
    ]);
    const addressed =
      listed ||
      (Types.ObjectId.isValid(userId) &&
        Boolean(
          await this.sheetModel.exists({
            $or: [
              { recipientId: new Types.ObjectId(userId) },
              { finalRecipientId: new Types.ObjectId(userId) },
            ],
          }),
        ));
    return { allowed, canReceive: addressed };
  }

  // ------------------------------------------------------------ người lập

  /**
   * Bảng của tháng. Đơn vị trong bảng = đơn vị có BÁO CÁO THÁNG do CHÍNH tài
   * khoản này duyệt (user chốt - không chọn tay đơn vị khác). Điểm tự chấm lấy
   * sẵn từ báo cáo đó.
   *
   * Bảng chưa lưu thì dựng sẵn từ các đơn vị này; bảng đã lưu thì đơn vị được
   * duyệt sau đó trả ở `newlyApprovedIds` để đội bấm thêm (không tự chèn - đội
   * có thể đã cố ý bỏ đơn vị đó).
   */
  async get(userId: string, periodMonth: string) {
    const actor = await this.requireComposer(userId);
    this.assertMonth(periodMonth);
    const items = await this.bonusItems();
    const sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    const hints = await this.selfScoreHints(actor.id, periodMonth);
    const labels = await departmentLabels(this.departmentModel, [
      ...Object.keys(hints),
      ...(sheet?.units ?? []).map((unit) => unit.departmentId),
    ]);
    const approved = Object.keys(hints).map((id) => ({
      id,
      name: labels.get(id) ?? '',
    }));

    const units = sheet
      ? sheet.units
      : approved.map((unit) => this.blankUnit(unit.id, unit.name, items));
    const inSheet = new Set(units.map((unit) => String(unit.departmentId)));

    /* Tự chấm còn trống thì điền sẵn điểm báo cáo tháng của đơn vị - đội chỉ
       sửa khi cần. Chỉ điền ở bản đang sửa được; bản đã trình giữ nguyên. */
    const editable =
      !sheet || sheet.status === 'DRAFT' || sheet.status === 'RETURNED';
    if (editable) {
      for (const unit of units) {
        const hint = hints[String(unit.departmentId)];
        if (hint && (unit.selfScore === null || unit.selfScore === undefined)) {
          unit.selfScore = hint.score;
        }
      }
    }

    return {
      message: 'OK',
      data: {
        ...(await this.toClient(sheet, periodMonth, units)),
        criteria: items.map((item) => ({
          id: String(item._id),
          name: item.name,
          rule: item.rule,
          maxScore: item.maxScore,
        })),
        /** Đơn vị tôi đã duyệt báo cáo tháng - nguồn thêm lại đơn vị đã bỏ. */
        suggestedUnits: approved.map((unit) => ({ ...unit, approved: true })),
        /** Bảng sẽ trình tới đâu (luồng APPRAISAL) - để hộp trình nói rõ. */
        route: {
          units: await this.routing.unitsFor('APPRAISAL', userId),
          finalReviewer: await this.routing.finalReviewerFor(
            'APPRAISAL',
            userId,
          ),
        },
        /** Đã duyệt báo cáo tháng nhưng chưa có trong bảng đã lưu. */
        newlyApprovedIds: sheet
          ? approved
              .filter((unit) => !inSheet.has(unit.id))
              .map((unit) => unit.id)
          : [],
        selfScoreHints: hints,
        canEdit: editable,
      },
    };
  }

  async save(
    userId: string,
    periodMonth: string,
    dto: SaveTeamReportAppraisalDto,
  ) {
    const actor = await this.requireComposer(userId);
    this.assertMonth(periodMonth);
    let sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    if (sheet && sheet.status !== 'DRAFT' && sheet.status !== 'RETURNED') {
      throw new BadRequestException(
        'Bảng đã trình - chờ duyệt hoặc bị trả lại mới sửa được.',
      );
    }
    if (sheet && dto.version !== undefined && dto.version !== sheet.version) {
      throw new ConflictException(
        'Bảng vừa được sửa ở nơi khác - tải lại trang rồi nhập tiếp.',
      );
    }

    const items = await this.bonusItems(true);
    const itemById = new Map(items.map((item) => [String(item._id), item]));
    const seen = new Set<string>();
    const ids = dto.units.map((unit) => unit.departmentId);
    const labels = await departmentLabels(this.departmentModel, ids);
    const existing = await this.departmentModel
      .find({ _id: { $in: ids } })
      .select('_id');
    const known = new Set(existing.map((dept) => String(dept._id)));
    // Chỉ đơn vị có báo cáo tháng tôi đã duyệt (hoặc đã nằm sẵn trong bảng).
    const allowed = new Set([
      ...Object.keys(await this.selfScoreHints(actor.id, periodMonth)),
      ...(sheet?.units ?? []).map((unit) => String(unit.departmentId)),
    ]);

    const units = dto.units.map((unit) => {
      if (!known.has(unit.departmentId)) {
        throw new BadRequestException('Có đơn vị không còn trong danh mục.');
      }
      if (!allowed.has(unit.departmentId)) {
        throw new BadRequestException(
          `"${labels.get(unit.departmentId)}" chưa có báo cáo tháng do bạn duyệt - không đưa vào bảng thẩm định được.`,
        );
      }
      if (seen.has(unit.departmentId)) {
        throw new BadRequestException(
          `Đơn vị "${labels.get(unit.departmentId)}" bị thêm hai lần.`,
        );
      }
      seen.add(unit.departmentId);
      const name = labels.get(unit.departmentId) ?? '';
      return {
        departmentId: new Types.ObjectId(unit.departmentId),
        departmentName: name,
        selfScore: unit.selfScore ?? null,
        bonuses: (unit.bonuses ?? [])
          .filter((bonus) => bonus.itemId)
          .map((bonus) => {
            const item = itemById.get(bonus.itemId!);
            if (!item) {
              throw new BadRequestException(
                'Có tiêu chí cộng điểm không còn trong danh mục.',
              );
            }
            if (
              bonus.score !== null &&
              bonus.score !== undefined &&
              item.maxScore !== null &&
              bonus.score > item.maxScore
            ) {
              throw new BadRequestException(
                `${name}: điểm cộng "${item.name}" tối đa ${item.maxScore}.`,
              );
            }
            return {
              itemId: item._id,
              itemName: item.name,
              maxScore: item.maxScore,
              score: bonus.score ?? null,
              evidence: bonus.evidence?.trim() ?? '',
            };
          }),
        penalties: (unit.penalties ?? []).map((penalty) => {
          const item = penalty.itemId ? itemById.get(penalty.itemId) : null;
          if (penalty.itemId && !item) {
            throw new BadRequestException(
              'Có tiêu chí trừ điểm không còn trong danh mục.',
            );
          }
          return {
            itemId: item?._id ?? null,
            itemName: item?.name ?? '',
            content: penalty.content?.trim() ?? '',
            score: penalty.score ?? null,
          };
        }),
        upgradeNote: unit.upgradeNote?.trim() ?? '',
        proposedRating: unit.proposedRating ?? '',
        ratingNote: unit.ratingNote?.trim() ?? '',
      };
    });

    if (!sheet) {
      sheet = new this.sheetModel({
        departmentId: actor.departmentId,
        periodMonth,
      });
    }
    sheet.units = units as unknown as TeamReportAppraisalUnit[];
    sheet.leaderName = dto.leaderName?.trim() ?? sheet.leaderName;
    sheet.commanderName = dto.commanderName?.trim() ?? sheet.commanderName;
    sheet.updatedById = actor.id;
    sheet.updatedByName = actor.name;
    sheet.version += 1;
    await sheet.save();

    return {
      message: 'Đã lưu.',
      data: await this.toClient(sheet, periodMonth, sheet.units),
    };
  }

  async send(userId: string, periodMonth: string) {
    const actor = await this.requireComposer(userId);
    this.assertMonth(periodMonth);
    const sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    if (!sheet) throw new BadRequestException('Lưu bảng trước khi trình.');
    if (sheet.status !== 'DRAFT' && sheet.status !== 'RETURNED') {
      throw new BadRequestException('Bảng này đã trình rồi.');
    }
    if (!sheet.units.length) {
      throw new BadRequestException('Bảng chưa có đơn vị nào.');
    }
    const missing = sheet.units.find(
      (unit) => unit.selfScore === null || unit.selfScore === undefined,
    );
    if (missing) {
      throw new BadRequestException(
        `Chưa nhập tổng điểm tự chấm của ${missing.departmentName}.`,
      );
    }
    const noRating = sheet.units.find((unit) => !unit.proposedRating);
    if (noRating) {
      throw new BadRequestException(
        `Chưa chọn đề xuất mức xếp loại của ${noRating.departmentName}.`,
      );
    }
    if (!sheet.leaderName.trim() || !sheet.commanderName.trim()) {
      throw new BadRequestException(
        'Nhập tên Lãnh đạo phụ trách và Chỉ huy đội trước khi trình.',
      );
    }

    const fixed = await this.routing.fixedTargets('APPRAISAL', actor);
    if (!fixed) {
      throw new BadRequestException(
        'Chưa có luồng trình bảng thẩm định cho tài khoản này - báo quản trị cấu hình ở Luồng trình báo cáo.',
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
    sheet.returnReason = '';
    sheet.version += 1;
    await sheet.save();

    return {
      message: `Đã trình bảng thẩm định lên ${fixed.recipient.name}.`,
      data: await this.toClient(sheet, periodMonth, sheet.units),
    };
  }

  // ------------------------------------------------------------ người nhận

  async inbox(userId: string, query: TeamReportAdjustmentInboxQueryDto) {
    const actor = await this.requireActor(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const filter = leadInboxFilter(actor.id, query.status);
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
        unitCount: row.units.length,
        recipientName: row.recipientName,
        finalRecipientName: row.finalRecipientName ?? '',
        sentByName: row.sentByName,
        sentAt: row.sentAt,
        decidedByName: row.decidedByName,
        decidedAt: row.decidedAt,
        returnReason: row.returnReason,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async incomingDetail(userId: string, id: string) {
    const actor = await this.requireActor(userId);
    const sheet = await this.requireIncoming(actor, id);
    return {
      message: 'OK',
      data: {
        ...(await this.toClient(sheet, sheet.periodMonth, sheet.units)),
        canDecide: isHandler(sheet, actor.id),
      },
    };
  }

  async decide(userId: string, id: string, dto: DecideTeamReportDayDto) {
    const actor = await this.requireActor(userId);
    const sheet = await this.requireIncoming(actor, id);
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
      // Trả lại ở bước nào cũng về đội lập; trình lại thì đi lại từ cấp 1.
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
        ...(await this.toClient(sheet, sheet.periodMonth, sheet.units)),
        canDecide: isHandler(sheet, actor.id),
      },
    };
  }

  // ---------------------------------------------------------------- nội bộ

  private async toClient(
    sheet: TeamReportAppraisalDocument | null,
    periodMonth: string,
    units: TeamReportAppraisalUnit[],
  ) {
    const team = sheet
      ? ((
          await departmentLabels(this.departmentModel, [sheet.departmentId])
        ).get(String(sheet.departmentId)) ?? '')
      : '';
    return {
      _id: sheet ? String(sheet._id) : null,
      periodMonth,
      status: sheet?.status ?? 'DRAFT',
      stage: sheet?.stage ?? 'FIRST',
      version: sheet?.version ?? 0,
      departmentName: team,
      leaderName: sheet?.leaderName ?? '',
      commanderName: sheet?.commanderName ?? '',
      recipientName: sheet?.recipientName ?? '',
      finalRecipientName: sheet?.finalRecipientName ?? '',
      firstApproval: sheet?.firstApproval ?? null,
      sentByName: sheet?.sentByName ?? '',
      sentAt: sheet?.sentAt ?? null,
      decidedByName: sheet?.decidedByName ?? '',
      decidedAt: sheet?.decidedAt ?? null,
      returnReason: sheet?.returnReason ?? '',
      updatedAt: sheet?.updatedAt ?? null,
      units: units.map((unit) => ({
        departmentId: String(unit.departmentId),
        departmentName: unit.departmentName,
        selfScore: unit.selfScore ?? null,
        bonuses: unit.bonuses.map((bonus) => ({
          itemId: bonus.itemId ? String(bonus.itemId) : null,
          itemName: bonus.itemName,
          maxScore: bonus.maxScore ?? null,
          score: bonus.score ?? null,
          evidence: bonus.evidence,
        })),
        penalties: unit.penalties.map((penalty) => ({
          itemId: penalty.itemId ? String(penalty.itemId) : null,
          itemName: penalty.itemName ?? '',
          content: penalty.content,
          score: penalty.score ?? null,
        })),
        upgradeNote: unit.upgradeNote,
        proposedRating: unit.proposedRating,
        ratingNote: unit.ratingNote,
        ...appraisalTotals(unit),
      })),
    };
  }

  /** Mỗi tiêu chí một dòng trống - đúng khung giấy, đội chỉ việc điền. */
  private blankUnit(
    departmentId: string,
    name: string,
    items: AdjustmentItemDocument[],
  ): TeamReportAppraisalUnit {
    return {
      _id: new Types.ObjectId(),
      departmentId: new Types.ObjectId(departmentId),
      departmentName: name,
      selfScore: null,
      bonuses: items.map((item) => ({
        itemId: item._id,
        itemName: item.name,
        maxScore: item.maxScore,
        score: null,
        evidence: '',
      })),
      penalties: [],
      upgradeNote: '',
      proposedRating: '',
      ratingNote: '',
    };
  }

  /** Tiêu chí cộng điểm = danh mục Điểm cộng (I). */
  private bonusItems(includeInactive = false) {
    return this.itemModel
      .find({
        section: 'BONUS',
        ...(includeInactive ? {} : { isActive: true }),
      })
      .sort({ sortOrder: 1, code: 1 });
  }

  /**
   * BÁO CÁO THÁNG (kỳ MONTH, KẾT THÚC trong tháng) mà CHÍNH tài khoản này đã
   * duyệt - quyết đơn vị nào vào bảng thẩm định, và cho điểm tự chấm lấy sẵn
   * (tổng điểm KPI tập thể, đã gồm phần cấp trên chấm lại).
   *
   * "Đã duyệt" gồm: bản đã chốt mà tôi là chủ trì / duyệt cuối, và bản 2 cấp
   * tôi đã duyệt cấp 1 (đang chờ duyệt cuối) - phần việc của tôi đã xong.
   * Nhiều bản thì lấy bản mới nhất.
   */
  private async selfScoreHints(
    approverId: Types.ObjectId,
    periodMonth: string,
  ) {
    const from = `${periodMonth}-01`;
    const to = `${periodMonth}-31`;
    const rows = await this.summaryModel
      .find({
        period: 'MONTH',
        conclusion: { $ne: null },
        // Kỳ tháng 15 tháng trước - 14 tháng này: xét theo NGÀY KẾT THÚC (14/10 thuộc
        // tháng 10), không theo ngày bắt đầu (15/09 lại rơi sang tháng 9).
        toDate: { $gte: from, $lte: to },
        $or: [
          {
            status: 'APPROVED',
            $or: [
              { recipientId: approverId },
              { finalRecipientId: approverId },
            ],
          },
          {
            status: 'PENDING',
            stage: 'FINAL',
            'firstApproval.byId': approverId,
          },
        ],
      })
      .sort({ updatedAt: -1 })
      .select('departmentId title period conclusion updatedAt');
    const hints: Record<
      string,
      { score: number; maxScore: number; title: string }
    > = {};
    for (const row of rows) {
      const key = String(row.departmentId);
      if (hints[key] || !row.conclusion) continue;
      hints[key] = {
        score: row.conclusion.totalScore,
        maxScore: row.conclusion.maxScore ?? 0,
        title: row.title,
      };
    }
    return hints;
  }

  private assertMonth(periodMonth: string) {
    if (!MONTH.test(periodMonth)) {
      throw new BadRequestException('Tháng phải có dạng YYYY-MM.');
    }
    // Không lập trước cho tháng chưa tới - theo giờ server.
    if (periodMonth > serverDateYmd().slice(0, 7)) {
      throw new BadRequestException('Chưa tới tháng này.');
    }
  }

  private async requireComposer(userId: string) {
    const actor = await this.requireActor(userId);
    if (!(await this.routing.matchesSender('APPRAISAL', userId))) {
      throw new ForbiddenException(
        'Tài khoản này không lập bảng thẩm định - xem Luồng trình báo cáo.',
      );
    }
    return actor;
  }

  private async requireIncoming(actor: Actor, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy bảng.');
    }
    const sheet = await this.sheetModel.findById(id);
    if (!sheet || sheet.status === 'DRAFT') {
      throw new NotFoundException('Không tìm thấy bảng.');
    }
    if (!isApprover(sheet, actor.id)) {
      throw new ForbiddenException('Bảng này không trình tới tài khoản bạn.');
    }
    return sheet;
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
