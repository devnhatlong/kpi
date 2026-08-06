import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { Role, RoleSchema } from '../roles/schemas/role.schema';
import {
  KpiScopeConfig,
  KpiScopeConfigSchema,
} from './schemas/kpi-scope-config.schema';
import { KpiScopeConfigController } from './kpi-scope-config.controller';
import { KpiScopeConfigService } from './kpi-scope-config.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KpiScopeConfig.name, schema: KpiScopeConfigSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [KpiScopeConfigController],
  providers: [KpiScopeConfigService],
  exports: [KpiScopeConfigService],
})
export class KpiScopeConfigModule {}
