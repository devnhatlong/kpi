import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Department, DepartmentSchema } from './schemas/department.schema';
import { DepartmentsController } from './departments.controller';
import { DepartmentsService } from './departments.service';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { DepartmentLevelsModule } from '../department-levels/department-levels.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Department.name,
        schema: DepartmentSchema,
      },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
    DepartmentLevelsModule,
  ],
  exports: [MongooseModule, DepartmentsService],
  controllers: [DepartmentsController],
  providers: [DepartmentsService],
})
export class DepartmentsModule {}
