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

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkGroup.name, schema: WorkGroupSchema },
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: TaskAssignment.name, schema: TaskAssignmentSchema },
      { name: User.name, schema: UserSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [KpiConfigController],
  providers: [KpiConfigService],
  exports: [KpiConfigService],
})
export class KpiConfigModule {}
