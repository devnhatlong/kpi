import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { CreateWorkTaskDto } from './dto/create-work-task.dto';
import { UpdateWorkTaskDto } from './dto/update-work-task.dto';
import { WorkTask, WorkTaskDocument } from './schemas/work-task.schema';
import {
  WorkContent,
  WorkContentDocument,
} from './schemas/work-content.schema';
import { ScoreGroup, ScoreGroupDocument } from './schemas/score-group.schema';

/** Tham chiếu kèm theo mọi lần đọc - form nhập cần cả tên lẫn dải điểm. */
const POPULATE_REFS = [
  { path: 'workContentId', select: 'code name axisId scoreGroupId' },
  {
    path: 'scoreGroupId',
    select: 'code name minScore maxScore maxInclusive formulaScore',
  },
] as const;

@Injectable()
export class WorkTasksService {
  constructor(
    @InjectModel(WorkTask.name)
    private readonly workTaskModel: Model<WorkTaskDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(ScoreGroup.name)
    private readonly scoreGroupModel: Model<ScoreGroupDocument>,
  ) {}

  async create(dto: CreateWorkTaskDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    await this.ensureUniqueCode(code);
    const content = await this.requireWorkContent(dto.workContentId);
    const scoreGroupId = await this.resolveScoreGroupId(dto.scoreGroupId);

    const data = await this.workTaskModel.create({
      code,
      name: dto.name.trim(),
      workContentId: content._id,
      scoreGroupId,
      note: dto.note?.trim() ?? '',
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    await data.populate([...POPULATE_REFS]);

    return { message: 'Tạo nhiệm vụ thành công.', data };
  }

  async findAll(
    query: PaginationQueryDto = new PaginationQueryDto(),
    workContentId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }, { note: regex }];
    }
    // Form nhập chỉ cần nhiệm vụ của đúng nội dung đang khai.
    if (workContentId && Types.ObjectId.isValid(workContentId)) {
      filter.workContentId = new Types.ObjectId(workContentId);
    }

    const sort = { sortOrder: 1 as const, name: 1 as const };

    if (query.all) {
      const data = await this.workTaskModel
        .find(filter)
        .sort(sort)
        .populate([...POPULATE_REFS]);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.workTaskModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate([...POPULATE_REFS]),
      this.workTaskModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.requireById(id, true);
  }

  async update(id: string, dto: UpdateWorkTaskDto) {
    const item = await this.requireById(id);

    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã nhiệm vụ sau khi đã tạo - tránh lệch map dữ liệu.',
      );
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.note !== undefined) item.note = dto.note.trim();
    if (dto.workContentId !== undefined) {
      const content = await this.requireWorkContent(dto.workContentId);
      item.workContentId = content._id;
    }
    if (dto.scoreGroupId !== undefined) {
      item.scoreGroupId = await this.resolveScoreGroupId(dto.scoreGroupId);
    }
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    await item.save();
    await item.populate([...POPULATE_REFS]);
    return { message: 'Cập nhật nhiệm vụ thành công.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    await item.deleteOne();
    return { message: 'Xoá nhiệm vụ thành công.' };
  }

  private async requireById(id: string, withPopulate = false) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    }
    const item = withPopulate
      ? await this.workTaskModel.findById(id).populate([...POPULATE_REFS])
      : await this.workTaskModel.findById(id);
    if (!item) throw new NotFoundException('Không tìm thấy nhiệm vụ.');
    return item;
  }

  private async requireWorkContent(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Nội dung công việc không hợp lệ.');
    }
    const item = await this.workContentModel.findById(id);
    if (!item) {
      throw new BadRequestException('Nội dung công việc không tồn tại.');
    }
    return item;
  }

  /** Bỏ trống = dùng nhóm điểm của nội dung công việc, không phải lỗi. */
  private async resolveScoreGroupId(id?: string | null) {
    const value = id?.trim();
    if (!value) return null;
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Nhóm điểm không hợp lệ.');
    }
    const item = await this.scoreGroupModel.findById(value);
    if (!item) throw new BadRequestException('Nhóm điểm không tồn tại.');
    return item._id;
  }

  private async ensureUniqueCode(code: string) {
    const existed = await this.workTaskModel.exists({ code });
    if (existed) throw new BadRequestException('Mã nhiệm vụ đã tồn tại.');
  }

  private async nextCode(): Promise<string> {
    const prefix = 'NV';
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.workTaskModel
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
