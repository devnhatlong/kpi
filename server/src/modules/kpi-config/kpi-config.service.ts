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
import {
  KpiTemplate,
  KpiTemplateDocument,
  TemplateColumnDataType,
  TemplateHeaderGroup,
  TemplateVisibilityScope,
} from './schemas/kpi-template.schema';
import { Role, RoleDocument } from '../roles/schemas/role.schema';
import { CreateKpiTemplateDto } from './dto/create-kpi-template.dto';
import { UpdateKpiTemplateDto } from './dto/update-kpi-template.dto';
import { TemplateColumnDto } from './dto/template-column.dto';
import { TemplateHeaderGroupDto } from './dto/template-header-group.dto';

@Injectable()
export class KpiConfigService {
  constructor(
    @InjectModel(WorkGroup.name)
    private readonly workGroupModel: Model<WorkGroupDocument>,
    @InjectModel(WorkContent.name)
    private readonly workContentModel: Model<WorkContentDocument>,
    @InjectModel(TaskAssignment.name)
    private readonly taskModel: Model<TaskAssignmentDocument>,
    @InjectModel(KpiTemplate.name)
    private readonly templateModel: Model<KpiTemplateDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Role.name)
    private readonly roleModel: Model<RoleDocument>,
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

  async createTemplate(dto: CreateKpiTemplateDto) {
    const code = dto.code.trim().toUpperCase();
    await this.ensureUniqueCode(this.templateModel, code, 'Mã biểu mẫu');
    await this.validateTemplateRelations(dto);
    this.validateTemplateColumns(dto.columns ?? []);

    const data = await this.templateModel.create(
      this.normalizeTemplateInput({ ...dto, code }),
    );
    return { message: 'Tạo biểu mẫu KPI thành công.', data };
  }

  async listTemplates(query: PaginationQueryDto) {
    const filter = this.searchFilter(query.q, ['code', 'name']);
    return this.paginate(this.templateModel, filter, query, {
      updatedAt: -1,
      name: 1,
    });
  }

  async updateTemplate(id: string, dto: UpdateKpiTemplateDto) {
    const template = await this.requireById(
      this.templateModel,
      id,
      'Không tìm thấy biểu mẫu.',
    );
    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      await this.ensureUniqueCode(
        this.templateModel,
        code,
        'Mã biểu mẫu',
        template._id,
      );
      template.code = code;
    }
    if (dto.name !== undefined) template.name = dto.name.trim();
    if (dto.columns !== undefined) {
      this.validateTemplateColumns(dto.columns);
      template.columns = dto.columns.map((item) => ({
        id: item.id.trim(),
        key: item.key.trim(),
        title: item.title.trim(),
        headerPath: item.headerPath ?? [],
        width: item.width,
        visible: item.visible ?? true,
        inputRoleCode:
          item.dataType === TemplateColumnDataType.AUTO_INCREMENT
            ? 'CALCULATED'
            : (item.inputRoleCode?.trim() ?? ''),
        dataType: item.dataType,
        sourceField: item.sourceField ?? '',
      }));
    }
    if (dto.headerGroups !== undefined) {
      template.headerGroups = this.normalizeHeaderGroups(dto.headerGroups);
    }
    if (dto.includedContentIds !== undefined) {
      await this.validateContentIds(dto.includedContentIds);
      template.includedContentIds = dto.includedContentIds.map(
        (value) => new Types.ObjectId(value),
      );
    }
    if (dto.progressWeight !== undefined) {
      template.progressWeight = dto.progressWeight;
    }
    if (dto.qualityWeight !== undefined) {
      template.qualityWeight = dto.qualityWeight;
    }
    if (dto.visibilityScope !== undefined) {
      template.visibilityScope = dto.visibilityScope;
    }
    if (dto.assignedRoleIds !== undefined) {
      await this.validateRoleIds(dto.assignedRoleIds);
      template.assignedRoleIds = dto.assignedRoleIds.map(
        (value) => new Types.ObjectId(value),
      );
    }
    if (dto.assignedUserIds !== undefined) {
      await this.validateUserIds(dto.assignedUserIds);
      template.assignedUserIds = dto.assignedUserIds.map(
        (value) => new Types.ObjectId(value),
      );
    }
    if (dto.isActive !== undefined) template.isActive = dto.isActive;

    const merged = {
      visibilityScope: template.visibilityScope,
      assignedRoleIds: template.assignedRoleIds.map((value) => String(value)),
      assignedUserIds: template.assignedUserIds.map((value) => String(value)),
    };
    await this.validateTemplateRelations(merged);
    await template.save();
    return { message: 'Cập nhật biểu mẫu KPI thành công.', data: template };
  }

  async deleteTemplate(id: string) {
    const template = await this.requireById(
      this.templateModel,
      id,
      'Không tìm thấy biểu mẫu.',
    );
    await template.deleteOne();
    return { message: 'Xoá biểu mẫu KPI thành công.' };
  }

  private normalizeTemplateInput(dto: CreateKpiTemplateDto) {
    return {
      name: dto.name.trim(),
      code: dto.code.trim().toUpperCase(),
      columns: (dto.columns ?? []).map((item) => ({
        id: item.id.trim(),
        key: item.key.trim(),
        title: item.title.trim(),
        headerPath: item.headerPath ?? [],
        width: item.width,
        visible: item.visible ?? true,
        inputRoleCode:
          item.dataType === TemplateColumnDataType.AUTO_INCREMENT
            ? 'CALCULATED'
            : (item.inputRoleCode?.trim() ?? ''),
        dataType: item.dataType,
      })),
      headerGroups: this.normalizeHeaderGroups(dto.headerGroups ?? []),
      includedContentIds: (dto.includedContentIds ?? []).map(
        (value) => new Types.ObjectId(value),
      ),
      progressWeight: dto.progressWeight ?? 50,
      qualityWeight: dto.qualityWeight ?? 50,
      visibilityScope: dto.visibilityScope ?? TemplateVisibilityScope.ALL,
      assignedRoleIds: (dto.assignedRoleIds ?? []).map(
        (value) => new Types.ObjectId(value),
      ),
      assignedUserIds: (dto.assignedUserIds ?? []).map(
        (value) => new Types.ObjectId(value),
      ),
      isActive: dto.isActive ?? true,
    };
  }

  private normalizeHeaderGroups(
    groups: TemplateHeaderGroupDto[],
  ): TemplateHeaderGroup[] {
    return groups.map((group) => ({
      id: group.id.trim(),
      name: group.name.trim(),
      children: this.normalizeHeaderGroups(group.children ?? []),
    }));
  }

  private validateTemplateColumns(columns: TemplateColumnDto[]) {
    if (!columns.length) return;
    const keys = columns.map((item) => item.key.trim());
    if (keys.some((key) => !key)) {
      throw new BadRequestException('Mã trường không được để trống.');
    }
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Mã trường phải duy nhất trong biểu mẫu.');
    }
    if (columns.some((item) => !item.title.trim())) {
      throw new BadRequestException('Nhãn cột không được để trống.');
    }
    const autoIncrementCount = columns.filter(
      (item) => item.dataType === TemplateColumnDataType.AUTO_INCREMENT,
    ).length;
    if (autoIncrementCount > 1) {
      throw new BadRequestException(
        'Mỗi biểu mẫu chỉ được có một cột STT tự tăng.',
      );
    }
    if (
      columns.some(
        (item) =>
          item.dataType !== TemplateColumnDataType.AUTO_INCREMENT &&
          !item.inputRoleCode?.trim(),
      )
    ) {
      throw new BadRequestException(
        'Mỗi cột phải chọn role nhập hoặc công thức tự động.',
      );
    }
  }

  private async validateTemplateRelations(dto: {
    visibilityScope?: TemplateVisibilityScope;
    assignedRoleIds?: string[];
    assignedUserIds?: string[];
    includedContentIds?: string[];
  }) {
    if (
      dto.visibilityScope === TemplateVisibilityScope.ROLES &&
      !dto.assignedRoleIds?.length
    ) {
      throw new BadRequestException('Vui lòng chọn ít nhất một role.');
    }
    if (
      dto.visibilityScope === TemplateVisibilityScope.USERS &&
      !dto.assignedUserIds?.length
    ) {
      throw new BadRequestException('Vui lòng chọn ít nhất một tài khoản.');
    }
    if (dto.includedContentIds?.length) {
      await this.validateContentIds(dto.includedContentIds);
    }
    if (dto.assignedRoleIds?.length) {
      await this.validateRoleIds(dto.assignedRoleIds);
    }
    if (dto.assignedUserIds?.length) {
      await this.validateUserIds(dto.assignedUserIds);
    }
  }

  private async validateContentIds(ids: string[]) {
    for (const id of ids) {
      await this.requireById(
        this.workContentModel,
        id,
        'Không tìm thấy nội dung công việc.',
      );
    }
  }

  private async validateRoleIds(ids: string[]) {
    for (const id of ids) {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Role không hợp lệ.');
      }
      const role = await this.roleModel.exists({ _id: id, isActive: true });
      if (!role) throw new BadRequestException('Role không tồn tại hoặc đã ngừng.');
    }
  }

  private async validateUserIds(ids: string[]) {
    for (const id of ids) {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Tài khoản không hợp lệ.');
      }
      const user = await this.userModel.exists({ _id: id, isActive: true });
      if (!user) {
        throw new BadRequestException('Tài khoản không tồn tại hoặc đã ngừng.');
      }
    }
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
