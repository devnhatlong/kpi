import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { KpiConfigController } from './kpi-config.controller';
import { KpiConfigService } from './kpi-config.service';
import { WorkGroup, WorkGroupSchema } from './schemas/work-group.schema';
import { WorkContent, WorkContentSchema } from './schemas/work-content.schema';
import {
  TaskAssignment,
  TaskAssignmentSchema,
} from './schemas/task-assignment.schema';
import { KpiTemplate, KpiTemplateSchema } from './schemas/kpi-template.schema';
import { Role, RoleSchema } from '../roles/schemas/role.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkGroup.name, schema: WorkGroupSchema },
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: TaskAssignment.name, schema: TaskAssignmentSchema },
      { name: KpiTemplate.name, schema: KpiTemplateSchema },
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [KpiConfigController],
  providers: [KpiConfigService],
  exports: [KpiConfigService],
})
export class KpiConfigModule {}
