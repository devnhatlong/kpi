import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Helper } from '@/ultis/helpers';
import { Department, DepartmentDocument } from './schemas/department.schema';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { ImportDepartmentRowDto } from './dto/import-departments.dto';
import { DepartmentLevelsService } from '../department-levels/department-levels.service';

type ImportRowResult = {
  row: number;
  code: string;
  status: 'created' | 'skipped' | 'error';
  message: string;
};

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly departmentLevelsService: DepartmentLevelsService,
  ) {}

  async create(dto: CreateDepartmentDto) {
    const code = dto.code.trim().toUpperCase();
    const exists = await this.departmentModel.findOne({ code });
    if (exists) {
      throw new BadRequestException('Mã đơn vị đã tồn tại.');
    }

    if (dto.levelId) {
      await this.departmentLevelsService.findOne(dto.levelId);
    }

    const tree = await this.resolveTreeFields(dto.parentId);

    const department = await this.departmentModel.create({
      code,
      name: dto.name.trim(),
      slug: Helper.slugify(dto.name),
      levelId: dto.levelId ? new Types.ObjectId(dto.levelId) : undefined,
      parentId: tree.parentId,
      ancestors: tree.ancestors,
      path: tree.path,
      depth: tree.depth,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });

    return {
      message: 'Tạo đơn vị thành công.',
      data: department,
    };
  }

  async findAll() {
    return this.departmentModel
      .find()
      .sort({ depth: 1, sortOrder: 1, name: 1 })
      .populate('levelId', 'code name rank')
      .populate('parentId', 'code name');
  }

  async findOne(id: string) {
    const department = await this.requireDepartment(id);
    await department.populate([
      { path: 'levelId', select: 'code name rank' },
      { path: 'parentId', select: 'code name' },
    ]);
    return department;
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    const department = await this.requireDepartment(id);
    const oldPath = department.path;
    const oldIdPath = `${oldPath}${department._id}/`;

    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      const exists = await this.departmentModel.findOne({
        code,
        _id: { $ne: department._id },
      });
      if (exists) {
        throw new BadRequestException('Mã đơn vị đã tồn tại.');
      }
      department.code = code;
    }

    if (dto.name !== undefined) {
      department.name = dto.name.trim();
      department.slug = Helper.slugify(dto.name);
    }

    if (dto.levelId !== undefined) {
      if (!dto.levelId) {
        department.set('levelId', undefined);
      } else {
        await this.departmentLevelsService.findOne(dto.levelId);
        department.levelId = new Types.ObjectId(dto.levelId);
      }
    }

    if (dto.sortOrder !== undefined) {
      department.sortOrder = dto.sortOrder;
    }
    if (dto.isActive !== undefined) {
      department.isActive = dto.isActive;
    }

    if (dto.parentId !== undefined) {
      const newParentId =
        dto.parentId === null || dto.parentId === ''
          ? undefined
          : dto.parentId;

      if (newParentId === id) {
        throw new BadRequestException('Đơn vị không thể là cha của chính nó.');
      }

      if (newParentId) {
        if (!Types.ObjectId.isValid(newParentId)) {
          throw new BadRequestException('Mã đơn vị cha không hợp lệ.');
        }
        const parent = await this.requireDepartment(newParentId);
        const isDescendant = parent.ancestors.some(
          (ancestorId) => ancestorId.toString() === id,
        );
        if (isDescendant || parent._id.toString() === id) {
          throw new BadRequestException(
            'Không thể chọn đơn vị con làm đơn vị cha.',
          );
        }
      }

      const tree = await this.resolveTreeFields(newParentId);
      department.parentId = tree.parentId;
      department.ancestors = tree.ancestors;
      department.path = tree.path;
      department.depth = tree.depth;
    }

    await department.save();

    if (dto.parentId !== undefined) {
      const newIdPath = `${department.path}${department._id}/`;
      await this.rebuildDescendants(department, oldIdPath, newIdPath);
    }

    return {
      message: 'Cập nhật đơn vị thành công.',
      data: department,
    };
  }

  async remove(id: string) {
    const department = await this.requireDepartment(id);
    const childCount = await this.departmentModel.countDocuments({
      parentId: department._id,
    });
    if (childCount > 0) {
      throw new BadRequestException(
        'Không thể xóa đơn vị còn đơn vị con. Hãy xóa hoặc chuyển đơn vị con trước.',
      );
    }

    await department.deleteOne();

    return { message: 'Xóa đơn vị thành công.' };
  }

  /**
   * Import theo mã (code / parentCode / levelCode).
   * Tạo theo thứ tự phụ thuộc: đơn vị cha trước đơn vị con.
   * Mã đã tồn tại → bỏ qua (không ghi đè).
   */
  async importMany(rows: ImportDepartmentRowDto[]) {
    const results: ImportRowResult[] = [];
    const normalized = rows.map((row, index) => ({
      index: index + 1,
      code: String(row.code ?? '')
        .trim()
        .toUpperCase(),
      name: String(row.name ?? '').trim(),
      parentCode: row.parentCode
        ? String(row.parentCode).trim().toUpperCase()
        : undefined,
      levelCode: row.levelCode
        ? String(row.levelCode).trim().toUpperCase()
        : undefined,
      sortOrder: row.sortOrder ?? 0,
      isActive: row.isActive ?? true,
    }));

    const existing = await this.departmentModel.find().select('_id code');
    const codeToId = new Map(
      existing.map((d) => [d.code.toUpperCase(), d._id.toString()]),
    );

    const levels = await this.departmentLevelsService.findAll();
    const levelCodeToId = new Map(
      levels.map((level) => [
        String(level.code).toUpperCase(),
        level._id.toString(),
      ]),
    );

    const pending = [...normalized];
    let guard = pending.length + 2;

    while (pending.length > 0 && guard-- > 0) {
      let progressed = false;

      for (let i = 0; i < pending.length; ) {
        const row = pending[i];

        if (!row.code || !row.name) {
          results.push({
            row: row.index,
            code: row.code || '(trống)',
            status: 'error',
            message: 'Thiếu mã hoặc tên đơn vị.',
          });
          pending.splice(i, 1);
          progressed = true;
          continue;
        }

        if (codeToId.has(row.code)) {
          results.push({
            row: row.index,
            code: row.code,
            status: 'skipped',
            message: 'Mã đơn vị đã tồn tại.',
          });
          pending.splice(i, 1);
          progressed = true;
          continue;
        }

        if (row.parentCode && !codeToId.has(row.parentCode)) {
          const parentStillPending = pending.some(
            (p) => p.code === row.parentCode,
          );
          if (parentStillPending) {
            i += 1;
            continue;
          }
          results.push({
            row: row.index,
            code: row.code,
            status: 'error',
            message: `Không tìm thấy đơn vị cha "${row.parentCode}".`,
          });
          pending.splice(i, 1);
          progressed = true;
          continue;
        }

        let levelId: string | undefined;
        if (row.levelCode) {
          levelId = levelCodeToId.get(row.levelCode);
          if (!levelId) {
            results.push({
              row: row.index,
              code: row.code,
              status: 'error',
              message: `Không tìm thấy cấp đơn vị "${row.levelCode}".`,
            });
            pending.splice(i, 1);
            progressed = true;
            continue;
          }
        }

        try {
          const created = await this.create({
            code: row.code,
            name: row.name,
            parentId: row.parentCode
              ? codeToId.get(row.parentCode)
              : undefined,
            levelId,
            sortOrder: row.sortOrder,
            isActive: row.isActive,
          });

          const doc = created.data as DepartmentDocument;
          codeToId.set(row.code, doc._id.toString());
          results.push({
            row: row.index,
            code: row.code,
            status: 'created',
            message: 'Đã tạo đơn vị.',
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Lỗi không xác định.';
          results.push({
            row: row.index,
            code: row.code,
            status: 'error',
            message,
          });
        }

        pending.splice(i, 1);
        progressed = true;
      }

      if (!progressed) {
        for (const row of pending) {
          results.push({
            row: row.index,
            code: row.code,
            status: 'error',
            message: 'Không thể resolve đơn vị cha (có thể vòng lặp phụ thuộc).',
          });
        }
        break;
      }
    }

    results.sort((a, b) => a.row - b.row);

    const summary = {
      total: rows.length,
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      errors: results.filter((r) => r.status === 'error').length,
    };

    return {
      message: `Import xong: ${summary.created} tạo mới, ${summary.skipped} bỏ qua, ${summary.errors} lỗi.`,
      data: { summary, results },
    };
  }

  private async resolveTreeFields(parentId?: string | null) {
    if (!parentId) {
      return {
        parentId: null as Types.ObjectId | null,
        ancestors: [] as Types.ObjectId[],
        path: '/',
        depth: 0,
      };
    }

    if (!Types.ObjectId.isValid(parentId)) {
      throw new BadRequestException('Mã đơn vị cha không hợp lệ.');
    }

    const parent = await this.requireDepartment(parentId);

    return {
      parentId: parent._id as Types.ObjectId,
      ancestors: [...parent.ancestors, parent._id as Types.ObjectId],
      path: `${parent.path}${parent._id}/`,
      depth: parent.depth + 1,
    };
  }

  private async rebuildDescendants(
    department: DepartmentDocument,
    oldIdPath: string,
    newIdPath: string,
  ) {
    const descendants = await this.departmentModel.find({
      ancestors: department._id,
    });

    for (const child of descendants) {
      const oldAncestors = child.ancestors.map((a) => a.toString());
      const index = oldAncestors.indexOf(department._id.toString());
      const kept = child.ancestors.slice(index);
      child.ancestors = [...department.ancestors, ...kept];
      child.path = child.path.replace(oldIdPath, newIdPath);
      child.depth = child.ancestors.length;
      await child.save();
    }
  }

  private async requireDepartment(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy đơn vị.');
    }

    const department = await this.departmentModel.findById(id);
    if (!department) {
      throw new NotFoundException('Không tìm thấy đơn vị.');
    }

    return department;
  }
}
