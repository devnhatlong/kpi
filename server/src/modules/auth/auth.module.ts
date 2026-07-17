import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsController } from './auth.controller';
import { AuthsService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { RolesModule } from '../roles/roles.module';
import { LocalStrategy } from './strategies/local.strategy';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtGuard } from './guards/jwt.guard';
import {
  RefreshToken,
  RefreshTokenSchema,
} from './schemas/refresh-token.schema';
import { PermissionsGuard } from '@/common/guards/permissions.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { RefreshTokenCleanupTask } from './tasks/refresh-token-cleanup.task';

@Module({
  controllers: [AuthsController],
  providers: [
    AuthsService,
    LocalStrategy,
    LocalAuthGuard,
    JwtStrategy,
    JwtGuard,
    PermissionsGuard,
    RolesGuard,
    RefreshTokenCleanupTask,
  ],
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => RolesModule),
    MongooseModule.forFeature([
      { name: RefreshToken.name, schema: RefreshTokenSchema },
    ]),
  ],
  exports: [JwtGuard, PermissionsGuard, RolesGuard],
})
export class AuthsModule {}
