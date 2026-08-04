import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { Axis, AxisSchema } from '../kpi-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentSchema,
} from '../kpi-form-config/schemas/work-content.schema';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PersonalKpiController } from './personal-kpi.controller';
import { PersonalKpiService } from './personal-kpi.service';
import {
  PersonalKpiItem,
  PersonalKpiItemSchema,
} from './schemas/personal-kpi-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PersonalKpiItem.name, schema: PersonalKpiItemSchema },
      { name: Axis.name, schema: AxisSchema },
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [PersonalKpiController],
  providers: [PersonalKpiService],
  exports: [PersonalKpiService],
})
export class PersonalKpiModule {}
