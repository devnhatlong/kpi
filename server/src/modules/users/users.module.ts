import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import {
  RefreshToken,
  RefreshTokenSchema,
} from '../auth/schemas/refresh-token.schema';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: Department.name,
        schema: DepartmentSchema,
      },
      // Đặt lại mật khẩu thì thu hồi phiên - xem UsersService.update.
      {
        name: RefreshToken.name,
        schema: RefreshTokenSchema,
      },
    ]),
    forwardRef(() => AuthsModule),
    // PermissionsGuard cần RolesService khi được resolve trong UsersModule
    forwardRef(() => RolesModule),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService, MongooseModule],
})
export class UsersModule {}
