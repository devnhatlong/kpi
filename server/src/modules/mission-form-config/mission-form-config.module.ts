import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { WorkContent, WorkContentSchema } from './schemas/work-content.schema';
import { WorkTask, WorkTaskSchema } from './schemas/work-task.schema';
import { Criterion, CriterionSchema } from './schemas/criterion.schema';
import { Axis, AxisSchema } from './schemas/axis.schema';
import { ScoreGroup, ScoreGroupSchema } from './schemas/score-group.schema';
import {
  FormTemplate,
  FormTemplateSchema,
} from './schemas/form-template.schema';
import {
  FormTemplateVersion,
  FormTemplateVersionSchema,
} from './schemas/form-template-version.schema';
import {
  ReportTemplate,
  ReportTemplateSchema,
} from './schemas/report-template.schema';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import {
  DepartmentLevel,
  DepartmentLevelSchema,
} from '../department-levels/schemas/department-level.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { WorkContentsController } from './work-contents.controller';
import { WorkContentsService } from './work-contents.service';
import { WorkTasksController } from './work-tasks.controller';
import { WorkTasksService } from './work-tasks.service';
import { AxesController } from './axes.controller';
import { AxesService } from './axes.service';
import { ScoreGroupsController } from './score-groups.controller';
import { ScoreGroupsService } from './score-groups.service';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';
import { QualityLevelsController } from './quality-levels.controller';
import { QualityLevelsService } from './quality-levels.service';
import { CriteriaController } from './criteria.controller';
import { CriteriaService } from './criteria.service';
import { ReportTemplatesController } from './report-templates.controller';
import { ReportTemplatesService } from './report-templates.service';
import {
  QualityLevel,
  QualityLevelSchema,
} from './schemas/quality-level.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: WorkTask.name, schema: WorkTaskSchema },
      { name: Axis.name, schema: AxisSchema },
      { name: ScoreGroup.name, schema: ScoreGroupSchema },
      { name: FormTemplate.name, schema: FormTemplateSchema },
      { name: FormTemplateVersion.name, schema: FormTemplateVersionSchema },
      { name: QualityLevel.name, schema: QualityLevelSchema },
      { name: Criterion.name, schema: CriterionSchema },
      { name: ReportTemplate.name, schema: ReportTemplateSchema },
      // Mẫu báo cáo phải soi cây đơn vị và hồ sơ người dùng để biết đơn vị nào
      // dùng mẫu nào - đăng ký model tại chỗ như personal-mission vẫn làm.
      { name: Department.name, schema: DepartmentSchema },
      { name: DepartmentLevel.name, schema: DepartmentLevelSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [
    WorkContentsController,
    WorkTasksController,
    AxesController,
    ScoreGroupsController,
    FormTemplatesController,
    QualityLevelsController,
    CriteriaController,
    ReportTemplatesController,
  ],
  providers: [
    WorkContentsService,
    WorkTasksService,
    AxesService,
    ScoreGroupsService,
    FormTemplatesService,
    QualityLevelsService,
    CriteriaService,
    ReportTemplatesService,
  ],
  exports: [
    WorkContentsService,
    WorkTasksService,
    AxesService,
    ScoreGroupsService,
    FormTemplatesService,
    QualityLevelsService,
    CriteriaService,
    ReportTemplatesService,
  ],
})
export class MissionFormConfigModule {}
