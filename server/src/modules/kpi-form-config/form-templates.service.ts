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
} from './dto/create-form-template.dto';
import { UpdateFormTemplateDto } from './dto/update-form-template.dto';
import {
  FormHeaderGroup,
  FormTemplate,
  FormTemplateColumn,
  FormTemplateDocument,
  SINGLETON_SEMANTICS,
  type FormColumnSemantic,
} from './schemas/form-template.schema';
import { Axis, AxisDocument } from './schemas/axis.schema';

const AXIS_POPULATE = { path: 'axisIds', select: 'code name' };

@Injectable()
export class FormTemplatesService {
  constructor(
    @InjectModel(FormTemplate.name)
    private readonly formTemplateModel: Model<FormTemplateDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
  ) {}

  async create(dto: CreateFormTemplateDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    await this.ensureUniqueCode(code);

    const headerGroups = this.normalizeHeaderGroups(dto.headerGroups ?? []);
    const columns = this.normalizeColumns(dto.columns ?? [], headerGroups);
    const axisIds = await this.resolveAxisIds(dto.axisIds ?? [], null);

    const data = await this.formTemplateModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      columns,
      headerGroups,
      axisIds,
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

    if (dto.headerGroups !== undefined || dto.columns !== undefined) {
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
      item.headerGroups = headerGroups;
      item.columns = columns;
    }

    if (dto.axisIds !== undefined) {
      item.axisIds = await this.resolveAxisIds(dto.axisIds, item.id as string);
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
    const semantics = new Map<FormColumnSemantic, string>();

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

      const semanticKey: FormColumnSemantic = column.semanticKey ?? 'custom';
      if (SINGLETON_SEMANTICS.includes(semanticKey)) {
        const owner = semantics.get(semanticKey);
        if (owner) {
          throw new BadRequestException(
            `Ý nghĩa cột "${semanticKey}" đã dùng ở cột "${owner}" - mỗi ý nghĩa chỉ được gán cho một cột.`,
          );
        }
        semantics.set(semanticKey, title);
      }

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
      };
    });

    if (!semantics.has('task_title')) {
      throw new BadRequestException(
        'Mẫu bảng phải có một cột mang ý nghĩa "Nhiệm vụ" (task_title).',
      );
    }

    return normalized;
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
