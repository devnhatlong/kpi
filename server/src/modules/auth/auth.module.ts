import { Module } from '@nestjs/common';
import { AuthsController } from './auth.controller';
import { AuthsService } from './auth.service';
import { UsersModule } from '../users/users.module';

@Module({
  controllers: [AuthsController],
  providers: [AuthsService],
  imports: [UsersModule]
})
export class AuthsModule { }
