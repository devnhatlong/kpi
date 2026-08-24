import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import {
  CreateFormTemplateDto,
  FormHeaderGroupDto,
  FormTemplateColumnDto,
  FormTemplateFooterDto,
} from './dto/create-form-template.dto';
import { UpdateFormTemplateDto } from './dto/update-form-template.dto';
import {
  FormHeaderGroup,
  FormTemplate,
  FormTemplateColumn,
  FormTemplateDocument,
  FormTemplateFooter,
  formulaValueSource,
  type FormFooterMode,
  type FormColumnSemantic,
} from './schemas/form-template.schema';
import {
  FormTemplateVersion,
  FormTemplateVersionDocument,
} from './schemas/form-template-version.schema';
import { Axis, AxisDocument } from './schemas/axis.schema';

const AXIS_POPULATE = { path: 'axisIds', select: 'code name' };

@Injectable()
export class FormTemplatesService {
  constructor(
    @InjectModel(FormTemplate.name)
    private readonly formTemplateModel: Model<FormTemplateDocument>,
    @InjectModel(FormTemplateVersion.name)
    private readonly versionModel: Model<FormTemplateVersionDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
  ) {}

  /**
   * Bộ cột đúng như lúc nhiệm vụ được gửi.
   * Version còn là bản hiện hành thì lấy thẳng mẫu, cũ hơn thì lấy ảnh chụp.
   */
  async resolveVersion(templateId: Types.ObjectId | string, version: number) {
    const template = await this.formTemplateModel.findById(templateId);
    if (!template) return null;
    if (template.version === version) {
      return {
        code: template.code,
        name: template.name,
        version: template.version,
        columns: template.columns,
        headerGroups: template.headerGroups,
        footer: template.footer,
      };
    }

    const snapshot = await this.versionModel.findOne({
      templateId: new Types.ObjectId(String(templateId)),
      version,
    });
    if (!snapshot) return null;
    return {
      code: snapshot.code,
      name: snapshot.name,
      version: snapshot.version,
      columns: snapshot.columns,
      headerGroups: snapshot.headerGroups,
      footer: snapshot.footer,
    };
  }

  async create(dto: CreateFormTemplateDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    await this.ensureUniqueCode(code);

    const headerGroups = this.normalizeHeaderGroups(dto.headerGroups ?? []);
    const columns = this.normalizeColumns(dto.columns ?? [], headerGroups);
    const footer = this.normalizeFooter(dto.footer, columns);
    const axisIds = await this.resolveAxisIds(dto.axisIds ?? [], null);
    const forCriteria = dto.forCriteria ?? false;
    if (forCriteria) await this.ensureSingleCriteriaTemplate(null);

    const data = await this.formTemplateModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      columns,
      headerGroups,
      footer,
      axisIds,
      forCriteria,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    await data.populate(AXIS_POPULATE);
    return { message: 'Tạo mẫu bảng thành công.', data };
  }

  async findAll(query: PaginationQueryDto = new PaginationQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }, { description: regex }];
    }

    const sort = { sortOrder: 1 as const, name: 1 as const };

    if (query.all) {
      const data = await this.formTemplateModel
        .find(filter)
        .sort(sort)
        .populate(AXIS_POPULATE);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.formTemplateModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate(AXIS_POPULATE),
      this.formTemplateModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const item = await this.requireById(id);
    await item.populate(AXIS_POPULATE);
    return item;
  }

  /** Mẫu đang áp dụng cho bảng tiêu chí chung - chỉ có đúng một. */
  async findForCriteria() {
    const data = await this.formTemplateModel
      .findOne({ forCriteria: true, isActive: true })
      .populate(AXIS_POPULATE);
    // Chưa gán mẫu nào -> client hiện bảng tiêu chí với bộ cột mặc định.
    return { data };
  }

  /** Mẫu đang áp dụng cho một trục - dùng khi render form nhập nhiệm vụ. */
  async findByAxis(axisId: string) {
    if (!Types.ObjectId.isValid(axisId)) {
      throw new NotFoundException('Không tìm thấy trục.');
    }
    const data = await this.formTemplateModel
      .findOne({ axisIds: new Types.ObjectId(axisId), isActive: true })
      .populate(AXIS_POPULATE);
    // Trục chưa gán mẫu -> client tự dùng bộ cột mặc định.
    return { data };
  }

  async update(id: string, dto: UpdateFormTemplateDto) {
    const item = await this.requireById(id);

    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã mẫu sau khi đã tạo - tránh lệch map dữ liệu.',
      );
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.description !== undefined) item.description = dto.description.trim();
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    if (
      dto.headerGroups !== undefined ||
      dto.columns !== undefined ||
      dto.footer !== undefined
    ) {
      const headerGroups =
        dto.headerGroups !== undefined
          ? this.normalizeHeaderGroups(dto.headerGroups)
          : item.headerGroups;
      const columns =
        dto.columns !== undefined
          ? this.normalizeColumns(dto.columns, headerGroups)
          : this.normalizeColumns(
              item.columns as unknown as FormTemplateColumnDto[],
              headerGroups,
            );
      // Soi lại công thức theo bộ cột mới kể cả khi client không gửi footer:
      // xoá mất cột mẫu số mà công thức vẫn trỏ tới là bảng tính ra số rác.
      const footer = this.normalizeFooter(
        dto.footer ?? (item.footer as unknown as FormTemplateFooterDto),
        columns,
      );

      // Cột/nhóm/công thức đổi thật thì đóng băng bản cũ rồi mới tăng version,
      // để báo cáo đã gửi vẫn dựng đúng bảng của thời điểm gửi.
      if (this.layoutChanged(item, columns, headerGroups, footer)) {
        await this.archiveCurrentVersion(item);
        item.version = (item.version ?? 1) + 1;
      }

      item.headerGroups = headerGroups;
      item.columns = columns;
      item.footer = footer;
    }

    if (dto.axisIds !== undefined) {
      item.axisIds = await this.resolveAxisIds(dto.axisIds, item.id as string);
    }
    if (dto.forCriteria !== undefined) {
      if (dto.forCriteria) {
        await this.ensureSingleCriteriaTemplate(item.id as string);
      }
      item.forCriteria = dto.forCriteria;
    }

    await item.save();
    await item.populate(AXIS_POPULATE);
    return { message: 'Cập nhật mẫu bảng thành công.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    await item.deleteOne();
    return { message: 'Xoá mẫu bảng thành công.' };
  }

  /** So sánh bố cục, bỏ qua thứ tự key trong object để không tăng version oan. */
  private layoutChanged(
    item: FormTemplateDocument,
    columns: FormTemplateColumn[],
    headerGroups: FormHeaderGroup[],
    footer: FormTemplateFooter,
  ): boolean {
    const shape = (
      cols: FormTemplateColumn[],
      groups: FormHeaderGroup[],
      foot: FormTemplateFooter | undefined,
    ) =>
      JSON.stringify({
        columns: cols.map((column) => [
          column.id,
          column.key,
          column.title,
          column.headerPath,
          column.width,
          column.visible,
          column.dataType,
          column.semanticKey,
          column.required,
          column.rangeFromColumnKey,
          // Đổi công thức tự tính là đổi con số trong bảng - phải lên phiên bản
          // mới, không thì báo cáo đã gửi bị tính lại theo luật khác.
          column.autoValue
            ? [
                column.autoValue.kind,
                column.autoValue.percentColumnKey,
                column.autoValue.baseColumnKey,
              ]
            : null,
        ]),
        headerGroups: groups,
        footer: [
          foot?.enabled ?? false,
          foot?.baseColumnKey ?? null,
          foot?.ratioColumnKeys ?? [],
        ],
      });

    return (
      shape(item.columns, item.headerGroups, item.footer) !==
      shape(columns, headerGroups, footer)
    );
  }

  private async archiveCurrentVersion(item: FormTemplateDocument) {
    await this.versionModel.updateOne(
      { templateId: item._id, version: item.version ?? 1 },
      {
        $setOnInsert: {
          templateId: item._id,
          version: item.version ?? 1,
          code: item.code,
          name: item.name,
          columns: item.columns,
          headerGroups: item.headerGroups,
          footer: item.footer,
        },
      },
      { upsert: true },
    );
  }

  private async requireById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy mẫu bảng.');
    }
    const item = await this.formTemplateModel.findById(id);
    if (!item) throw new NotFoundException('Không tìm thấy mẫu bảng.');
    return item;
  }

  private async ensureUniqueCode(code: string) {
    if (await this.formTemplateModel.exists({ code })) {
      throw new BadRequestException('Mã mẫu bảng đã tồn tại.');
    }
  }

  /**
   * Bảng tiêu chí chỉ có MỘT, nên cũng chỉ được đúng một mẫu đang hoạt động
   * nhận vai đó - hai mẫu cùng nhận thì không biết in bảng theo mẫu nào.
   */
  private async ensureSingleCriteriaTemplate(excludeId: string | null) {
    const filter: Record<string, unknown> = {
      forCriteria: true,
      isActive: true,
    };
    if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) };

    const conflict = await this.formTemplateModel.findOne(filter);
    if (conflict) {
      throw new BadRequestException(
        `Bảng tiêu chí đang dùng mẫu "${conflict.name}". Bỏ gán ở mẫu đó trước.`,
      );
    }
  }

  /**
   * Một trục chỉ được gán đúng một mẫu đang hoạt động,
   * nếu không thì lúc chọn trục sẽ không biết lấy header nào.
   */
  private async resolveAxisIds(axisIds: string[], excludeId: string | null) {
    const unique = [...new Set(axisIds.map((value) => value.trim()))].filter(
      Boolean,
    );
    if (!unique.length) return [];

    const objectIds = unique.map((value) => new Types.ObjectId(value));
    const found = await this.axisModel.countDocuments({
      _id: { $in: objectIds },
    });
    if (found !== objectIds.length) {
      throw new BadRequestException('Có trục không tồn tại.');
    }

    const conflictFilter: Record<string, unknown> = {
      axisIds: { $in: objectIds },
      isActive: true,
    };
    if (excludeId) conflictFilter._id = { $ne: new Types.ObjectId(excludeId) };

    const conflict = await this.formTemplateModel
      .findOne(conflictFilter)
      .populate(AXIS_POPULATE);
    if (conflict) {
      const taken = (conflict.axisIds as unknown as Array<{ _id: Types.ObjectId; name: string }>)
        .filter((axis) => unique.includes(String(axis._id)))
        .map((axis) => axis.name)
        .join(', ');
      throw new BadRequestException(
        `Trục ${taken} đã được gán cho mẫu "${conflict.name}". Bỏ gán ở mẫu đó trước.`,
      );
    }

    return objectIds;
  }

  private normalizeHeaderGroups(
    groups: FormHeaderGroupDto[],
  ): FormHeaderGroup[] {
    const seen = new Set<string>();

    const walk = (nodes: FormHeaderGroupDto[]): FormHeaderGroup[] =>
      nodes.map((node) => {
        const id = node.id.trim();
        if (!id) throw new BadRequestException('Nhóm header thiếu id.');
        if (seen.has(id)) {
          throw new BadRequestException(`Nhóm header bị trùng id: ${id}.`);
        }
        seen.add(id);
        const name = node.name.trim();
        if (!name) {
          throw new BadRequestException('Tên nhóm header không được để trống.');
        }
        return { id, name, children: walk(node.children ?? []) };
      });

    return walk(groups);
  }

  private normalizeColumns(
    columns: FormTemplateColumnDto[],
    headerGroups: FormHeaderGroup[],
  ): FormTemplateColumn[] {
    if (!columns.length) {
      throw new BadRequestException('Mẫu bảng phải có ít nhất một cột.');
    }

    const ids = new Set<string>();
    const keys = new Set<string>();

    const normalized = columns.map((column) => {
      const id = column.id.trim();
      const key = column.key.trim();
      const title = column.title.trim();
      if (!id) throw new BadRequestException('Cột thiếu id.');
      if (!key) throw new BadRequestException('Cột thiếu khoá.');
      if (!title) {
        throw new BadRequestException('Tiêu đề cột không được để trống.');
      }
      if (ids.has(id)) throw new BadRequestException(`Cột trùng id: ${id}.`);
      if (keys.has(key)) {
        throw new BadRequestException(`Cột trùng khoá: ${key}.`);
      }
      ids.add(id);
      keys.add(key);

      // Một ánh xạ dùng được ở nhiều cột - chỉ khoá cột là phải duy nhất.
      const semanticKey: FormColumnSemantic = column.semanticKey ?? 'custom';

      const headerPath = (column.headerPath ?? []).map((part) => part.trim());
      this.ensureHeaderPathExists(headerPath, headerGroups, title);

      return {
        id,
        key,
        title,
        headerPath,
        width: column.width ?? 160,
        visible: column.visible ?? true,
        dataType: column.dataType ?? 'text',
        semanticKey,
        required: column.required ?? false,
        rangeFromColumnKey: column.rangeFromColumnKey?.trim() || null,
        autoValue: column.autoValue
          ? {
              kind: column.autoValue.kind,
              percentColumnKey: column.autoValue.percentColumnKey.trim(),
              baseColumnKey: column.autoValue.baseColumnKey.trim(),
            }
          : null,
      };
    });

    // Kiểm ràng buộc dải điểm sau khi có đủ cột, vì cột được trỏ tới có thể
    // đứng sau cột trỏ đi.
    const scoreGroupKeys = new Set(
      normalized
        .filter((column) => column.semanticKey === 'score_group')
        .map((column) => column.key),
    );
    for (const column of normalized) {
      if (!column.rangeFromColumnKey) continue;
      if (column.dataType !== 'number') {
        throw new BadRequestException(
          `Cột "${column.title}" không phải kiểu số nên không giới hạn theo nhóm điểm được.`,
        );
      }
      if (!scoreGroupKeys.has(column.rangeFromColumnKey)) {
        throw new BadRequestException(
          `Cột "${column.title}" giới hạn theo một cột Nhóm điểm không tồn tại trong mẫu.`,
        );
      }
    }

    // Cột tự tính trỏ tới cột khác bằng khoá, kiểm cùng kiểu với dải điểm ở trên.
    const qualityKeys = new Set(
      normalized
        .filter((column) => column.semanticKey === 'quality_level')
        .map((column) => column.key),
    );
    const numberKeys = new Set(
      normalized
        .filter((column) => column.dataType === 'number')
        .map((column) => column.key),
    );
    const autoKeys = new Set(
      normalized
        .filter((column) => column.autoValue)
        .map((column) => column.key),
    );
    for (const column of normalized) {
      const auto = column.autoValue;
      if (!auto) continue;

      if (column.dataType !== 'number') {
        throw new BadRequestException(
          `Cột "${column.title}" không phải kiểu số nên không tự tính điểm được.`,
        );
      }
      if (!qualityKeys.has(auto.percentColumnKey)) {
        throw new BadRequestException(
          `Cột "${column.title}" lấy phần trăm từ một cột Chất lượng thực hiện không tồn tại trong mẫu.`,
        );
      }
      if (!numberKeys.has(auto.baseColumnKey)) {
        throw new BadRequestException(
          `Cột "${column.title}" lấy điểm gốc từ một cột số không tồn tại trong mẫu.`,
        );
      }
      if (auto.baseColumnKey === column.key) {
        throw new BadRequestException(
          `Cột "${column.title}" không thể lấy điểm gốc từ chính nó.`,
        );
      }
      // Chuỗi tự tính nối tiếp nhau thì thứ tự tính phụ thuộc thứ tự cột - cấm
      // luôn cho khỏi phải định nghĩa thứ tự đó.
      if (autoKeys.has(auto.baseColumnKey)) {
        throw new BadRequestException(
          `Cột "${column.title}" lấy điểm gốc từ một cột cũng tự tính - không cho phép tính nối tầng.`,
        );
      }
    }

    return normalized;
  }

  /**
   * Công thức chỉ trỏ được vào cột quy ra số được (xem formulaValueSource) và
   * đang có trong mẫu.
   *
   * Khi tắt thì lược bớt khoá đã trỏ vào cột không còn tồn tại chứ không báo
   * lỗi - admin phải xoá được cột thừa mà không bị công thức đang tắt chặn lại.
   */
  private normalizeFooter(
    footer: FormTemplateFooterDto | undefined,
    columns: FormTemplateColumn[],
  ): FormTemplateFooter {
    const numeric = new Map(
      columns
        .filter((column) => formulaValueSource(column) !== null)
        .map((column) => [column.key, column.title]),
    );
    const titleOf = (key: string) =>
      columns.find((column) => column.key === key)?.title ?? key;

    const enabled = footer?.enabled ?? false;
    const mode: FormFooterMode = footer?.mode === 'sum' ? 'sum' : 'ratio';
    const baseColumnKey = footer?.baseColumnKey?.trim() || null;
    const ratioColumnKeys = [
      ...new Set(
        (footer?.ratioColumnKeys ?? [])
          .map((key) => key.trim())
          .filter(Boolean),
      ),
    ];

    if (!enabled) {
      return {
        enabled: false,
        mode,
        baseColumnKey:
          baseColumnKey && numeric.has(baseColumnKey) ? baseColumnKey : null,
        ratioColumnKeys: ratioColumnKeys.filter((key) => numeric.has(key)),
      };
    }

    /*
      Cộng dồn thì không có mẫu số: điểm của trục là tổng điểm các mục đã chấm,
      trần là điểm tối đa của trục. Bắt chọn "điểm chuẩn" ở đây chỉ tổ đẻ ra một
      con số vô nghĩa rồi đem chia.
    */
    if (mode === 'sum') {
      if (!ratioColumnKeys.length) {
        throw new BadRequestException(
          'Công thức cộng dồn cần ít nhất một cột điểm để cộng.',
        );
      }
      for (const key of ratioColumnKeys) {
        if (!numeric.has(key)) {
          throw new BadRequestException(
            `Cột điểm "${titleOf(key)}" không còn trong mẫu hoặc không quy ra số được.`,
          );
        }
      }
      return { enabled: true, mode, baseColumnKey: null, ratioColumnKeys };
    }

    if (!baseColumnKey) {
      throw new BadRequestException(
        'Công thức điểm cần chọn cột mẫu số (điểm chuẩn).',
      );
    }
    if (!numeric.has(baseColumnKey)) {
      throw new BadRequestException(
        `Cột mẫu số "${titleOf(baseColumnKey)}" không còn trong mẫu hoặc không quy ra số được.`,
      );
    }
    if (!ratioColumnKeys.length) {
      throw new BadRequestException(
        'Công thức điểm cần ít nhất một cột tử số.',
      );
    }
    for (const key of ratioColumnKeys) {
      if (key === baseColumnKey) {
        throw new BadRequestException(
          'Cột mẫu số không được dùng lại làm cột tử số.',
        );
      }
      if (!numeric.has(key)) {
        throw new BadRequestException(
          `Cột tử số "${titleOf(key)}" không còn trong mẫu hoặc không quy ra số được.`,
        );
      }
    }

    return { enabled: true, mode, baseColumnKey, ratioColumnKeys };
  }

  private ensureHeaderPathExists(
    headerPath: string[],
    headerGroups: FormHeaderGroup[],
    columnTitle: string,
  ) {
    let current = headerGroups;
    for (const id of headerPath) {
      const node = current.find((group) => group.id === id);
      if (!node) {
        throw new BadRequestException(
          `Cột "${columnTitle}" gắn vào nhóm header không tồn tại.`,
        );
      }
      current = node.children;
    }
  }

  private async nextCode(): Promise<string> {
    const prefix = 'MAU';
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.formTemplateModel
      .find({ code: { $regex: `^${prefix}-\\d+$`, $options: 'i' } })
      .select('code')
      .lean();
    let max = 0;
    for (const doc of docs) {
      const match = pattern.exec(doc.code);
      if (!match) continue;
      const n = Number(match[1]);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }
}
