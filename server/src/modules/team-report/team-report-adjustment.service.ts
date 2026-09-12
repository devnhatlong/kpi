import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import {
  ADJUSTMENT_SECTIONS,
  AdjustmentItem,
  AdjustmentItemDocument,
  type AdjustmentSection,
} from '@/modules/mission-form-config/schemas/adjustment-item.schema';
import {
  FormTemplate,
  FormTemplateColumn,
  FormTemplateDocument,
} from '@/modules/mission-form-config/schemas/form-template.schema';
import { FormTemplatesService } from '@/modules/mission-form-config/form-templates.service';
import {
  TeamReportAdjustmentEntry,
  TeamReportAdjustmentSheet,
  TeamReportAdjustmentSheetDocument,
} from './schemas/team-report-adjustment-sheet.schema';
import {
  AddTeamReportAdjustmentEntryDto,
  DecideTeamReportDayDto,
  SendTeamReportAdjustmentDto,
  TeamReportAdjustmentInboxQueryDto,
  TeamReportAdjustmentQueryDto,
  UpdateTeamReportAdjustmentEntryDto,
} from './dto/team-report.dto';
import { TeamReportService } from './team-report.service';
import { isYmd, serverDateYmd } from './team-report.time';
import { TeamReportAdjustmentAccessService } from './team-report-adjustment-access.service';

type Actor = {
  id: Types.ObjectId;
  name: string;
  departmentId: Types.ObjectId;
};

/** Bộ cột của mẫu một phần, rút gọn còn đúng thứ bảng cần. */
type SectionTemplate = {
  _id: string;
  code: string;
  name: string;
  version: number;
  columns: FormTemplateColumn[];
  headerGroups: unknown[];
};

type SectionTemplates = Record<AdjustmentSection, SectionTemplate | null>;

/**
 * Ba cột nửa trái chép từ danh mục và cột STT - bảng tự bày, không phải ô nhập.
 * Luật phải khớp client (`LEFT_SEMANTICS` trong màn nhập).
 */
const LEFT_SEMANTICS = new Set([
  'stt',
  'adjustment_name',
  'adjustment_rule',
  'adjustment_max_score',
]);

/**
 * Phụ lục "Bảng đề xuất điểm cộng, điểm trừ và điều chỉnh, khống chế mức xếp
 * loại" của đội - tháng một bản.
 *
 * Nửa trái là danh mục quản trị khai ở `mission-form-config/adjustments`. Nửa
 * phải - cột nào, tên gì, kiểu gì - do MẪU BẢNG của từng phần quyết định (mẫu
 * gắn `forAdjustment`), dựng ở Mẫu báo cáo nhiệm vụ như bảng A và các trục.
 * Service này không có trường cứng nào ngoài mục và khoá cột.
 */
@Injectable()
export class TeamReportAdjustmentService {
  constructor(
    @InjectModel(TeamReportAdjustmentSheet.name)
    private readonly sheetModel: Model<TeamReportAdjustmentSheetDocument>,
    @InjectModel(AdjustmentItem.name)
    private readonly itemModel: Model<AdjustmentItemDocument>,
    @InjectModel(FormTemplate.name)
    private readonly formTemplateModel: Model<FormTemplateDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly formTemplatesService: FormTemplatesService,
    private readonly access: TeamReportAdjustmentAccessService,
    private readonly teamReportService: TeamReportService,
  ) {}

  /**
   * Phụ lục của một tháng, kèm danh mục và mẫu của từng phần.
   *
   * Chưa có bản thì trả bản rỗng với mẫu HIỆN HÀNH, không ghi xuống. Bản đã có
   * thì mẫu là bản đã đóng dấu lúc lập - quản trị sửa mẫu về sau không làm méo
   * bảng đã nhập.
   */
  async sheet(userId: string, query: TeamReportAdjustmentQueryDto) {
    const actor = await this.requireActor(userId);
    // Ai được nhập do quản trị đặt (vai trò / tài khoản / đơn vị) - kiểm ở đây,
    // không gác bằng mã quyền cứng ở controller.
    await this.access.assertAllowed(userId);
    const periodMonth = this.requireMonth(query.periodMonth);

    const stored = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    const entries = stored?.entries ?? [];
    const templates = stored
      ? await this.templatesOfSheet(stored)
      : await this.currentTemplates();

    const usedIds = new Set(entries.map((entry) => String(entry.itemId)));
    const items = await this.itemModel
      .find({
        $or: [
          { isActive: true },
          { _id: { $in: [...usedIds].map((id) => new Types.ObjectId(id)) } },
        ],
      })
      .sort({ section: 1, sortOrder: 1, name: 1 });

    const months = (
      await this.sheetModel
        .find({ departmentId: actor.departmentId })
        .select('periodMonth')
        .sort({ periodMonth: -1 })
    ).map((item) => item.periodMonth);

    return {
      message: 'OK',
      data: {
        ...(await this.toClient(stored, periodMonth, entries, templates)),
        catalog: items,
        months,
      },
    };
  }

  /** Thêm một dòng kết quả dưới một mục. Lần đầu của tháng thì tạo bản. */
  async addEntry(
    userId: string,
    month: string,
    dto: AddTeamReportAdjustmentEntryDto,
  ) {
    const actor = await this.requireActor(userId);
    // Ai được nhập do quản trị đặt (vai trò / tài khoản / đơn vị) - kiểm ở đây,
    // không gác bằng mã quyền cứng ở controller.
    await this.access.assertAllowed(userId);
    const periodMonth = this.requireMonth(month);

    let sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    if (!sheet) {
      /*
        Bản đầu tiên của tháng: chốt luôn mẫu của cả ba phần. Chốt cả ba chứ
        không chỉ phần đang thêm - giữa tháng quản trị đổi mẫu phần II thì các
        dòng phần II thêm sau vẫn phải cùng bộ cột với dòng thêm trước.
      */
      const current = await this.currentTemplates();
      sheet = new this.sheetModel({
        departmentId: actor.departmentId,
        periodMonth,
        entries: [],
        templates: Object.fromEntries(
          ADJUSTMENT_SECTIONS.map((section) => [
            section,
            {
              formTemplateId: current[section]
                ? new Types.ObjectId(current[section]._id)
                : null,
              formTemplateVersion: current[section]?.version ?? null,
            },
          ]),
        ),
        version: 0,
        edits: [],
      });
    }
    this.assertVersion(sheet, dto.version);
    this.assertTeamEditable(sheet);

    const item = await this.itemModel.findById(
      this.requireObjectId(dto.itemId, 'Mục'),
    );
    if (!item || !item.isActive) {
      throw new BadRequestException(
        'Mục này không còn trong danh mục đang hoạt động.',
      );
    }
    const templates = await this.templatesOfSheet(sheet);
    const template = templates[item.section];
    if (!template) {
      throw new BadRequestException(
        'Phần này chưa được gán mẫu bảng. Quản trị cần dựng form ở Mẫu báo cáo nhiệm vụ trước.',
      );
    }

    const entry: TeamReportAdjustmentEntry = {
      _id: new Types.ObjectId(),
      itemId: item._id,
      section: item.section,
      itemCode: item.code,
      itemName: item.name,
      itemMaxScore: item.maxScore ?? null,
      fieldValues: {},
    };
    entry.fieldValues = await this.applyValues(
      entry,
      template,
      dto.fieldValues ?? {},
    );

    sheet.entries.push(entry);
    this.appendEdit(
      sheet,
      actor,
      `${item.code} · ${item.name}`,
      '',
      'thêm dòng',
    );
    sheet.version += 1;
    sheet.markModified('entries');
    await sheet.save();

    return {
      message: 'Đã thêm dòng.',
      data: await this.toClient(sheet, periodMonth, sheet.entries, templates),
    };
  }

  /** Sửa các ô của một dòng đã có. */
  async updateEntry(
    userId: string,
    month: string,
    entryId: string,
    dto: UpdateTeamReportAdjustmentEntryDto,
  ) {
    const actor = await this.requireActor(userId);
    // Ai được nhập do quản trị đặt (vai trò / tài khoản / đơn vị) - kiểm ở đây,
    // không gác bằng mã quyền cứng ở controller.
    await this.access.assertAllowed(userId);
    const { sheet, entry } = await this.requireEntry(actor, month, entryId);
    this.assertVersion(sheet, dto.version);
    this.assertTeamEditable(sheet);

    const templates = await this.templatesOfSheet(sheet);
    const template = templates[entry.section];
    if (!template) {
      throw new BadRequestException('Phần này không còn mẫu bảng để đọc cột.');
    }

    const before = { ...(entry.fieldValues ?? {}) };
    entry.fieldValues = await this.applyValues(
      entry,
      template,
      dto.fieldValues ?? {},
    );

    let changed = 0;
    for (const column of this.inputColumns(template)) {
      const from = String(before[column.key] ?? '');
      const to = String(entry.fieldValues[column.key] ?? '');
      if (from === to) continue;
      changed += 1;
      this.appendEdit(
        sheet,
        actor,
        `${entry.itemCode} · ${column.title}`,
        from,
        to,
      );
    }
    if (!changed) {
      return {
        message: 'Không có ô nào thay đổi.',
        data: await this.toClient(
          sheet,
          sheet.periodMonth,
          sheet.entries,
          templates,
        ),
      };
    }

    sheet.version += 1;
    sheet.markModified('entries');
    await sheet.save();
    return {
      message: `Đã lưu ${changed} ô.`,
      data: await this.toClient(
        sheet,
        sheet.periodMonth,
        sheet.entries,
        templates,
      ),
    };
  }

  async removeEntry(
    userId: string,
    month: string,
    entryId: string,
    version: number,
  ) {
    const actor = await this.requireActor(userId);
    // Ai được nhập do quản trị đặt (vai trò / tài khoản / đơn vị) - kiểm ở đây,
    // không gác bằng mã quyền cứng ở controller.
    await this.access.assertAllowed(userId);
    const { sheet, entry } = await this.requireEntry(actor, month, entryId);
    this.assertVersion(sheet, version);
    this.assertTeamEditable(sheet);
    const templates = await this.templatesOfSheet(sheet);

    sheet.entries = sheet.entries.filter(
      (row) => String(row._id) !== String(entry._id),
    );
    const scoreKey = this.scoreColumnOf(
      entry.section,
      templates[entry.section],
    )?.key;
    const score = scoreKey ? entry.fieldValues?.[scoreKey] : undefined;
    this.appendEdit(
      sheet,
      actor,
      `${entry.itemCode} · ${entry.itemName}`,
      score !== undefined && score !== '' ? `${score} điểm` : 'dòng',
      'đã xoá dòng',
    );
    sheet.version += 1;
    sheet.markModified('entries');
    await sheet.save();
    return {
      message: 'Đã xoá dòng.',
      data: await this.toClient(
        sheet,
        sheet.periodMonth,
        sheet.entries,
        templates,
      ),
    };
  }

  // ============================================================ gửi và duyệt

  /**
   * Trình bảng của tháng lên một người cấp trên - cùng đường với báo cáo tổng
   * hợp: người nhận do đội chọn, lọc trong các cấp trên có quyền duyệt.
   */
  async send(userId: string, month: string, dto: SendTeamReportAdjustmentDto) {
    const actor = await this.requireActor(userId);
    await this.access.assertAllowed(userId);
    const periodMonth = this.requireMonth(month);

    const sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    if (!sheet || !sheet.entries.length) {
      throw new BadRequestException(
        'Tháng này chưa có dòng nào để trình. Nhập ít nhất một dòng trước.',
      );
    }
    this.assertVersion(sheet, dto.version);
    if (sheet.status !== 'DRAFT' && sheet.status !== 'RETURNED') {
      throw new BadRequestException('Bảng này đã trình rồi.');
    }

    const recipient = await this.teamReportService.requireSummaryRecipientFor(
      String(actor.id),
      dto.recipientId,
    );

    sheet.status = 'PENDING';
    sheet.recipientId = recipient.id;
    sheet.recipientName = recipient.name;
    sheet.recipientDepartmentId = recipient.departmentId;
    sheet.sentById = actor.id;
    sheet.sentByName = actor.name;
    sheet.sentAt = new Date();
    sheet.returnReason = '';
    if (dto.note?.trim()) sheet.note = dto.note.trim();
    this.appendEdit(
      sheet,
      actor,
      'Trạng thái',
      'nháp',
      `đã trình ${recipient.name}`,
    );
    sheet.version += 1;
    await sheet.save();

    const templates = await this.templatesOfSheet(sheet);
    return {
      message: `Đã trình bảng lên ${recipient.name}.`,
      data: await this.toClient(sheet, periodMonth, sheet.entries, templates),
    };
  }

  /**
   * Hộp đến của cấp trên - bản trình tới ĐƠN VỊ mình (không chỉ đích danh
   * người được chọn: trưởng phòng đi vắng thì người khác trong phòng vẫn mở
   * được, cùng luật với bản tổng hợp).
   */
  async inbox(userId: string, query: TeamReportAdjustmentInboxQueryDto) {
    const actor = await this.requireActor(userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {
      recipientDepartmentId: actor.departmentId,
      status: { $ne: 'DRAFT' },
    };
    if (query.status) filter.status = query.status;

    const [rows, total] = await Promise.all([
      this.sheetModel
        .find(filter)
        .sort({ sentAt: -1, periodMonth: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('-entries -edits -templates')
        .populate('departmentId', 'code name'),
      this.sheetModel.countDocuments(filter),
    ]);

    return {
      message: 'OK',
      data: rows.map((row) => ({
        _id: String(row._id),
        periodMonth: row.periodMonth,
        status: row.status,
        department: row.departmentId,
        recipientName: row.recipientName,
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

  /** Cấp trên mở một bản trình tới đơn vị mình. */
  async incomingDetail(userId: string, id: string) {
    const actor = await this.requireActor(userId);
    const sheet = await this.requireIncoming(actor, id);
    const templates = await this.templatesOfSheet(sheet);
    const usedIds = sheet.entries.map((entry) => entry.itemId);
    const items = await this.itemModel
      .find({ $or: [{ isActive: true }, { _id: { $in: usedIds } }] })
      .sort({ section: 1, sortOrder: 1, name: 1 });
    const names = await this.departmentNameOf(sheet.departmentId);
    return {
      message: 'OK',
      data: {
        ...(await this.toClient(
          sheet,
          sheet.periodMonth,
          sheet.entries,
          templates,
        )),
        catalog: items,
        department: { id: String(sheet.departmentId), name: names },
      },
    };
  }

  /** Duyệt hoặc trả lại. Trả lại BẮT BUỘC có lý do - đội phải biết sửa gì. */
  async decide(userId: string, id: string, dto: DecideTeamReportDayDto) {
    const actor = await this.requireActor(userId);
    const sheet = await this.requireIncoming(actor, id);
    if (sheet.status === 'APPROVED') {
      throw new BadRequestException('Bảng đã được duyệt.');
    }
    if (sheet.status !== 'PENDING') {
      throw new BadRequestException('Chỉ duyệt được bản đang chờ duyệt.');
    }

    const before = sheet.status;
    if (dto.decision === 'RETURN') {
      const reason = dto.reason?.trim() ?? '';
      if (!reason) throw new BadRequestException('Lý do trả lại là bắt buộc.');
      sheet.status = 'RETURNED';
      sheet.returnReason = reason;
    } else {
      sheet.status = 'APPROVED';
      sheet.returnReason = '';
    }
    sheet.decidedById = actor.id;
    sheet.decidedByName = actor.name;
    sheet.decidedAt = new Date();
    this.appendEdit(
      sheet,
      actor,
      'Trạng thái',
      before === 'PENDING' ? 'đã trình' : before,
      sheet.status === 'APPROVED'
        ? 'đã duyệt'
        : `trả lại: ${sheet.returnReason}`,
    );
    sheet.version += 1;
    await sheet.save();

    const templates = await this.templatesOfSheet(sheet);
    return {
      message: sheet.status === 'APPROVED' ? 'Đã duyệt.' : 'Đã trả lại.',
      data: await this.toClient(
        sheet,
        sheet.periodMonth,
        sheet.entries,
        templates,
      ),
    };
  }

  /**
   * Cấp trên chỉnh một dòng của bản đang chờ duyệt - ghi thẳng vào bản, có
   * nhật ký, như chỉnh số trên báo cáo tổng hợp. Chỉ khi PENDING: trả lại rồi
   * là đội đang cầm, hai bên cùng sửa là đè nhau.
   */
  async reviewEntry(
    userId: string,
    id: string,
    entryId: string,
    dto: UpdateTeamReportAdjustmentEntryDto,
  ) {
    const actor = await this.requireActor(userId);
    const sheet = await this.requireIncoming(actor, id);
    if (sheet.status !== 'PENDING') {
      throw new BadRequestException(
        sheet.status === 'RETURNED'
          ? 'Bản này đã trả lại cho đội - chờ đội sửa và trình lại.'
          : 'Chỉ chỉnh được bản đang chờ duyệt.',
      );
    }
    this.assertVersion(sheet, dto.version);
    const wanted = String(this.requireObjectId(entryId, 'Dòng'));
    const entry = sheet.entries.find((row) => String(row._id) === wanted);
    if (!entry) throw new NotFoundException('Không tìm thấy dòng.');

    const templates = await this.templatesOfSheet(sheet);
    const template = templates[entry.section];
    if (!template) {
      throw new BadRequestException('Phần này không còn mẫu bảng để đọc cột.');
    }
    const before = { ...(entry.fieldValues ?? {}) };
    entry.fieldValues = await this.applyValues(
      entry,
      template,
      dto.fieldValues ?? {},
    );

    let changed = 0;
    for (const column of this.inputColumns(template)) {
      const from = String(before[column.key] ?? '');
      const to = String(entry.fieldValues[column.key] ?? '');
      if (from === to) continue;
      changed += 1;
      this.appendEdit(
        sheet,
        actor,
        `${entry.itemCode} · ${column.title}`,
        from,
        to,
      );
    }
    if (!changed) {
      return {
        message: 'Không có ô nào thay đổi.',
        data: await this.toClient(
          sheet,
          sheet.periodMonth,
          sheet.entries,
          templates,
        ),
      };
    }
    sheet.version += 1;
    sheet.markModified('entries');
    await sheet.save();
    return {
      message: `Đã chỉnh ${changed} ô.`,
      data: await this.toClient(
        sheet,
        sheet.periodMonth,
        sheet.entries,
        templates,
      ),
    };
  }

  // ==================================================================== nội bộ

  /**
   * Đội chỉ sửa được khi bản CÒN NHÁP hoặc BỊ TRẢ LẠI. Đã trình là bản cấp trên
   * đang cầm - cùng luật với báo cáo tổng hợp.
   */
  private assertTeamEditable(sheet: TeamReportAdjustmentSheetDocument) {
    if (sheet.status === 'DRAFT' || sheet.status === 'RETURNED') return;
    throw new BadRequestException(
      sheet.status === 'APPROVED'
        ? 'Bảng tháng này đã được duyệt, không sửa được nữa.'
        : 'Bảng tháng này đang chờ cấp trên duyệt nên đội không sửa được. Chờ duyệt hoặc chờ trả lại.',
    );
  }

  private async requireIncoming(actor: Actor, id: string) {
    const sheet = await this.sheetModel.findById(
      this.requireObjectId(id, 'Bảng'),
    );
    if (!sheet) throw new NotFoundException('Không tìm thấy bảng.');
    if (
      String(sheet.recipientDepartmentId ?? '') !==
        String(actor.departmentId) ||
      sheet.status === 'DRAFT'
    ) {
      throw new ForbiddenException('Bảng này không trình tới đơn vị bạn.');
    }
    return sheet;
  }

  private async departmentNameOf(id: Types.ObjectId): Promise<string> {
    const found = await this.departmentModel.findById(id).select('name');
    return found?.name ?? '';
  }

  private async toClient(
    sheet: TeamReportAdjustmentSheetDocument | null,
    periodMonth: string,
    entries: TeamReportAdjustmentEntry[],
    templates: SectionTemplates,
  ) {
    return {
      sheet: {
        _id: sheet ? String(sheet._id) : null,
        periodMonth,
        entries,
        version: sheet?.version ?? 0,
        edits: sheet?.edits ?? [],
        updatedAt: sheet?.updatedAt ?? null,
        saved: Boolean(sheet),
        status: sheet?.status ?? 'DRAFT',
        recipientId: sheet?.recipientId ? String(sheet.recipientId) : null,
        recipientName: sheet?.recipientName ?? '',
        sentByName: sheet?.sentByName ?? '',
        sentAt: sheet?.sentAt ?? null,
        note: sheet?.note ?? '',
        decidedByName: sheet?.decidedByName ?? '',
        decidedAt: sheet?.decidedAt ?? null,
        returnReason: sheet?.returnReason ?? '',
      },
      templates,
      /** Khoá cột điểm của từng phần - client bày tổng dưới đúng cột. */
      scoreColumnKeys: Object.fromEntries(
        ADJUSTMENT_SECTIONS.map((section) => [
          section,
          this.scoreColumnOf(section, templates[section])?.key ?? null,
        ]),
      ) as Record<AdjustmentSection, string | null>,
      totals: this.totalsOf(entries, templates),
      departmentChoices: await this.departmentChoicesOf(templates),
    };
  }

  /**
   * Đơn vị bày ra ở các ô kiểu `department` ("Đối với tập thể"...).
   *
   * Lấy một lần cho cả bảng theo HỢP các cấp mà mọi cột kiểu này khai; client
   * lọc lại theo cấp của từng cột. Cột không khai cấp nào = mọi cấp. Không có
   * cột nào kiểu này thì không đụng tới bảng đơn vị.
   *
   * Gửi KÈM tổ tiên của các đơn vị được chọn (dù tổ tiên ngoài cấp) để client
   * dựng cây cha - con; dòng ngoài cấp chỉ làm tiêu đề nhánh, không tích được.
   */
  private async departmentChoicesOf(templates: SectionTemplates) {
    const columns = Object.values(templates)
      .flatMap((template) => template?.columns ?? [])
      .filter((column) => column.dataType === 'department');
    if (!columns.length) return [];
    const anyLevel = columns.some(
      (column) => !(column.departmentLevelIds ?? []).length,
    );
    const levelIds = [
      ...new Set(columns.flatMap((column) => column.departmentLevelIds ?? [])),
    ];
    const rows = await this.departmentModel
      .find({
        isActive: true,
        ...(anyLevel
          ? {}
          : { levelId: { $in: levelIds.map((id) => new Types.ObjectId(id)) } }),
      })
      .select('name code levelId parentId sortOrder ancestors')
      .sort({ sortOrder: 1, name: 1 });
    const have = new Set(rows.map((row) => String(row._id)));
    const missing = [
      ...new Set(
        rows.flatMap((row) =>
          (row.ancestors ?? [])
            .map((id) => String(id))
            .filter((id) => !have.has(id)),
        ),
      ),
    ];
    const ancestors = missing.length
      ? await this.departmentModel
          .find({ _id: { $in: missing.map((id) => new Types.ObjectId(id)) } })
          .select('name code levelId parentId sortOrder')
      : [];
    const all = [...rows, ...ancestors];
    const byId = new Map(all.map((row) => [String(row._id), row]));
    return all.map((row) => ({
      _id: String(row._id),
      name: row.name,
      code: row.code ?? '',
      levelId: row.levelId ? String(row.levelId) : null,
      parentId: row.parentId ? String(row.parentId) : null,
      sortOrder: row.sortOrder ?? 0,
      parentName: row.parentId
        ? (byId.get(String(row.parentId))?.name ?? '')
        : '',
    }));
  }

  /**
   * Ghi giá trị vào đúng các cột của mẫu - bỏ khoá lạ, bỏ cột hệ thống.
   *
   * Kiểm kiểu theo cột: số phải là số, ngày phải đúng dạng, ô tích lưu "1".
   * Chuỗi rỗng là xoá ô. Cột điểm có khai dải theo "Tối đa" thì từng ô không
   * vượt trần của mục. Trần tính TỪNG DÒNG, không cộng dồn các dòng cùng mục:
   * mẫu giấy nói "mỗi kết quả không quá tối đa", hai kết quả 1,5 điểm dưới mục
   * tối đa 2 là hai việc riêng, đều hợp lệ.
   */
  private async applyValues(
    entry: TeamReportAdjustmentEntry,
    template: SectionTemplate,
    input: Record<string, string | number>,
  ): Promise<Record<string, string | number>> {
    const next = { ...(entry.fieldValues ?? {}) };
    const byKey = new Map(
      this.inputColumns(template).map((column) => [column.key, column]),
    );
    const maxKeys = new Set(
      template.columns
        .filter((column) => column.semanticKey === 'adjustment_max_score')
        .map((column) => column.key),
    );

    for (const [key, raw] of Object.entries(input)) {
      const column = byKey.get(key);
      if (!column) continue;
      const value = String(raw ?? '').trim();
      if (!value) {
        delete next[key];
        continue;
      }
      if (column.dataType === 'number') {
        const parsed = Number(value.replace(',', '.'));
        if (!Number.isFinite(parsed)) {
          throw new BadRequestException(`Cột "${column.title}" phải là số.`);
        }
        if (parsed < 0) {
          throw new BadRequestException(
            `Cột "${column.title}" ghi số dương; dấu cộng / trừ suy từ phần.`,
          );
        }
        if (
          column.rangeFromColumnKey &&
          maxKeys.has(column.rangeFromColumnKey) &&
          entry.itemMaxScore !== null &&
          parsed > entry.itemMaxScore
        ) {
          throw new BadRequestException(
            `"${entry.itemName}" · ${column.title}: không vượt tối đa ${entry.itemMaxScore} của mục này.`,
          );
        }
        next[key] = parsed;
        continue;
      }
      if (column.dataType === 'boolean') {
        next[key] = '1';
        continue;
      }
      if (column.dataType === 'department') {
        next[key] = await this.normalizeDepartmentIds(column, value);
        continue;
      }
      if (column.dataType === 'date' && !isYmd(value)) {
        throw new BadRequestException(
          `Cột "${column.title}" phải có dạng YYYY-MM-DD.`,
        );
      }
      next[key] = value;
    }
    return next;
  }

  /**
   * Ô chọn đơn vị lưu chuỗi id cách nhau bằng dấu phẩy. Kiểm từng id: phải là
   * đơn vị đang hoạt động và thuộc đúng cấp cột cho phép - client lọc rồi,
   * nhưng gửi thẳng API thì vẫn phải chặn.
   */
  private async normalizeDepartmentIds(
    column: FormTemplateColumn,
    value: string,
  ): Promise<string> {
    const ids = [
      ...new Set(
        value
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
      ),
    ];
    for (const id of ids) {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException(
          `Cột "${column.title}" có id đơn vị không hợp lệ.`,
        );
      }
    }
    const allowedLevels = column.departmentLevelIds ?? [];
    const rows = await this.departmentModel
      .find({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        isActive: true,
      })
      .select('levelId');
    const found = new Map(rows.map((row) => [String(row._id), row]));
    for (const id of ids) {
      const row = found.get(id);
      if (!row) {
        throw new BadRequestException(
          `Cột "${column.title}" có đơn vị không tồn tại hoặc đã ngừng hoạt động.`,
        );
      }
      if (
        allowedLevels.length &&
        !allowedLevels.includes(String(row.levelId ?? ''))
      ) {
        throw new BadRequestException(
          `Cột "${column.title}" chỉ chọn được đơn vị thuộc cấp đã cấu hình.`,
        );
      }
    }
    return ids.join(',');
  }

  /** Cột đội gõ được: bỏ nửa trái, bỏ cột tự tính, chỉ cột đang hiện. */
  private inputColumns(template: SectionTemplate) {
    return template.columns.filter(
      (column) =>
        column.visible &&
        !column.autoValue &&
        !LEFT_SEMANTICS.has(column.semanticKey),
    );
  }

  /**
   * Cột điểm của một phần.
   *
   * Điểm cộng: cột số khai dải theo "Tối đa" (`adjustment_max_score`) - đúng
   * cách mẫu nói "điểm đề xuất không vượt tối đa". Điểm trừ không có trần theo
   * mục, lấy cột số đầu tiên đội gõ được. Xếp loại không có điểm.
   */
  private scoreColumnOf(
    section: AdjustmentSection,
    template: SectionTemplate | null,
  ): FormTemplateColumn | null {
    if (!template || section === 'RANKING') return null;
    const inputs = this.inputColumns(template).filter(
      (column) => column.dataType === 'number',
    );
    if (section === 'BONUS') {
      const maxKeys = new Set(
        template.columns
          .filter((column) => column.semanticKey === 'adjustment_max_score')
          .map((column) => column.key),
      );
      return (
        inputs.find(
          (column) =>
            column.rangeFromColumnKey && maxKeys.has(column.rangeFromColumnKey),
        ) ??
        inputs[0] ??
        null
      );
    }
    return inputs[0] ?? null;
  }

  /**
   * Tổng điểm cộng và tổng điểm trừ đề xuất - cộng riêng, không bù trừ thành
   * một số: mẫu giấy là hai bảng, người duyệt cần thấy cả hai vế.
   */
  private totalsOf(
    entries: TeamReportAdjustmentEntry[],
    templates: SectionTemplates,
  ) {
    const sum = (section: AdjustmentSection) => {
      const key = this.scoreColumnOf(section, templates[section])?.key;
      if (!key) return 0;
      return entries
        .filter((entry) => entry.section === section)
        .reduce((total, entry) => {
          const raw = entry.fieldValues?.[key];
          const value = Number(String(raw ?? '').replace(',', '.'));
          return (
            total + (raw !== undefined && Number.isFinite(value) ? value : 0)
          );
        }, 0);
    };
    const bonus = sum('BONUS');
    const penalty = sum('PENALTY');
    return { bonus, penalty, net: bonus - penalty };
  }

  /** Mẫu đang hoạt động của cả ba phần. */
  private async currentTemplates(): Promise<SectionTemplates> {
    const found = await this.formTemplateModel
      .find({
        forAdjustment: { $in: [...ADJUSTMENT_SECTIONS] },
        isActive: true,
      })
      .select('code name version columns headerGroups forAdjustment');
    const out = {} as SectionTemplates;
    for (const section of ADJUSTMENT_SECTIONS) {
      const template = found.find((row) => row.forAdjustment === section);
      out[section] = template
        ? {
            _id: String(template._id),
            code: template.code,
            name: template.name,
            version: template.version,
            columns: template.columns,
            headerGroups: template.headerGroups,
          }
        : null;
    }
    return out;
  }

  /** Mẫu đã đóng dấu trên bảng; phần chưa đóng dấu thì lấy mẫu hiện hành. */
  private async templatesOfSheet(
    sheet: TeamReportAdjustmentSheetDocument,
  ): Promise<SectionTemplates> {
    const current = await this.currentTemplates();
    const out = {} as SectionTemplates;
    for (const section of ADJUSTMENT_SECTIONS) {
      const stamp = sheet.templates?.[section];
      if (!stamp?.formTemplateId) {
        out[section] = current[section];
        continue;
      }
      const resolved = await this.formTemplatesService.resolveVersion(
        stamp.formTemplateId,
        stamp.formTemplateVersion ?? 1,
      );
      out[section] = resolved
        ? { _id: String(stamp.formTemplateId), ...resolved }
        : current[section];
    }
    return out;
  }

  private assertVersion(
    sheet: TeamReportAdjustmentSheetDocument,
    version: number,
  ) {
    if (sheet.version !== version) {
      throw new ConflictException(
        'Bảng vừa được người khác sửa. Tải lại rồi nhập tiếp.',
      );
    }
  }

  private async requireEntry(actor: Actor, month: string, entryId: string) {
    const periodMonth = this.requireMonth(month);
    const sheet = await this.sheetModel.findOne({
      departmentId: actor.departmentId,
      periodMonth,
    });
    if (!sheet) throw new NotFoundException('Tháng này chưa có bảng.');
    const wanted = String(this.requireObjectId(entryId, 'Dòng'));
    const entry = sheet.entries.find((row) => String(row._id) === wanted);
    if (!entry) throw new NotFoundException('Không tìm thấy dòng.');
    return { sheet, entry };
  }

  private appendEdit(
    sheet: TeamReportAdjustmentSheetDocument,
    actor: Actor,
    field: string,
    from: string,
    to: string,
  ) {
    sheet.edits = [
      ...(sheet.edits ?? []),
      {
        byId: actor.id,
        byName: actor.name,
        byDepartmentId: actor.departmentId,
        field,
        from,
        to,
        reason: '',
        at: new Date(),
      },
    ];
    sheet.markModified('edits');
  }

  private requireMonth(value?: string): string {
    const raw = (value ?? '').trim();
    if (!raw) return serverDateYmd().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
      throw new BadRequestException('Tháng phải có dạng YYYY-MM.');
    }
    return raw;
  }

  private requireObjectId(value: string, label: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`${label} không hợp lệ.`);
    }
    return new Types.ObjectId(value);
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
      throw new BadRequestException(
        'Tài khoản chưa gắn đơn vị nên chưa nhập được bảng này.',
      );
    }
    return {
      id: user._id,
      name: user.fullName?.trim() || user.username,
      departmentId: new Types.ObjectId(String(user.departmentId)),
    };
  }
}
