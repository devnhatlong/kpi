import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  PermissionEntity,
  PermissionSchema,
} from './schemas/permission.schema';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: PermissionEntity.name,
        schema: PermissionSchema,
      },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  exports: [MongooseModule, PermissionsService],
  controllers: [PermissionsController],
  providers: [PermissionsService],
})
export class PermissionsModule {}
