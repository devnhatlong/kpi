import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User, UserDocument } from '@/modules/users/schemas/user.schema';
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
  TeamReportAdjustmentQueryDto,
  UpdateTeamReportAdjustmentEntryDto,
} from './dto/team-report.dto';
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
    private readonly formTemplatesService: FormTemplatesService,
    private readonly access: TeamReportAdjustmentAccessService,
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
        ...this.toClient(stored, periodMonth, entries, templates),
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
    entry.fieldValues = this.applyValues(
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
      data: this.toClient(sheet, periodMonth, sheet.entries, templates),
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

    const templates = await this.templatesOfSheet(sheet);
    const template = templates[entry.section];
    if (!template) {
      throw new BadRequestException('Phần này không còn mẫu bảng để đọc cột.');
    }

    const before = { ...(entry.fieldValues ?? {}) };
    entry.fieldValues = this.applyValues(
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
        data: this.toClient(sheet, sheet.periodMonth, sheet.entries, templates),
      };
    }

    sheet.version += 1;
    sheet.markModified('entries');
    await sheet.save();
    return {
      message: `Đã lưu ${changed} ô.`,
      data: this.toClient(sheet, sheet.periodMonth, sheet.entries, templates),
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
      data: this.toClient(sheet, sheet.periodMonth, sheet.entries, templates),
    };
  }

  // ==================================================================== nội bộ

  private toClient(
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
    };
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
  private applyValues(
    entry: TeamReportAdjustmentEntry,
    template: SectionTemplate,
    input: Record<string, string | number>,
  ): Record<string, string | number> {
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
      if (column.dataType === 'date' && !isYmd(value)) {
        throw new BadRequestException(
          `Cột "${column.title}" phải có dạng YYYY-MM-DD.`,
        );
      }
      next[key] = value;
    }
    return next;
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
