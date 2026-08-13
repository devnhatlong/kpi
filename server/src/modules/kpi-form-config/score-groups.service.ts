import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { CreateScoreGroupDto } from './dto/create-score-group.dto';
import { UpdateScoreGroupDto } from './dto/update-score-group.dto';
import {
  ScoreGroup,
  ScoreGroupDocument,
} from './schemas/score-group.schema';
import {
  formatScoreGroupRange,
  isScoreInGroupRange,
  SCORE_GROUP_SCALE_MAX,
  SCORE_GROUP_SCALE_MIN,
} from './score-group.constants';

@Injectable()
export class ScoreGroupsService {
  constructor(
    @InjectModel(ScoreGroup.name)
    private readonly scoreGroupModel: Model<ScoreGroupDocument>,
  ) {}

  async create(dto: CreateScoreGroupDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    await this.ensureUniqueCode(code);
    const maxInclusive = dto.maxInclusive ?? false;
    this.assertValidScoreRange(dto.minScore, dto.maxScore, maxInclusive);
    const formulaScore = this.normalizeFormulaScore(
      dto.formulaScore,
      dto.minScore,
      dto.maxScore,
      maxInclusive,
    );

    const data = await this.scoreGroupModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      minScore: dto.minScore,
      maxScore: dto.maxScore,
      maxInclusive,
      formulaScore,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return { message: 'Tạo nhóm điểm thành công.', data };
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
      const data = await this.scoreGroupModel.find(filter).sort(sort);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.scoreGroupModel.find(filter).sort(sort).skip(skip).limit(limit),
      this.scoreGroupModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    return this.requireById(id);
  }

  async update(id: string, dto: UpdateScoreGroupDto) {
    const item = await this.requireById(id);

    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã nhóm sau khi đã tạo - tránh lệch map dữ liệu.',
      );
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.description !== undefined) {
      item.description = dto.description.trim();
    }
    const nextMinScore = dto.minScore ?? item.minScore;
    const nextMaxScore = dto.maxScore ?? item.maxScore;
    const nextMaxInclusive = dto.maxInclusive ?? item.maxInclusive;
    this.assertValidScoreRange(nextMinScore, nextMaxScore, nextMaxInclusive);
    if (dto.minScore !== undefined) item.minScore = dto.minScore;
    if (dto.maxScore !== undefined) item.maxScore = dto.maxScore;
    if (dto.maxInclusive !== undefined) item.maxInclusive = dto.maxInclusive;
    // Soi lại kể cả khi client không gửi: kéo dải điểm đi chỗ khác có thể làm
    // điểm chuẩn đã khai rơi ra ngoài dải của chính nhóm nó.
    item.formulaScore = this.normalizeFormulaScore(
      dto.formulaScore !== undefined ? dto.formulaScore : item.formulaScore,
      nextMinScore,
      nextMaxScore,
      nextMaxInclusive,
    );
    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) {
      item.isActive = dto.isActive;
    }

    await item.save();
    return { message: 'Cập nhật nhóm điểm thành công.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    await item.deleteOne();
    return { message: 'Xoá nhóm điểm thành công.' };
  }

  private async requireById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy nhóm điểm.');
    }
    const item = await this.scoreGroupModel.findById(id);
    if (!item) {
      throw new NotFoundException('Không tìm thấy nhóm điểm.');
    }
    return item;
  }

  private async ensureUniqueCode(code: string) {
    if (await this.scoreGroupModel.exists({ code })) {
      throw new BadRequestException('Mã nhóm điểm đã tồn tại.');
    }
  }

  private assertValidScoreRange(
    minScore: number,
    maxScore: number,
    maxInclusive: boolean,
  ) {
    if (minScore < SCORE_GROUP_SCALE_MIN || minScore > SCORE_GROUP_SCALE_MAX) {
      throw new BadRequestException(
        `Mức điểm từ phải trong khoảng ${SCORE_GROUP_SCALE_MIN}..${SCORE_GROUP_SCALE_MAX}.`,
      );
    }
    if (maxScore < SCORE_GROUP_SCALE_MIN || maxScore > SCORE_GROUP_SCALE_MAX) {
      throw new BadRequestException(
        `Mức điểm đến phải trong khoảng ${SCORE_GROUP_SCALE_MIN}..${SCORE_GROUP_SCALE_MAX}.`,
      );
    }
    if (maxInclusive ? maxScore < minScore : maxScore <= minScore) {
      throw new BadRequestException(
        'Khoảng điểm không hợp lệ: điểm đến phải lớn hơn điểm từ.',
      );
    }
  }

  /**
   * Điểm chuẩn khai tay phải nằm trong chính dải của nhóm, nếu không thì một
   * nhóm "0 → dưới 50" lại góp 60 điểm vào mẫu số và không ai hiểu vì sao.
   * Trả null khi bỏ trống - lúc tính sẽ suy từ dải.
   */
  private normalizeFormulaScore(
    formulaScore: number | null | undefined,
    minScore: number,
    maxScore: number,
    maxInclusive: boolean,
  ): number | null {
    if (formulaScore === null || formulaScore === undefined) return null;

    if (!Number.isFinite(formulaScore)) {
      throw new BadRequestException('Điểm max dùng để tính không hợp lệ.');
    }
    if (!isScoreInGroupRange(formulaScore, minScore, maxScore, maxInclusive)) {
      throw new BadRequestException(
        `Điểm max dùng để tính phải nằm trong dải ${formatScoreGroupRange(minScore, maxScore, maxInclusive)}.`,
      );
    }
    return formulaScore;
  }

  private async nextCode(): Promise<string> {
    const prefix = 'DG';
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.scoreGroupModel
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
