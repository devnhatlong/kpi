import { Module } from '@nestjs/common';
import { AuthsController } from './auth.controller';
import { AuthsService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { LocalStrategy } from './strategies/local.strategy';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtGuard } from './guards/jwt.guard';

@Module({
  controllers: [AuthsController],
  providers: [AuthsService, LocalStrategy, LocalAuthGuard, JwtStrategy, JwtGuard],
  imports: [UsersModule],
  exports: [JwtGuard]
})
export class AuthsModule { }
