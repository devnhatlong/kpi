import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Role, RoleSchema } from './schemas/role.schema';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { AuthsModule } from '../auth/auth.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Role.name,
        schema: RoleSchema,
      },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => PermissionsModule),
  ],
  exports: [MongooseModule, RolesService],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
