import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { buildPaginatedResponse } from '@/common/utils/pagination.util';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateWorkGroupDto } from './dto/create-work-group.dto';
import { UpdateWorkGroupDto } from './dto/update-work-group.dto';
import { CreateWorkContentDto } from './dto/create-work-content.dto';
import { UpdateWorkContentDto } from './dto/update-work-content.dto';
import { CreateTaskAssignmentDto } from './dto/create-task-assignment.dto';
import { UpdateTaskAssignmentDto } from './dto/update-task-assignment.dto';
import {
  TaskAssignmentListQueryDto,
  WorkContentListQueryDto,
} from './dto/kpi-list-query.dto';
import { WorkGroup, WorkGroupDocument } from './schemas/work-group.schema';
import {
  WorkContent,
  WorkContentDocument,
} from './schemas/work-content.schema';
import {
  TaskAssignment,
  TaskAssignmentDocument,
} from './schemas/task-assignment.schema';

@Injectable()
export class KpiConfigService {
  constructor(
    @InjectModel(WorkGroup.name)
    private readonly workGroupModel: Model<WorkGroupDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(TaskAssignment.name)
    private readonly taskModel: Model<TaskAssignmentDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async createGroup(dto: CreateWorkGroupDto) {
    const code = dto.code.trim().toUpperCase();
    await this.ensureUniqueCode(this.workGroupModel, code, 'Mã nhóm công việc');
    const data = await this.workGroupModel.create({
      ...dto,
      code,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    return { message: 'Tạo nhóm công việc thành công.', data };
  }

  async listGroups(query: PaginationQueryDto) {
    const filter = this.searchFilter(query.q, ['code', 'name', 'description']);
    return this.paginate(this.workGroupModel, filter, query, {
      sortOrder: 1,
      name: 1,
    });
  }

  async updateGroup(id: string, dto: UpdateWorkGroupDto) {
    const group = await this.requireById(
      this.workGroupModel,
      id,
      'Không tìm thấy nhóm công việc.',
    );
    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      await this.ensureUniqueCode(
        this.workGroupModel,
        code,
        'Mã nhóm công việc',
        group._id,
      );
      group.code = code;
    }
    if (dto.name !== undefined) group.name = dto.name.trim();
    if (dto.description !== undefined)
      group.description = dto.description.trim();
    if (dto.sortOrder !== undefined) group.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) group.isActive = dto.isActive;
    await group.save();
    return { message: 'Cập nhật nhóm công việc thành công.', data: group };
  }

  async deleteGroup(id: string) {
    const group = await this.requireById(
      this.workGroupModel,
      id,
      'Không tìm thấy nhóm công việc.',
    );
    if (await this.workContentModel.exists({ groupId: group._id })) {
      throw new BadRequestException(
        'Không thể xoá nhóm đang có nội dung công việc.',
      );
    }
    await group.deleteOne();
    return { message: 'Xoá nhóm công việc thành công.' };
  }

  async createContent(dto: CreateWorkContentDto) {
    await this.requireById(
      this.workGroupModel,
      dto.groupId,
      'Không tìm thấy nhóm công việc.',
    );
    const code = dto.code.trim().toUpperCase();
    await this.ensureUniqueCode(
      this.workContentModel,
      code,
      'Mã nội dung công việc',
    );
    const data = await this.workContentModel.create({
      ...dto,
      code,
      groupId: new Types.ObjectId(dto.groupId),
      name: dto.name.trim(),
      description: dto.description?.trim() ?? '',
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
    });
    await data.populate('groupId', 'code name');
    return { message: 'Tạo nội dung công việc thành công.', data };
  }

  async listContents(query: WorkContentListQueryDto) {
    const filter: Record<string, unknown> = {
      ...this.searchFilter(query.q, ['code', 'name', 'description']),
    };
    if (query.groupId) filter.groupId = new Types.ObjectId(query.groupId);
    return this.paginate(
      this.workContentModel,
      filter,
      query,
      { sortOrder: 1, name: 1 },
      [{ path: 'groupId', select: 'code name' }],
    );
  }

  async updateContent(id: string, dto: UpdateWorkContentDto) {
    const content = await this.requireById(
      this.workContentModel,
      id,
      'Không tìm thấy nội dung công việc.',
    );
    if (dto.groupId !== undefined) {
      await this.requireById(
        this.workGroupModel,
        dto.groupId,
        'Không tìm thấy nhóm công việc.',
      );
      content.groupId = new Types.ObjectId(dto.groupId);
    }
    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      await this.ensureUniqueCode(
        this.workContentModel,
        code,
        'Mã nội dung công việc',
        content._id,
      );
      content.code = code;
    }
    if (dto.name !== undefined) content.name = dto.name.trim();
    if (dto.description !== undefined)
      content.description = dto.description.trim();
    if (dto.sortOrder !== undefined) content.sortOrder = dto.sortOrder;
    if (dto.isActive !== undefined) content.isActive = dto.isActive;
    await content.save();
    await content.populate('groupId', 'code name');
    return {
      message: 'Cập nhật nội dung công việc thành công.',
      data: content,
    };
  }

  async deleteContent(id: string) {
    const content = await this.requireById(
      this.workContentModel,
      id,
      'Không tìm thấy nội dung công việc.',
    );
    if (await this.taskModel.exists({ contentId: content._id })) {
      throw new BadRequestException(
        'Không thể xoá nội dung đã được dùng để giao nhiệm vụ.',
      );
    }
    await content.deleteOne();
    return { message: 'Xoá nội dung công việc thành công.' };
  }

  async createTask(dto: CreateTaskAssignmentDto, createdBy: string) {
    await this.validateTaskReferences(dto.contentId, dto.assigneeId);
    const data = await this.taskModel.create({
      ...this.normalizeTaskInput(dto),
      createdBy: new Types.ObjectId(createdBy),
    });
    await this.populateTask(data);
    return { message: 'Giao nhiệm vụ thành công.', data };
  }

  async listTasks(query: TaskAssignmentListQueryDto) {
    const filter: Record<string, unknown> = {
      ...this.searchFilter(query.q, ['title', 'description', 'product']),
    };
    if (query.contentId) filter.contentId = new Types.ObjectId(query.contentId);
    if (query.assigneeId)
      filter.assigneeId = new Types.ObjectId(query.assigneeId);
    if (query.status) filter.status = query.status;
    return this.paginate(
      this.taskModel,
      filter,
      query,
      { dueDate: 1, createdAt: -1 },
      [
        {
          path: 'contentId',
          select: 'code name groupId',
          populate: { path: 'groupId', select: 'code name' },
        },
        { path: 'assigneeId', select: 'username fullName departmentId' },
        { path: 'createdBy', select: 'username fullName' },
      ],
    );
  }

  async updateTask(id: string, dto: UpdateTaskAssignmentDto) {
    const task = await this.requireById(
      this.taskModel,
      id,
      'Không tìm thấy nhiệm vụ.',
    );
    const contentId = dto.contentId ?? String(task.contentId);
    const assigneeId = dto.assigneeId ?? String(task.assigneeId);
    await this.validateTaskReferences(contentId, assigneeId);
    Object.assign(task, this.normalizeTaskInput(dto));
    await task.save();
    await this.populateTask(task);
    return { message: 'Cập nhật nhiệm vụ thành công.', data: task };
  }

  async deleteTask(id: string) {
    const task = await this.requireById(
      this.taskModel,
      id,
      'Không tìm thấy nhiệm vụ.',
    );
    await task.deleteOne();
    return { message: 'Xoá nhiệm vụ thành công.' };
  }

  private normalizeTaskInput(
    dto: CreateTaskAssignmentDto | UpdateTaskAssignmentDto,
  ) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.contentId) data.contentId = new Types.ObjectId(dto.contentId);
    if (dto.assigneeId) data.assigneeId = new Types.ObjectId(dto.assigneeId);
    if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
    if (dto.reportDueDate !== undefined) {
      data.reportDueDate = dto.reportDueDate
        ? new Date(dto.reportDueDate)
        : undefined;
    }
    for (const key of [
      'title',
      'description',
      'product',
      'actualProduct',
      'proposedAdjustmentReason',
      'note',
    ]) {
      if (typeof data[key] === 'string') data[key] = data[key].trim();
    }
    return data;
  }

  private async validateTaskReferences(contentId: string, assigneeId: string) {
    await this.requireById(
      this.workContentModel,
      contentId,
      'Không tìm thấy nội dung công việc.',
    );
    const assignee = await this.userModel.exists({
      _id: new Types.ObjectId(assigneeId),
      isActive: true,
    });
    if (!assignee) {
      throw new BadRequestException(
        'Người thực hiện không tồn tại hoặc đã ngừng hoạt động.',
      );
    }
  }

  private populateTask(task: TaskAssignmentDocument) {
    return task.populate([
      {
        path: 'contentId',
        select: 'code name groupId',
        populate: { path: 'groupId', select: 'code name' },
      },
      { path: 'assigneeId', select: 'username fullName departmentId' },
      { path: 'createdBy', select: 'username fullName' },
    ]);
  }

  private searchFilter(q: string | undefined, fields: string[]) {
    if (!q?.trim()) return {};
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    return { $or: fields.map((field) => ({ [field]: regex })) };
  }

  private async paginate<T>(
    model: Model<T>,
    filter: Record<string, unknown>,
    query: PaginationQueryDto,
    sort: Record<string, 1 | -1>,
    populate: Parameters<ReturnType<Model<T>['find']>['populate']>[0] = [],
  ) {
    if (query.all) {
      const data = await model.find(filter).sort(sort).populate(populate);
      return buildPaginatedResponse(data, data.length, 1, data.length || 1);
    }
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const [data, total] = await Promise.all([
      model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(populate),
      model.countDocuments(filter),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  private async ensureUniqueCode<T>(
    model: Model<T>,
    code: string,
    label: string,
    excludeId?: Types.ObjectId,
  ) {
    const filter: Record<string, unknown> = { code };
    if (excludeId) filter._id = { $ne: excludeId };
    if (await model.exists(filter)) {
      throw new BadRequestException(`${label} đã tồn tại.`);
    }
  }

  private async requireById<T>(
    model: Model<T>,
    id: string,
    message: string,
  ): Promise<ReturnType<Model<T>['hydrate']>> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException(message);
    const document = await model.findById(id);
    if (!document) throw new NotFoundException(message);
    return document;
  }
}
