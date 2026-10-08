import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { CreateWorkContentDto } from './dto/create-work-content.dto';
import { UpdateWorkContentDto } from './dto/update-work-content.dto';
import {
  WORK_CONTENT_SET_NONE,
  WorkContentQueryDto,
} from './dto/work-content-query.dto';
import {
  WorkContent,
  WorkContentDocument,
} from './schemas/work-content.schema';
import { Axis, AxisDocument } from './schemas/axis.schema';
import { ScoreGroup, ScoreGroupDocument } from './schemas/score-group.schema';
import {
  WorkContentSet,
  WorkContentSetDocument,
} from './schemas/work-content-set.schema';

/** Tham chiếu kèm theo mọi lần đọc - form nhập cần cả tên lẫn dải điểm. */
const POPULATE_REFS = [
  { path: 'axisId', select: 'code name' },
  {
    path: 'scoreGroupId',
    select: 'code name minScore maxScore maxInclusive formulaScore',
  },
  { path: 'setIds', select: 'code name' },
] as const;

@Injectable()
export class WorkContentsService {
  constructor(
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
    @InjectModel(ScoreGroup.name)
    private readonly scoreGroupModel: Model<ScoreGroupDocument>,
    @InjectModel(WorkContentSet.name)
    private readonly setModel: Model<WorkContentSetDocument>,
  ) {}

  async create(dto: CreateWorkContentDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    await this.ensureUniqueCode(code);
    const axis = await this.requireAxis(dto.axisId);
    const scoreGroup = await this.requireScoreGroup(dto.scoreGroupId);
    const setIds = await this.requireSets(dto.setIds ?? []);

    const data = await this.workContentModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      axisId: axis._id,
      scoreGroupId: scoreGroup._id,
      setIds,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    await data.populate([...POPULATE_REFS]);

    return { message: 'Tạo nội dung công việc thành công.', data };
  }

  async findAll(query: WorkContentQueryDto = new WorkContentQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }, { description: regex }];
    }
    if (query.axisId) filter.axisId = new Types.ObjectId(query.axisId);
    if (query.setId === WORK_CONTENT_SET_NONE) {
      // Bản ghi có từ trước khi có bộ không mang trường `setIds` - `$size: 0`
      // bỏ sót chúng, còn "không có phần tử đầu" khớp cả thiếu lẫn rỗng.
      filter['setIds.0'] = { $exists: false };
    } else if (query.setId) {
      filter.setIds = new Types.ObjectId(query.setId);
    }

    const sort = { sortOrder: 1 as const, name: 1 as const };

    if (query.all) {
      const data = await this.workContentModel
        .find(filter)
        .sort(sort)
        .populate([...POPULATE_REFS]);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.workContentModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate([...POPULATE_REFS]),
      this.workContentModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.requireById(id, true);
  }

  async update(id: string, dto: UpdateWorkContentDto) {
    const item = await this.requireById(id);

    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã nội dung sau khi đã tạo - tránh lệch map dữ liệu.',
      );
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.description !== undefined) {
      item.description = dto.description.trim();
    }
    if (dto.axisId !== undefined) {
      const axis = await this.requireAxis(dto.axisId);
      item.axisId = axis._id;
    }
    if (dto.scoreGroupId !== undefined) {
      const scoreGroup = await this.requireScoreGroup(dto.scoreGroupId);
      item.scoreGroupId = scoreGroup._id;
    }
    if (dto.setIds !== undefined)
      item.setIds = await this.requireSets(dto.setIds);
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    await item.save();
    await item.populate([...POPULATE_REFS]);
    return { message: 'Cập nhật nội dung công việc thành công.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    await item.deleteOne();
    return { message: 'Xoá nội dung công việc thành công.' };
  }

  private async requireById(id: string, withPopulate = false) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy nội dung công việc.');
    }
    const item = withPopulate
      ? await this.workContentModel.findById(id).populate([...POPULATE_REFS])
      : await this.workContentModel.findById(id);
    if (!item) {
      throw new NotFoundException('Không tìm thấy nội dung công việc.');
    }
    return item;
  }

  private async requireAxis(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Trục không hợp lệ.');
    }
    const item = await this.axisModel.findById(id);
    if (!item) {
      throw new BadRequestException('Trục không tồn tại.');
    }
    return item;
  }

  private async requireScoreGroup(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Nhóm điểm không hợp lệ.');
    }
    const item = await this.scoreGroupModel.findById(id);
    if (!item) {
      throw new BadRequestException('Nhóm điểm không tồn tại.');
    }
    return item;
  }

  private async requireSets(ids: string[]) {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const found = await this.setModel
      .find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) } })
      .select('_id');
    if (found.length !== unique.length) {
      throw new BadRequestException('Có bộ nội dung không tồn tại.');
    }
    // Giữ thứ tự client gửi lên - không quan trọng nghĩa, chỉ cho dễ đọc.
    return unique.map((id) => new Types.ObjectId(id));
  }

  private async ensureUniqueCode(code: string, excludeId?: string) {
    const filter: Record<string, unknown> = { code };
    if (excludeId) filter._id = { $ne: excludeId };
    if (await this.workContentModel.exists(filter)) {
      throw new BadRequestException('Mã nội dung công việc đã tồn tại.');
    }
  }

  private async nextCode(): Promise<string> {
    const prefix = 'ND';
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.workContentModel
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
