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
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import {
  DepartmentLevel,
  DepartmentLevelDocument,
} from '@/modules/department-levels/schemas/department-level.schema';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import { CreateReportTemplateDto } from './dto/create-report-template.dto';
import { UpdateReportTemplateDto } from './dto/update-report-template.dto';
import {
  ReportTemplate,
  ReportTemplateDocument,
  type ReportScopeType,
} from './schemas/report-template.schema';
import { Axis, AxisDocument } from './schemas/axis.schema';

const AXIS_POPULATE = {
  path: 'axisIds',
  select: 'code name description maxScore sortOrder isActive',
};
const SCOPE_POPULATE = [
  { path: 'levelIds', select: 'code name rank' },
  { path: 'departmentIds', select: 'code name' },
];
const POPULATE_ALL = [AXIS_POPULATE, ...SCOPE_POPULATE];

/** Đơn vị khớp mẫu qua đường nào - để màn nhập nói rõ đang dùng mẫu của ai. */
export type ReportScopeSource =
  | 'department'
  | 'level'
  | 'all'
  /** Không mẫu nào phủ đơn vị này - rơi về toàn bộ trục đang hoạt động. */
  | 'fallback';

@Injectable()
export class ReportTemplatesService {
  constructor(
    @InjectModel(ReportTemplate.name)
    private readonly reportTemplateModel: Model<ReportTemplateDocument>,
    @InjectModel(Axis.name)
    private readonly axisModel: Model<AxisDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(DepartmentLevel.name)
    private readonly levelModel: Model<DepartmentLevelDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateReportTemplateDto) {
    const code = dto.code?.trim()
      ? dto.code.trim().toUpperCase()
      : await this.nextCode();
    await this.ensureUniqueCode(code);

    const scope = await this.resolveScope(
      dto.scopeType ?? 'all',
      dto.levelIds ?? [],
      dto.departmentIds ?? [],
    );

    const data = await this.reportTemplateModel.create({
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      year: this.resolveYear(dto.year),
      includeCriteria: dto.includeCriteria ?? true,
      axisIds: await this.resolveAxisIds(dto.axisIds ?? []),
      ...scope,
      includeDescendants: dto.includeDescendants ?? true,
      // Mẫu mới luôn ở trạng thái đang cấu hình - áp dụng là một hành động
      // riêng, có kiểm tra riêng (xem `apply`).
      status: 'draft',
      appliedAt: null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    await data.populate(POPULATE_ALL);
    return { message: 'Tạo mẫu báo cáo thành công.', data };
  }

  async findAll(query: PaginationQueryDto = new PaginationQueryDto()) {
    const filter: Record<string, unknown> = {};
    if (query.q) {
      const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [{ code: regex }, { name: regex }, { description: regex }];
    }

    const sort = { year: -1 as const, sortOrder: 1 as const, name: 1 as const };

    if (query.all) {
      const data = await this.reportTemplateModel
        .find(filter)
        .sort(sort)
        .populate(POPULATE_ALL);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.reportTemplateModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate(POPULATE_ALL),
      this.reportTemplateModel.countDocuments(filter),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const item = await this.requireById(id);
    await item.populate(POPULATE_ALL);
    return item;
  }

  /**
   * Mẫu áp dụng cho đơn vị của người đang đăng nhập.
   *
   * Đơn vị lấy từ hồ sơ người dùng chứ không nhận từ client: để client tự khai
   * đơn vị thì ai cũng đọc được mẫu của đơn vị khác chỉ bằng cách đổi tham số.
   * Muốn xem mẫu của đơn vị khác thì đi qua `resolveForDepartment`, và đường đó
   * gác bằng quyền cấu hình.
   */
  async resolveForUser(uid: string, year?: number) {
    const user = await this.userModel.findById(uid).select('departmentId');
    return this.resolveForDepartment(
      user?.departmentId ? String(user.departmentId) : null,
      year,
    );
  }

  /**
   * Mẫu áp dụng cho một đơn vị, theo thứ tự ưu tiên
   * `by_department` > `by_level` > `all`.
   *
   * Không mẫu nào phủ đơn vị thì trả RỖNG kèm cờ `source = 'fallback'` - đơn vị
   * đó không có biểu mẫu nào để nhập, và màn nhập phải khoá lại chứ không được
   * tự bày ra mọi trục trong hệ thống. Bày ra thì cán bộ khai vào một cấu trúc
   * chưa ai duyệt, và số liệu đó không quy về mẫu nào để chấm được.
   */
  async resolveForDepartment(departmentId: string | null, year?: number) {
    const target = this.resolveYear(year);
    const applied = await this.reportTemplateModel
      .find({ year: target, status: 'applied', isActive: true })
      .populate(POPULATE_ALL);

    let picked: ReportTemplateDocument | null = null;
    let source: ReportScopeSource = 'fallback';

    const department =
      departmentId && Types.ObjectId.isValid(departmentId)
        ? await this.departmentModel
            .findById(departmentId)
            .select('levelId ancestors')
        : null;

    if (department) {
      /*
        Điểm sâu dần từ gốc xuống chính đơn vị: mẫu gán ở nút gần đơn vị nhất
        thắng. Tick cả Tỉnh lẫn Phòng thì Phòng thắng - đúng nghĩa "ngoại lệ
        của một nhánh con".
      */
      const chainScore = new Map<string, number>();
      (department.ancestors ?? []).forEach((id, index) => {
        chainScore.set(String(id), index);
      });
      const selfKey = String(department._id);
      chainScore.set(selfKey, (department.ancestors ?? []).length);

      let bestScore = -1;
      for (const template of applied) {
        if (template.scopeType !== 'by_department') continue;
        for (const dept of template.departmentIds ?? []) {
          const key = String((dept as { _id?: unknown })._id ?? dept);
          const score = chainScore.get(key);
          if (score === undefined) continue;
          // Nút cha chỉ tính khi mẫu cho phép cấp dưới dùng theo.
          if (key !== selfKey && !template.includeDescendants) continue;
          if (score > bestScore) {
            bestScore = score;
            picked = template;
          }
        }
      }
      if (picked) source = 'department';

      if (!picked && department.levelId) {
        const levelKey = String(department.levelId);
        picked =
          applied.find(
            (template) =>
              template.scopeType === 'by_level' &&
              (template.levelIds ?? []).some(
                (level) =>
                  String((level as { _id?: unknown })._id ?? level) ===
                  levelKey,
              ),
          ) ?? null;
        if (picked) source = 'level';
      }
    }

    if (!picked) {
      picked = applied.find((template) => template.scopeType === 'all') ?? null;
      if (picked) source = 'all';
    }

    // Trục đã tắt vẫn nằm trong mẫu cũ - lọc ra để màn nhập không bày trục
    // không còn dùng, nhưng KHÔNG gỡ khỏi mẫu: bản ghi cũ vẫn trỏ vào nó.
    const axes = picked
      ? (picked.axisIds as unknown as AxisDocument[]).filter(
          (axis) => axis?.isActive !== false,
        )
      : [];

    return {
      data: {
        year: target,
        departmentId: departmentId ?? null,
        source,
        template: picked,
        includeCriteria: picked ? picked.includeCriteria : false,
        axes,
      },
    };
  }

  async update(id: string, dto: UpdateReportTemplateDto) {
    const item = await this.requireById(id);

    if (dto.code !== undefined && dto.code.trim().toUpperCase() !== item.code) {
      throw new BadRequestException(
        'Không được đổi mã mẫu báo cáo sau khi đã tạo - tránh lệch map dữ liệu.',
      );
    }
    if (dto.name !== undefined) item.name = dto.name.trim();
    if (dto.description !== undefined)
      item.description = dto.description.trim();
    if (dto.year !== undefined) item.year = this.resolveYear(dto.year);
    if (dto.includeCriteria !== undefined) {
      item.includeCriteria = dto.includeCriteria;
    }
    if (dto.axisIds !== undefined) {
      item.axisIds = await this.resolveAxisIds(dto.axisIds);
    }
    if (dto.includeDescendants !== undefined) {
      item.includeDescendants = dto.includeDescendants;
    }

    const scopeTouched =
      dto.scopeType !== undefined ||
      dto.levelIds !== undefined ||
      dto.departmentIds !== undefined;
    if (scopeTouched) {
      const scope = await this.resolveScope(
        dto.scopeType ?? item.scopeType,
        dto.levelIds ?? item.levelIds.map(String),
        dto.departmentIds ?? item.departmentIds.map(String),
      );
      item.scopeType = scope.scopeType;
      item.levelIds = scope.levelIds;
      item.departmentIds = scope.departmentIds;
    }

    if (dto.sortOrder !== undefined) item.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) item.isActive = dto.isActive;

    /*
      Sửa thành phần hoặc phạm vi của mẫu ĐANG áp dụng thì đưa nó về nháp: bảng
      chấm của các đơn vị đang bám theo bản này, đổi mà vẫn để nguyên nhãn "đã
      áp dụng" thì không ai biết bản đang chấm khác bản đang xem. Áp dụng lại là
      một cú bấm tường minh, và lúc đó mới soi lại chồng lấn phạm vi.
    */
    if (
      item.status === 'applied' &&
      (dto.axisIds !== undefined ||
        dto.includeCriteria !== undefined ||
        dto.year !== undefined ||
        dto.includeDescendants !== undefined ||
        scopeTouched)
    ) {
      item.status = 'draft';
      item.appliedAt = null;
    }

    await item.save();
    await item.populate(POPULATE_ALL);
    return { message: 'Cập nhật mẫu báo cáo thành công.', data: item };
  }

  /**
   * Áp dụng mẫu cho năm của nó.
   *
   * Một năm có thể có NHIỀU mẫu áp dụng song song - một mẫu chung, vài mẫu
   * riêng cho cấp hoặc cho đơn vị - vì thứ tự ưu tiên đã quyết định được đơn vị
   * nào dùng mẫu nào. Chỉ chặn khi hai mẫu chồng nhau ở CÙNG một mức, lúc đó
   * mới thật sự không biết chọn bản nào.
   *
   * Mốc thời gian lấy từ server chứ không nhận của client: máy trạm lệch giờ là
   * mốc áp dụng của cả năm lệch theo.
   */
  async apply(id: string) {
    const item = await this.requireById(id);

    if (!item.isActive) {
      throw new BadRequestException(
        'Mẫu đã ngừng hoạt động - bật lại trước khi áp dụng.',
      );
    }
    if (!item.axisIds.length && !item.includeCriteria) {
      throw new BadRequestException(
        'Mẫu chưa có khối nội dung nào - chọn ít nhất một trục hoặc bật bảng tiêu chí chung.',
      );
    }
    await this.ensureScopeFree(item);

    item.status = 'applied';
    item.appliedAt = new Date();
    await item.save();
    await item.populate(POPULATE_ALL);

    return {
      message: `Đã áp dụng mẫu báo cáo cho năm ${item.year}.`,
      data: item,
    };
  }

  /** Gỡ áp dụng - mẫu quay về nháp, các đơn vị rơi về mẫu ở mức rộng hơn. */
  async unapply(id: string) {
    const item = await this.requireById(id);
    item.status = 'draft';
    item.appliedAt = null;
    await item.save();
    await item.populate(POPULATE_ALL);
    return { message: 'Đã gỡ áp dụng mẫu báo cáo.', data: item };
  }

  async remove(id: string) {
    const item = await this.requireById(id);
    if (item.status === 'applied') {
      throw new BadRequestException(
        'Không xoá được mẫu đang áp dụng - gỡ áp dụng trước.',
      );
    }
    await item.deleteOne();
    return { message: 'Xoá mẫu báo cáo thành công.' };
  }

  /** Hai mẫu cùng năm phủ cùng một phạm vi thì không biết chọn bản nào. */
  private async ensureScopeFree(item: ReportTemplateDocument) {
    const base: Record<string, unknown> = {
      year: item.year,
      status: 'applied',
      _id: { $ne: item._id },
    };

    const conflict =
      item.scopeType === 'all'
        ? await this.reportTemplateModel.findOne({ ...base, scopeType: 'all' })
        : item.scopeType === 'by_level'
          ? await this.reportTemplateModel.findOne({
              ...base,
              scopeType: 'by_level',
              levelIds: { $in: item.levelIds },
            })
          : await this.reportTemplateModel.findOne({
              ...base,
              scopeType: 'by_department',
              departmentIds: { $in: item.departmentIds },
            });

    if (conflict) {
      throw new BadRequestException(
        `Năm ${item.year} đã có mẫu "${conflict.name}" áp dụng cho cùng phạm vi này. Gỡ áp dụng mẫu đó trước.`,
      );
    }
  }

  /** Chuẩn hoá phạm vi: kiểu nào thì chỉ giữ danh sách của kiểu đó. */
  private async resolveScope(
    scopeType: ReportScopeType,
    levelIds: string[],
    departmentIds: string[],
  ): Promise<{
    scopeType: ReportScopeType;
    levelIds: Types.ObjectId[];
    departmentIds: Types.ObjectId[];
  }> {
    if (scopeType === 'all') {
      return { scopeType, levelIds: [], departmentIds: [] };
    }

    if (scopeType === 'by_level') {
      const ids = this.uniqueObjectIds(levelIds);
      if (!ids.length) {
        throw new BadRequestException('Chọn ít nhất một cấp đơn vị.');
      }
      const found = await this.levelModel.countDocuments({ _id: { $in: ids } });
      if (found !== ids.length) {
        throw new BadRequestException('Có cấp đơn vị không tồn tại.');
      }
      return { scopeType, levelIds: ids, departmentIds: [] };
    }

    const ids = this.uniqueObjectIds(departmentIds);
    if (!ids.length) {
      throw new BadRequestException('Chọn ít nhất một đơn vị.');
    }
    const found = await this.departmentModel.countDocuments({
      _id: { $in: ids },
    });
    if (found !== ids.length) {
      throw new BadRequestException('Có đơn vị không tồn tại.');
    }
    return { scopeType, levelIds: [], departmentIds: ids };
  }

  private uniqueObjectIds(values: string[]): Types.ObjectId[] {
    const unique = [...new Set(values.map((value) => value.trim()))].filter(
      Boolean,
    );
    for (const value of unique) {
      if (!Types.ObjectId.isValid(value)) {
        throw new BadRequestException('Giá trị phạm vi không hợp lệ.');
      }
    }
    return unique.map((value) => new Types.ObjectId(value));
  }

  /** Bỏ trống thì lấy năm của SERVER, không nhận năm suy từ giờ máy client. */
  private resolveYear(year?: number): number {
    if (year === undefined || year === null) return new Date().getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      throw new BadRequestException('Năm áp dụng không hợp lệ.');
    }
    return year;
  }

  private async requireById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy mẫu báo cáo.');
    }
    const item = await this.reportTemplateModel.findById(id);
    if (!item) throw new NotFoundException('Không tìm thấy mẫu báo cáo.');
    return item;
  }

  private async ensureUniqueCode(code: string) {
    if (await this.reportTemplateModel.exists({ code })) {
      throw new BadRequestException('Mã mẫu báo cáo đã tồn tại.');
    }
  }

  /**
   * Lọc trùng nhưng GIỮ NGUYÊN thứ tự client gửi - thứ tự này là thứ tự khối
   * B.1, B.2… trên báo cáo, sort lại là đổi luôn cách đánh số của mẫu.
   */
  private async resolveAxisIds(axisIds: string[]) {
    const objectIds = this.uniqueObjectIds(axisIds);
    if (!objectIds.length) return [];

    const found = await this.axisModel.countDocuments({
      _id: { $in: objectIds },
    });
    if (found !== objectIds.length) {
      throw new BadRequestException('Có trục không tồn tại.');
    }
    return objectIds;
  }

  private async nextCode(): Promise<string> {
    const prefix = 'MBC';
    const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');
    const docs = await this.reportTemplateModel
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
