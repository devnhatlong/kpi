import { Module } from '@nestjs/common';
import { AuthsController } from './auth.controller';
import { AuthsService } from './auth.service';
import { UsersModule } from '../users/users.module';
import { LocalStrategy } from './strategies/local.strategy';
import { LocalAuthGuard } from './guards/local-auth.guard';

@Module({
  controllers: [AuthsController],
  providers: [AuthsService, LocalStrategy, LocalAuthGuard],
  imports: [UsersModule]
})
export class AuthsModule { }
