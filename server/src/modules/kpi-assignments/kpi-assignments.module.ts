import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  DepartmentLevel,
  DepartmentLevelSchema,
} from '../department-levels/schemas/department-level.schema';
import { Axis, AxisSchema } from '../kpi-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentSchema,
} from '../kpi-form-config/schemas/work-content.schema';
import {
  ScoreGroup,
  ScoreGroupSchema,
} from '../kpi-form-config/schemas/score-group.schema';
import {
  KpiAssignment,
  KpiAssignmentSchema,
} from './schemas/kpi-assignment.schema';
import { KpiScopeConfigModule } from '../kpi-scope-config/kpi-scope-config.module';
import { KpiAssignmentsController } from './kpi-assignments.controller';
import { KpiAssignmentsService } from './kpi-assignments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KpiAssignment.name, schema: KpiAssignmentSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: DepartmentLevel.name, schema: DepartmentLevelSchema },
      { name: User.name, schema: UserSchema },
      { name: Axis.name, schema: AxisSchema },
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: ScoreGroup.name, schema: ScoreGroupSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
    KpiScopeConfigModule,
  ],
  controllers: [KpiAssignmentsController],
  providers: [KpiAssignmentsService],
  exports: [KpiAssignmentsService],
})
export class KpiAssignmentsModule {}
