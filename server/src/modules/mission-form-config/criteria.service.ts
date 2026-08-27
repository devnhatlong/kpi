import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { UpdateCriterionDto } from './dto/update-criterion.dto';
import { Criterion, CriterionDocument } from './schemas/criterion.schema';

@Injectable()
export class CriteriaService {
  constructor(
    @InjectModel(Criterion.name)
    private readonly criterionModel: Model<CriterionDocument>,
  ) {}

  async create(dto: CreateCriterionDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    await this.ensureUniqueCode(code);

    const data = await this.criterionModel.create({
      code,
      name: dto.name.trim(),
      note: dto.note?.trim() ?? '',
      maxScore: dto.maxScore ?? 0,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { message: 'Tạo tiêu chí thành công.', data };
  }

  async findAll(query: PaginationQueryDto = new PaginationQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }, { note: regex }];
    }

    const sort = { sortOrder: 1 as const, name: 1 as const };

    if (query.all) {
      const data = await this.criterionModel.find(filter).sort(sort);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.criterionModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.criterionModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  /**
   * Dòng "Tổng điểm" cuối bảng tiêu chí.
   *
   * Tính trên TOÀN BỘ tiêu chí đang hoạt động chứ không phải trang đang xem -
   * admin mở trang 2 mà thấy tổng tụt xuống thì con số đó vô nghĩa. Tiêu chí
   * ngừng hoạt động không cộng vào, vì bảng chấm cũng không in nó ra.
   */
  async summary() {
    const rows = await this.criterionModel
      .find({ isActive: true })
      .select('maxScore');
    const totalMaxScore = rows.reduce(
      (sum, row) => sum + (row.maxScore ?? 0),
      0,
    );

    return {
      message: 'OK',
      data: { activeCount: rows.length, totalMaxScore },
    };
  }

  async findOne(id: string) {
    return this.requireById(id);
  }

  async update(id: string, dto: UpdateCriterionDto) {
    const item = await this.requireById(id);

    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã tiêu chí sau khi đã tạo - tránh lệch map dữ liệu.',
      );
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.note !== undefined) item.note = dto.note.trim();
    if (dto.maxScore !== undefined) item.maxScore = dto.maxScore;
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    await item.save();
    return { message: 'Cập nhật tiêu chí thành công.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    await item.deleteOne();
    return { message: 'Xoá tiêu chí thành công.' };
  }

  private async requireById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy tiêu chí.');
    }
    const item = await this.criterionModel.findById(id);
    if (!item) throw new NotFoundException('Không tìm thấy tiêu chí.');
    return item;
  }

  private async ensureUniqueCode(code: string, excludeId?: string) {
    const filter: Record<string, unknown> = { code };
    if (excludeId) filter._id = { $ne: excludeId };
    if (await this.criterionModel.exists(filter)) {
      throw new BadRequestException('Mã tiêu chí đã tồn tại.');
    }
  }

  private async nextCode(): Promise<string> {
    const prefix = 'TC';
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.criterionModel
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
