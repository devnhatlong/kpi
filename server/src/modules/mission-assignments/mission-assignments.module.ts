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
import { Axis, AxisSchema } from '../mission-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentSchema,
} from '../mission-form-config/schemas/work-content.schema';
import {
  ScoreGroup,
  ScoreGroupSchema,
} from '../mission-form-config/schemas/score-group.schema';
import {
  MissionAssignment,
  MissionAssignmentSchema,
} from './schemas/mission-assignment.schema';
import { MissionScopeConfigModule } from '../mission-scope-config/mission-scope-config.module';
import { MissionAssignmentsController } from './mission-assignments.controller';
import { MissionAssignmentsService } from './mission-assignments.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MissionAssignment.name, schema: MissionAssignmentSchema },
      { name: Department.name, schema: DepartmentSchema },
      { name: DepartmentLevel.name, schema: DepartmentLevelSchema },
      { name: User.name, schema: UserSchema },
      { name: Axis.name, schema: AxisSchema },
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: ScoreGroup.name, schema: ScoreGroupSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
    MissionScopeConfigModule,
  ],
  controllers: [MissionAssignmentsController],
  providers: [MissionAssignmentsService],
  exports: [MissionAssignmentsService],
})
export class MissionAssignmentsModule {}
