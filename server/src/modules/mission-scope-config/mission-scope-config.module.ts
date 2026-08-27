import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { Role, RoleSchema } from '../roles/schemas/role.schema';
import {
  MissionScopeConfig,
  MissionScopeConfigSchema,
} from './schemas/mission-scope-config.schema';
import { MissionScopeConfigController } from './mission-scope-config.controller';
import { MissionScopeConfigService } from './mission-scope-config.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MissionScopeConfig.name, schema: MissionScopeConfigSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [MissionScopeConfigController],
  providers: [MissionScopeConfigService],
  exports: [MissionScopeConfigService],
})
export class MissionScopeConfigModule {}
