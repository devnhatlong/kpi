import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import {
  AdjustmentItemQueryDto,
  CreateAdjustmentItemDto,
} from './dto/create-adjustment-item.dto';
import { UpdateAdjustmentItemDto } from './dto/update-adjustment-item.dto';
import {
  ADJUSTMENT_CODE_PREFIX,
  ADJUSTMENT_SECTIONS,
  AdjustmentItem,
  AdjustmentItemDocument,
  type AdjustmentSection,
} from './schemas/adjustment-item.schema';

/**
 * Danh mục "nội dung để soi chiếu" của bảng đề xuất điểm cộng / trừ / xếp loại.
 *
 * CRUD phẳng như tiêu chí chung. Khác một chỗ: mã tự sinh theo PHẦN (DC-, DT-,
 * XL-) chứ không một dãy chung - nhìn mã là biết dòng thuộc bảng I, II hay III.
 */
@Injectable()
export class AdjustmentItemsService {
  constructor(
    @InjectModel(AdjustmentItem.name)
    private readonly itemModel: Model<AdjustmentItemDocument>,
  ) {}

  async create(dto: CreateAdjustmentItemDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode(dto.section);
    await this.ensureUniqueCode(code);

    const data = await this.itemModel.create({
      code,
      section: dto.section,
      name: dto.name.trim(),
      rule: dto.rule?.trim() ?? '',
      maxScore: this.normalizeMaxScore(dto.section, dto.maxScore),
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { message: 'Đã thêm dòng vào danh mục.', data };
  }

  async findAll(query: AdjustmentItemQueryDto = new AdjustmentItemQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.section) filter.section = query.section;
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }, { rule: regex }];
    }

    // Theo phần trước, rồi thứ tự quản trị xếp - đúng thứ tự trên mẫu giấy.
    const sort = {
      section: 1 as const,
      sortOrder: 1 as const,
      name: 1 as const,
    };

    if (query.all) {
      const data = await this.itemModel.find(filter).sort(sort);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.itemModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.itemModel.countDocuments(filter),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  /**
   * Số dòng đang dùng của từng phần, và tổng "Tối đa" của phần Điểm cộng - dòng
   * "TỔNG ĐIỂM CỘNG TỐI ĐA" cuối bảng I (mẫu giấy ghi 10 điểm).
   *
   * Tính trên toàn bộ dòng đang hoạt động, không phải trang đang xem.
   */
  async summary() {
    const rows = await this.itemModel
      .find({ isActive: true })
      .select('section maxScore');

    const counts: Record<AdjustmentSection, number> = {
      BONUS: 0,
      PENALTY: 0,
      RANKING: 0,
    };
    let bonusMaxTotal = 0;
    for (const row of rows) {
      counts[row.section] += 1;
      if (row.section === 'BONUS') bonusMaxTotal += row.maxScore ?? 0;
    }

    return { message: 'OK', data: { counts, bonusMaxTotal } };
  }

  async findOne(id: string) {
    return this.requireById(id);
  }

  async update(id: string, dto: UpdateAdjustmentItemDto) {
    const item = await this.requireById(id);

    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã sau khi đã tạo - tránh lệch map dữ liệu.',
      );
    }
    /*
      Không cho đổi phần: dòng đã được đơn vị chấm vào bảng tháng nào đó, kéo nó
      từ "Điểm cộng" sang "Điểm trừ" là điểm đã chấm đổi dấu mà không ai biết.
      Muốn chuyển thì ngừng dòng này và tạo dòng mới ở phần kia.
    */
    if (dto.section !== undefined && dto.section !== item.section) {
      throw new BadRequestException(
        'Không được đổi phần (I/II/III) của một dòng đã tạo. Ngừng dòng này và thêm dòng mới ở phần kia.',
      );
    }

    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.rule !== undefined) item.rule = dto.rule.trim();
    if (dto.maxScore !== undefined) {
      item.maxScore = this.normalizeMaxScore(item.section, dto.maxScore);
    }
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    await item.save();
    return { message: 'Đã cập nhật dòng.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    await item.deleteOne();
    return { message: 'Đã xoá dòng khỏi danh mục.' };
  }

  // ==================================================================== nội bộ

  /** "Tối đa" chỉ có nghĩa ở phần Điểm cộng - hai phần kia luôn để null. */
  private normalizeMaxScore(
    section: AdjustmentSection,
    value: number | null | undefined,
  ): number | null {
    if (section !== 'BONUS') return null;
    if (value === undefined || value === null) return null;
    if (!Number.isFinite(value) || value < 0) {
      throw new BadRequestException('Điểm tối đa phải là số không âm.');
    }
    return value;
  }

  private async requireById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy dòng trong danh mục.');
    }
    const item = await this.itemModel.findById(id);
    if (!item)
      throw new NotFoundException('Không tìm thấy dòng trong danh mục.');
    return item;
  }

  private async ensureUniqueCode(code: string) {
    if (await this.itemModel.exists({ code })) {
      throw new BadRequestException('Mã đã tồn tại.');
    }
  }

  private async nextCode(section: AdjustmentSection): Promise<string> {
    if (!ADJUSTMENT_SECTIONS.includes(section)) {
      throw new BadRequestException('Phần không hợp lệ.');
    }
    const prefix = ADJUSTMENT_CODE_PREFIX[section];
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.itemModel
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
