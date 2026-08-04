import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { Axis, AxisSchema } from '../kpi-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentSchema,
} from '../kpi-form-config/schemas/work-content.schema';
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
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [PersonalKpiController],
  providers: [PersonalKpiService],
  exports: [PersonalKpiService],
})
export class PersonalKpiModule {}
