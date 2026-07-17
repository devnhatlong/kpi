import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DepartmentLevel,
  DepartmentLevelSchema,
} from './schemas/department-level.schema';
import { DepartmentLevelsController } from './department-levels.controller';
import { DepartmentLevelsService } from './department-levels.service';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: DepartmentLevel.name,
        schema: DepartmentLevelSchema,
      },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  exports: [MongooseModule, DepartmentLevelsService],
  controllers: [DepartmentLevelsController],
  providers: [DepartmentLevelsService],
})
export class DepartmentLevelsModule {}
