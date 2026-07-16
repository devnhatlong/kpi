import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DepartmentLevel, DepartmentLevelSchema } from './schemas/department-level.schema';
import { DepartmentLevelsController } from './department-levels.controller';
import { DepartmentLevelsService } from './department-levels.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: DepartmentLevel.name,
        schema: DepartmentLevelSchema,
      },
    ]),
  ],
  exports: [MongooseModule],
  controllers: [DepartmentLevelsController],
  providers: [DepartmentLevelsService],
})
export class DepartmentLevelsModule { }
