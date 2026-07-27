import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '@/common/dto/pagination-query.dto';
import { TaskStatus } from '../schemas/task-assignment.schema';

export class WorkContentListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsMongoId({ message: 'Nhóm công việc không hợp lệ.' })
  groupId?: string;
}

export class TaskAssignmentListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsMongoId({ message: 'Nội dung công việc không hợp lệ.' })
  contentId?: string;

  @IsOptional()
  @IsMongoId({ message: 'Người thực hiện không hợp lệ.' })
  assigneeId?: string;

  @IsOptional()
  @IsMongoId({ message: 'Sheet KPI không hợp lệ.' })
  sheetId?: string;

  @IsOptional()
  @IsMongoId({ message: 'Đơn vị không hợp lệ.' })
  ownerDepartmentId?: string;

  @IsOptional()
  @IsEnum(TaskStatus, { message: 'Trạng thái nhiệm vụ không hợp lệ.' })
  status?: TaskStatus;
}
