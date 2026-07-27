import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { DepartmentsModule } from '../departments/departments.module';
import { DepartmentLevelsModule } from '../department-levels/department-levels.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { KpiConfigController } from './kpi-config.controller';
import { ServerTimeController } from './server-time.controller';
import { KpiConfigService } from './kpi-config.service';
import { KpiWorkflowService } from './kpi-workflow.service';
import { KpiMasterFormService } from './kpi-master-form.service';
import { WorkGroup, WorkGroupSchema } from './schemas/work-group.schema';
import { WorkContent, WorkContentSchema } from './schemas/work-content.schema';
import {
  TaskAssignment,
  TaskAssignmentSchema,
} from './schemas/task-assignment.schema';
import { KpiTemplate, KpiTemplateSchema } from './schemas/kpi-template.schema';
import { KpiPeriod, KpiPeriodSchema } from './schemas/kpi-period.schema';
import {
  UnitKpiSheet,
  UnitKpiSheetSchema,
} from './schemas/unit-kpi-sheet.schema';
import {
  UnitHandoff,
  UnitHandoffSchema,
} from './schemas/unit-handoff.schema';
import {
  KpiMasterForm,
  KpiMasterFormSchema,
} from './schemas/kpi-master-form.schema';
import { Role, RoleSchema } from '../roles/schemas/role.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkGroup.name, schema: WorkGroupSchema },
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: TaskAssignment.name, schema: TaskAssignmentSchema },
      { name: KpiTemplate.name, schema: KpiTemplateSchema },
      { name: KpiPeriod.name, schema: KpiPeriodSchema },
      { name: UnitKpiSheet.name, schema: UnitKpiSheetSchema },
      { name: UnitHandoff.name, schema: UnitHandoffSchema },
      { name: KpiMasterForm.name, schema: KpiMasterFormSchema },
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
    DepartmentsModule,
    DepartmentLevelsModule,
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [KpiConfigController, ServerTimeController],
  providers: [KpiConfigService, KpiWorkflowService, KpiMasterFormService],
  exports: [KpiConfigService, KpiWorkflowService, KpiMasterFormService],
})
export class KpiConfigModule {}
