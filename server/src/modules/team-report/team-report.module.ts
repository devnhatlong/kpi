import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { Role, RoleSchema } from '../roles/schemas/role.schema';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  WorkContent,
  WorkContentSchema,
} from '../mission-form-config/schemas/work-content.schema';
import {
  ScoreGroup,
  ScoreGroupSchema,
} from '../mission-form-config/schemas/score-group.schema';
import { Axis, AxisSchema } from '../mission-form-config/schemas/axis.schema';
import {
  WorkTask,
  WorkTaskSchema,
} from '../mission-form-config/schemas/work-task.schema';
import {
  QualityLevel,
  QualityLevelSchema,
} from '../mission-form-config/schemas/quality-level.schema';
import {
  Criterion,
  CriterionSchema,
} from '../mission-form-config/schemas/criterion.schema';
import {
  FormTemplate,
  FormTemplateSchema,
} from '../mission-form-config/schemas/form-template.schema';
import { MissionFormConfigModule } from '../mission-form-config/mission-form-config.module';
import {
  TeamReportTask,
  TeamReportTaskSchema,
} from './schemas/team-report-task.schema';
import {
  TeamReportDay,
  TeamReportDaySchema,
} from './schemas/team-report-day.schema';
import {
  TeamReportUnitDay,
  TeamReportUnitDaySchema,
} from './schemas/team-report-unit-day.schema';
import { TeamReportController } from './team-report.controller';
import { TeamReportService } from './team-report.service';

/**
 * Báo cáo ngày cấp đội - bản nghiệp vụ mới, tách hẳn khỏi `personal-mission`.
 *
 * Module này chỉ ĐỌC danh mục dùng chung (nội dung công việc, nhóm điểm) và hạ
 * tầng (người dùng, đơn vị). Không đọc, không ghi vào bất kỳ collection nào của
 * bản nghiệp vụ cũ - hai bản phải bật tắt độc lập với nhau.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TeamReportTask.name, schema: TeamReportTaskSchema },
      { name: TeamReportDay.name, schema: TeamReportDaySchema },
      { name: TeamReportUnitDay.name, schema: TeamReportUnitDaySchema },
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: ScoreGroup.name, schema: ScoreGroupSchema },
      { name: Axis.name, schema: AxisSchema },
      { name: WorkTask.name, schema: WorkTaskSchema },
      { name: QualityLevel.name, schema: QualityLevelSchema },
      { name: Criterion.name, schema: CriterionSchema },
      { name: FormTemplate.name, schema: FormTemplateSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
    // Chỉ để dùng lại FormTemplatesService.resolveVersion - tra đúng bộ cột của
    // phiên bản mẫu đã đóng dấu, kể cả khi mẫu đã bị sửa sau đó.
    forwardRef(() => MissionFormConfigModule),
  ],
  controllers: [TeamReportController],
  providers: [TeamReportService],
  exports: [TeamReportService],
})
export class TeamReportModule {}
