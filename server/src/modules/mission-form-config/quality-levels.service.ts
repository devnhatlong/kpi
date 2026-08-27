import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import {
  CreateQualityLevelDto,
  UpdateQualityLevelDto,
} from './dto/quality-level.dto';
import {
  QualityLevel,
  QualityLevelDocument,
} from './schemas/quality-level.schema';

/** Năm mức chuẩn, tạo sẵn khi khởi động. */
const SYSTEM_QUALITY_LEVELS: Array<{
  code: string;
  name: string;
  percent: number;
  sortOrder: number;
}> = [
  { code: 'CL-100', name: '100%', percent: 100, sortOrder: 1 },
  { code: 'CL-075', name: '75%', percent: 75, sortOrder: 2 },
  { code: 'CL-050', name: '50%', percent: 50, sortOrder: 3 },
  { code: 'CL-025', name: '25%', percent: 25, sortOrder: 4 },
  { code: 'CL-000', name: '0%', percent: 0, sortOrder: 5 },
];

@Injectable()
export class QualityLevelsService implements OnModuleInit {
  constructor(
    @InjectModel(QualityLevel.name)
    private readonly qualityLevelModel: Model<QualityLevelDocument>,
  ) {}

  async onModuleInit() {
    await this.seedSystemLevels();
  }

  /**
   * Tạo sẵn năm mức chuẩn. Dùng $setOnInsert nên chạy lại không đè lên phần
   * super admin đã chỉnh tay.
   */
  async seedSystemLevels() {
    for (const item of SYSTEM_QUALITY_LEVELS) {
      await this.qualityLevelModel.updateOne(
        { code: item.code },
        {
          $setOnInsert: {
            code: item.code,
            name: item.name,
            description: `Chất lượng thực hiện đạt ${item.percent}%`,
            percent: item.percent,
            sortOrder: item.sortOrder,
            isActive: true,
            isSystem: true,
          },
        },
        { upsert: true },
      );
    }
  }

  async create(dto: CreateQualityLevelDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    if (await this.qualityLevelModel.exists({ code })) {
      throw new BadRequestException('Mã mức chất lượng đã tồn tại.');
    }
    await this.ensureUniquePercent(dto.percent, null);

    const data = await this.qualityLevelModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      percent: dto.percent,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      isSystem: false,
    });

    return { message: 'Tạo mức chất lượng thành công.', data };
  }

  async findAll(query: PaginationQueryDto = new PaginationQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }, { description: regex }];
    }

    const sort = { sortOrder: 1 as const, percent: -1 as const };

    if (query.all) {
      const data = await this.qualityLevelModel.find(filter).sort(sort);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const [data, total] = await Promise.all([
      this.qualityLevelModel
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      this.qualityLevelModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.requireById(id);
  }

  async update(id: string, dto: UpdateQualityLevelDto) {
    const item = await this.requireById(id);

    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      const exists = await this.qualityLevelModel.exists({
        code,
        _id: { $ne: item._id },
      });
      if (exists) {
        throw new BadRequestException('Mã mức chất lượng đã tồn tại.');
      }
      item.code = code;
    }
    if (dto.percent !== undefined) {
      await this.ensureUniquePercent(dto.percent, String(item._id));
      item.percent = dto.percent;
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.description !== undefined) {
      item.description = dto.description.trim();
    }
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    await item.save();
    return { message: 'Cập nhật mức chất lượng thành công.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    if (item.isSystem) {
      throw new BadRequestException(
        'Mức chất lượng hệ thống không xoá được - có thể tắt hoạt động thay vì xoá.',
      );
    }
    await item.deleteOne();
    return { message: 'Xoá mức chất lượng thành công.' };
  }

  /** Hai mức cùng phần trăm thì lúc chấm không biết chọn cái nào. */
  private async ensureUniquePercent(percent: number, excludeId: string | null) {
    const filter: Record<string, unknown> = { percent };
    if (excludeId) filter._id = { $ne: new Types.ObjectId(excludeId) };
    if (await this.qualityLevelModel.exists(filter)) {
      throw new BadRequestException(`Đã có mức chất lượng ${percent}%.`);
    }
  }

  private async requireById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy mức chất lượng.');
    }
    const item = await this.qualityLevelModel.findById(id);
    if (!item) throw new NotFoundException('Không tìm thấy mức chất lượng.');
    return item;
  }

  private async nextCode(): Promise<string> {
    const prefix = 'CL';
    const docs = await this.qualityLevelModel
      .find({ code: { $regex: `^${prefix}-\\d+$`, $options: 'i' } })
      .select('code')
      .lean();
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
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
