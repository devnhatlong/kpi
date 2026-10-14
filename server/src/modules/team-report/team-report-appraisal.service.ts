import {
  BadRequestException,
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
  SendTeamReportAppraisalDto,
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
import {
  TeamReportCommendation,
  TeamReportCommendationDocument,
} from './schemas/team-report-commendation.schema';
import {
  DepartmentLevel,
  DepartmentLevelDocument,
} from '@/modules/department-levels/schemas/department-level.schema';
import { TeamReportAdjustmentRoutingService } from './team-report-adjustment-routing.service';
import { departmentLabels } from './team-report.department-label';
import {
  applyApprove,
  isApprover,
  isHandler,
  leadInboxFilter,
  resetStages,
} from './team-report.stages';
import { conflict, saveIfUnchanged } from './team-report.concurrency';
import { serverDateYmd } from './team-report.time';

type Actor = { id: Types.ObjectId; name: string; departmentId: Types.ObjectId };

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Đơn vị còn sửa được: chưa trình hoặc bị trả lại. */
const unitEditable = (unit: { status?: string }) =>
  !unit.status || unit.status === 'DRAFT' || unit.status === 'RETURNED';

/** Vòng đời của một đơn vị chưa trình lần nào. */
function blankLifecycle() {
  return {
    status: 'DRAFT' as const,
    stage: 'FIRST' as const,
    recipientId: null,
    recipientName: '',
    recipientDepartmentId: null,
    participants: [],
    finalRecipientId: null,
    finalRecipientName: '',
    finalRecipientDepartmentId: null,
    firstApproval: null,
    sentById: null,
    sentByName: '',
    sentAt: null,
    decidedById: null,
    decidedByName: '',
    decidedAt: null,
    returnReason: '',
    leaderName: '',
    commanderName: '',
  };
}

/** Trạng thái trình / duyệt của một đơn vị, dạng client đọc. */
function lifecycleView(unit: TeamReportAppraisalUnit) {
  return {
    status: unit.status ?? 'DRAFT',
    stage: unit.stage ?? 'FIRST',
    recipientName: unit.recipientName ?? '',
    finalRecipientName: unit.finalRecipientName ?? '',
    firstApproval: unit.firstApproval ?? null,
    sentByName: unit.sentByName ?? '',
    sentAt: unit.sentAt ?? null,
    decidedByName: unit.decidedByName ?? '',
    decidedAt: unit.decidedAt ?? null,
    returnReason: unit.returnReason ?? '',
    leaderName: unit.leaderName ?? '',
    commanderName: unit.commanderName ?? '',
  };
}

/** Subdocument → object thường, để chép / gán lại mà không kéo theo mongoose. */
function plainUnit(unit: TeamReportAppraisalUnit): TeamReportAppraisalUnit {
  const doc = unit as TeamReportAppraisalUnit & {
    toObject?: () => TeamReportAppraisalUnit;
  };
  return doc.toObject ? doc.toObject() : { ...unit };
}
/** Cấp đơn vị in TÊN thay cho mã - mã của các cấp này là số hiệu hành chính. */
const NAME_LEVELS = new Set(['XA', 'PHUONG', 'DON', 'DACKHU']);
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
    @InjectModel(TeamReportCommendation.name)
    private readonly commendationModel: Model<TeamReportCommendationDocument>,
    @InjectModel(DepartmentLevel.name)
    private readonly levelModel: Model<DepartmentLevelDocument>,
    private readonly routing: TeamReportAdjustmentRoutingService,
  ) {}

  /**
   * SOI CHIẾU bảng biểu dương, phê bình các phòng đã gửi trong CÙNG THÁNG: mỗi
   * đơn vị được nhắc tới ở dòng nào - để người thẩm định đưa nhanh vào điểm
   * cộng / trừ thay vì gõ lại.
   *
   * Dòng biểu dương mang sẵn nhóm nội dung = tiêu chí cộng điểm (cùng danh mục
   * Điểm cộng I) nên rơi đúng tiêu chí. Dòng phê bình không có tiêu chí - người
   * thẩm định tự chọn tiêu chí khi đưa vào điểm trừ.
   *
   * Lấy bản đã gửi (chờ duyệt / đã duyệt / bị trả lại), không lấy nháp - nháp
   * phòng còn đang sửa. Trạng thái đi kèm để người thẩm định cân nhắc.
   */
  private async commendationHints(
    periodMonth: string,
    departmentIds: Array<Types.ObjectId | string>,
  ) {
    type Hint = {
      rowId: string;
      itemId: string | null;
      itemName: string;
      content: string;
      evidence: string;
      /** Ghi chú của phòng - thường là mức đề xuất ("đề nghị trừ 1 điểm"). */
      note: string;
      fromName: string;
      status: string;
    };
    const result: Record<string, { praises: Hint[]; criticisms: Hint[] }> = {};
    const ids = [...new Set(departmentIds.map(String))];
    if (!ids.length) return result;
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    /* Chỉ bảng CẤP PHÒNG - bảng của các đội gửi trưởng phòng là bản nội bộ
       trong phòng, chưa qua trưởng phòng tổng hợp nên không phải đề xuất
       chính thức gửi các đội PV01. */
    const phong = await this.levelModel
      .findOne({ code: 'PHONG' })
      .select('_id');
    const phongDepartments = phong
      ? await this.departmentModel.find({ levelId: phong._id }).select('_id')
      : [];
    const sheets = await this.commendationModel
      .find({
        periodMonth,
        departmentId: { $in: phongDepartments.map((dept) => dept._id) },
        status: { $ne: 'DRAFT' },
        $or: [
          { 'praises.departmentIds': { $in: objectIds } },
          { 'criticisms.departmentIds': { $in: objectIds } },
        ],
      })
      .sort({ sentAt: 1 });
    const labels = await departmentLabels(
      this.departmentModel,
      sheets.map((sheet) => sheet.departmentId),
    );
    const wanted = new Set(ids);
    for (const sheet of sheets) {
      const fromName = labels.get(String(sheet.departmentId)) ?? '';
      const push = (
        rows: typeof sheet.praises,
        key: 'praises' | 'criticisms',
      ) => {
        for (const row of rows) {
          for (const id of row.departmentIds.map(String)) {
            if (!wanted.has(id)) continue;
            result[id] ??= { praises: [], criticisms: [] };
            result[id][key].push({
              rowId: String(row._id),
              itemId: row.itemId ? String(row.itemId) : null,
              itemName: row.itemName,
              content: row.content,
              evidence: row.evidence,
              note: row.note ?? '',
              fromName,
              status: sheet.status,
            });
          }
        }
      };
      push(sheet.praises, 'praises');
      push(sheet.criticisms, 'criticisms');
    }
    return result;
  }

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
              { 'units.recipientId': new Types.ObjectId(userId) },
              { 'units.finalRecipientId': new Types.ObjectId(userId) },
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

    /* Tự chấm = điểm báo cáo tháng của đơn vị, không ai sửa tay. Đơn vị còn
       sửa được thì luôn lấy số MỚI NHẤT (báo cáo có thể vừa được chấm lại /
       duyệt lại); đơn vị đã trình giữ nguyên số lúc trình. */
    for (const unit of units) {
      if (!unitEditable(unit)) continue;
      const hint = hints[String(unit.departmentId)];
      if (hint) unit.selfScore = hint.score;
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
        /** Biểu dương / phê bình cùng tháng nhắc tới từng đơn vị - để soi chiếu. */
        commendationHints: await this.commendationHints(periodMonth, [
          ...units.map((unit) => unit.departmentId),
          ...approved.map((unit) => unit.id),
        ]),
        /* Bảng luôn mở để thêm / sửa đơn vị chưa trình - từng đơn vị khoá
           riêng theo trạng thái của nó (`units[].status`). */
        canEdit: true,
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
    /* Bản client đang sửa phải đúng là bản đang lưu - kể cả bảng chưa lưu lần
       nào (version 0): hai người cùng mở bảng trống, người sau lưu không được
       đè mất phần người trước vừa lưu. */
    const expected = dto.version ?? 0;
    if ((sheet?.version ?? 0) !== expected) throw conflict();

    const items = await this.bonusItems(true);
    const itemById = new Map(items.map((item) => [String(item._id), item]));
    const seen = new Set<string>();
    const ids = dto.units.map((unit) => unit.departmentId);
    const labels = await departmentLabels(this.departmentModel, ids);
    const existing = await this.departmentModel
      .find({ _id: { $in: ids } })
      .select('_id');
    const known = new Set(existing.map((dept) => String(dept._id)));
    const hints = await this.selfScoreHints(actor.id, periodMonth);
    // Chỉ đơn vị có báo cáo tháng tôi đã duyệt (hoặc đã nằm sẵn trong bảng).
    const allowed = new Set([
      ...Object.keys(hints),
      ...(sheet?.units ?? []).map((unit) => String(unit.departmentId)),
    ]);
    /* Tự chấm KHÔNG nhận từ client: là tổng điểm trên báo cáo tháng đơn vị
       đã trình (và đã được duyệt), người thẩm định chỉ cộng / trừ trên đó.
       Đơn vị không còn báo cáo nào khớp thì giữ số đã lưu. */
    const stored = new Map(
      (sheet?.units ?? []).map((unit) => [
        String(unit.departmentId),
        plainUnit(unit),
      ]),
    );

    const units = dto.units.map((unit): TeamReportAppraisalUnit => {
      /* Đơn vị đã trình (chờ duyệt / đã duyệt) là của cấp trên đang cầm -
         giữ NGUYÊN bản đã lưu, bỏ qua những gì client gửi cho nó. */
      const before = stored.get(unit.departmentId);
      if (before && !unitEditable(before)) {
        seen.add(unit.departmentId);
        return before;
      }
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
      /* Trần "tối đa N điểm" là của CẢ TIÊU CHÍ, không phải từng dòng: nhiều
         thành tích cùng tiêu chí cộng lại vẫn không vượt N. Chặn khi lưu để
         bảng không ghi một con số cộng mà phần tính điểm sẽ cắt bớt. */
      const perItem = new Map<string, number>();
      for (const bonus of unit.bonuses ?? []) {
        if (!bonus.itemId || bonus.score === null || bonus.score === undefined)
          continue;
        perItem.set(
          bonus.itemId,
          (perItem.get(bonus.itemId) ?? 0) + bonus.score,
        );
      }
      for (const [itemId, sum] of perItem) {
        const item = itemById.get(itemId);
        if (item && item.maxScore !== null && sum > item.maxScore + 1e-9) {
          throw new BadRequestException(
            `${name}: tổng điểm cộng "${item.name}" là ${round2(sum)}, vượt mức tối đa ${item.maxScore} của tiêu chí.`,
          );
        }
      }
      return {
        // Giữ vòng đời đã có (bị trả lại thì vẫn là bị trả lại cho tới khi trình lại).
        ...(before ?? blankLifecycle()),
        _id: before?._id ?? new Types.ObjectId(),
        departmentId: new Types.ObjectId(unit.departmentId),
        departmentName: name,
        selfScore: hints[unit.departmentId]?.score ?? before?.selfScore ?? null,
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
    // Đơn vị đã trình không bỏ khỏi bảng được - client có gửi thiếu cũng giữ lại.
    for (const [id, unit] of stored) {
      if (!seen.has(id) && !unitEditable(unit)) units.push(unit);
    }

    if (!sheet) {
      sheet = new this.sheetModel({
        departmentId: actor.departmentId,
        periodMonth,
      });
    }
    sheet.units = units;
    sheet.leaderName = dto.leaderName?.trim() ?? sheet.leaderName;
    sheet.commanderName = dto.commanderName?.trim() ?? sheet.commanderName;
    sheet.updatedById = actor.id;
    sheet.updatedByName = actor.name;
    sheet.version = expected + 1;
    await saveIfUnchanged(sheet, expected);

    return {
      message: 'Đã lưu.',
      data: await this.toClient(sheet, periodMonth, sheet.units),
    };
  }

  /**
   * Trình RIÊNG các đơn vị đã chọn - mỗi đơn vị một lượt duyệt độc lập.
   *
   * Trình đúng bản ĐÃ LƯU (client lưu trước rồi mới gọi). Đơn vị đã trình
   * thì bỏ qua lời yêu cầu thay vì báo lỗi cả lượt - chọn lẫn một đơn vị vừa
   * trình ở tab khác không đáng để chặn các đơn vị kia.
   */
  async send(
    userId: string,
    periodMonth: string,
    dto: SendTeamReportAppraisalDto,
  ) {
    const actor = await this.requireComposer(userId);
    this.assertMonth(periodMonth);
    const sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    if (!sheet) throw new BadRequestException('Lưu bảng trước khi trình.');

    const leaderName = dto.leaderName.trim();
    const commanderName = dto.commanderName.trim();
    if (!leaderName || !commanderName) {
      throw new BadRequestException(
        'Nhập tên Lãnh đạo phụ trách và Chỉ huy đội trước khi trình.',
      );
    }
    const wanted = new Set(dto.departmentIds);
    const picked = sheet.units.filter(
      (unit) => wanted.has(String(unit.departmentId)) && unitEditable(unit),
    );
    if (!picked.length) {
      throw new BadRequestException(
        'Chưa chọn đơn vị nào còn chờ trình (chưa trình hoặc bị trả lại).',
      );
    }
    for (const unit of picked) {
      if (unit.selfScore === null || unit.selfScore === undefined) {
        throw new BadRequestException(
          `Chưa có tổng điểm tự chấm của ${unit.departmentName}.`,
        );
      }
      if (!unit.proposedRating) {
        throw new BadRequestException(
          `Chưa chọn đề xuất mức xếp loại của ${unit.departmentName}.`,
        );
      }
    }

    const fixed = await this.routing.fixedTargets('APPRAISAL', actor);
    if (!fixed) {
      throw new BadRequestException(
        'Chưa có luồng trình bảng thẩm định cho tài khoản này - báo quản trị cấu hình ở Luồng trình báo cáo.',
      );
    }
    const now = new Date();
    for (const unit of picked) {
      unit.status = 'PENDING';
      unit.recipientId = fixed.recipient.id;
      unit.recipientName = fixed.recipient.name;
      unit.recipientDepartmentId = fixed.recipient.departmentId;
      // Trình lại thì đi lại từ cấp 1.
      resetStages(unit, fixed.final);
      unit.participants = fixed.participants;
      unit.sentById = actor.id;
      unit.sentByName = actor.name;
      unit.sentAt = now;
      unit.decidedById = null;
      unit.decidedByName = '';
      unit.decidedAt = null;
      unit.returnReason = '';
      unit.leaderName = leaderName;
      unit.commanderName = commanderName;
    }
    // Tên người ký cũng nhớ ở bảng - lần trình sau điền sẵn.
    sheet.leaderName = leaderName;
    sheet.commanderName = commanderName;
    sheet.markModified('units');
    sheet.version += 1;
    await saveIfUnchanged(sheet, sheet.version - 1);

    return {
      message: `Đã trình ${picked.length} đơn vị lên ${fixed.recipient.name}.`,
      data: await this.toClient(sheet, periodMonth, sheet.units),
    };
  }

  // ------------------------------------------------------------ người nhận

  /**
   * Hộp đến: MỖI DÒNG LÀ MỘT ĐƠN VỊ đã trình (không phải một bảng) - duyệt /
   * trả lại riêng từng đơn vị. Tách đơn vị ra khỏi bảng rồi lọc bằng đúng luật
   * hộp "Chủ trì" dùng chung (`leadInboxFilter`) trên các trường của đơn vị.
   */
  async inbox(userId: string, query: TeamReportAdjustmentInboxQueryDto) {
    const actor = await this.requireActor(userId);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const [result] = await this.sheetModel.aggregate<{
      rows: Array<
        TeamReportAppraisalUnit & {
          teamId: Types.ObjectId;
          periodMonth: string;
        }
      >;
      total: Array<{ n: number }>;
    }>([
      {
        $match: {
          $or: [
            { 'units.recipientId': actor.id },
            { 'units.finalRecipientId': actor.id },
          ],
        },
      },
      { $unwind: '$units' },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              '$units',
              { teamId: '$departmentId', periodMonth: '$periodMonth' },
            ],
          },
        },
      },
      { $match: leadInboxFilter(actor.id, query.status) },
      { $sort: { sentAt: -1, periodMonth: -1 } },
      {
        $facet: {
          rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: 'n' }],
        },
      },
    ]);
    const rows = result?.rows ?? [];
    const total = result?.total[0]?.n ?? 0;
    const labels = await departmentLabels(this.departmentModel, [
      ...rows.map((row) => row.teamId),
      ...rows.map((row) => row.departmentId),
    ]);
    return {
      message: 'OK',
      data: rows.map((row) => ({
        _id: String(row._id),
        periodMonth: row.periodMonth,
        status: row.status,
        stage: row.stage ?? 'FIRST',
        /** Đội thẩm định (người lập). */
        departmentName: labels.get(String(row.teamId)) ?? '',
        /** Đơn vị được thẩm định. */
        unitName:
          labels.get(String(row.departmentId)) ?? row.departmentName ?? '',
        proposedRating: row.proposedRating ?? '',
        finalScore: appraisalTotals(row).finalScore,
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

  /** Mở MỘT đơn vị đã trình - `id` là id của đơn vị trong bảng. */
  async incomingDetail(userId: string, id: string) {
    const actor = await this.requireActor(userId);
    const { sheet, unit } = await this.requireIncoming(actor, id);
    return { message: 'OK', data: await this.incomingView(sheet, unit, actor) };
  }

  async decide(userId: string, id: string, dto: DecideTeamReportDayDto) {
    const actor = await this.requireActor(userId);
    const { sheet, unit } = await this.requireIncoming(actor, id);
    if (unit.status !== 'PENDING') {
      throw new BadRequestException('Chỉ duyệt được đơn vị đang chờ duyệt.');
    }
    if (!isHandler(unit, actor.id)) {
      throw new BadRequestException(
        'Đơn vị này đang chờ cấp duyệt khác - không quyết được lúc này.',
      );
    }
    let outcome: 'RETURNED' | 'FORWARDED' | 'APPROVED' = 'RETURNED';
    if (dto.decision === 'RETURN') {
      const reason = dto.reason?.trim() ?? '';
      if (!reason) throw new BadRequestException('Lý do trả lại là bắt buộc.');
      // Trả lại ở bước nào cũng về đội lập; trình lại thì đi lại từ cấp 1.
      unit.status = 'RETURNED';
      unit.returnReason = reason;
    } else {
      outcome = applyApprove(unit, actor);
      unit.returnReason = '';
    }
    if (outcome !== 'FORWARDED') {
      unit.decidedById = actor.id;
      unit.decidedByName = actor.name;
      unit.decidedAt = new Date();
    }
    sheet.markModified('units');
    sheet.version += 1;
    await saveIfUnchanged(sheet, sheet.version - 1);
    return {
      message:
        outcome === 'RETURNED'
          ? 'Đã trả lại.'
          : outcome === 'FORWARDED'
            ? `Đã duyệt cấp 1 - chuyển ${unit.finalRecipientName} duyệt cuối.`
            : 'Đã duyệt.',
      data: await this.incomingView(sheet, unit, actor),
    };
  }

  /**
   * Bày một đơn vị cho nơi duyệt: khuôn bảng như bên lập (để dùng lại màn bàn
   * làm việc) nhưng chỉ một đơn vị, và trạng thái / người ký là CỦA ĐƠN VỊ.
   */
  private async incomingView(
    sheet: TeamReportAppraisalDocument,
    unit: TeamReportAppraisalUnit,
    actor: Actor,
  ) {
    const base = await this.toClient(sheet, sheet.periodMonth, [unit]);
    return {
      ...base,
      ...lifecycleView(unit),
      canDecide: isHandler(unit, actor.id),
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
    const short = await this.shortNames(units);
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
        _id: unit._id ? String(unit._id) : null,
        ...lifecycleView(unit),
        departmentId: String(unit.departmentId),
        departmentName: unit.departmentName,
        shortName: short.get(String(unit.departmentId)) ?? unit.departmentName,
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

  /**
   * Tên gọn của đơn vị cho cột "Đơn vị" khi in: MÃ đơn vị (PA01.1, PV06…) cho
   * gọn cột. Riêng xã / phường / đồn / đặc khu mã là số hiệu hành chính (25054)
   * đọc không ra ai, nên giữ nguyên tên.
   */
  private async shortNames(units: TeamReportAppraisalUnit[]) {
    const result = new Map<string, string>();
    if (!units.length) return result;
    const departments = await this.departmentModel
      .find({ _id: { $in: units.map((unit) => unit.departmentId) } })
      .select('code levelId')
      .populate<{ levelId: { code?: string } | null }>('levelId', 'code');
    for (const department of departments) {
      const level = department.levelId?.code ?? '';
      if (department.code && !NAME_LEVELS.has(level)) {
        result.set(String(department._id), department.code);
      }
    }
    return result;
  }

  /** Mỗi tiêu chí một dòng trống - đúng khung giấy, đội chỉ việc điền. */
  private blankUnit(
    departmentId: string,
    name: string,
    items: AdjustmentItemDocument[],
  ): TeamReportAppraisalUnit {
    return {
      ...blankLifecycle(),
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

  /** Đơn vị đã trình tới tôi - tra bằng id đơn vị trong bảng. */
  private async requireIncoming(actor: Actor, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy đơn vị thẩm định.');
    }
    const sheet = await this.sheetModel.findOne({
      'units._id': new Types.ObjectId(id),
    });
    const unit = sheet?.units.find((item) => String(item._id) === id);
    if (!sheet || !unit || unit.status === 'DRAFT') {
      throw new NotFoundException('Không tìm thấy đơn vị thẩm định.');
    }
    if (!isApprover(unit, actor.id)) {
      throw new ForbiddenException('Đơn vị này không trình tới tài khoản bạn.');
    }
    return { sheet, unit };
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
