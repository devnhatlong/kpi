import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthsModule } from '../auth/auth.module';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import { Axis, AxisSchema } from '../mission-form-config/schemas/axis.schema';
import {
  Criterion,
  CriterionSchema,
} from '../mission-form-config/schemas/criterion.schema';
import {
  FormTemplate,
  FormTemplateSchema,
} from '../mission-form-config/schemas/form-template.schema';
import { PersonalMissionModule } from '../personal-mission/personal-mission.module';
import {
  PersonalMissionItem,
  PersonalMissionItemSchema,
} from '../personal-mission/schemas/personal-mission-item.schema';
import { RolesModule } from '../roles/roles.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { MissionSummaryReportsController } from './mission-summary-reports.controller';
import { MissionSummaryReportsService } from './mission-summary-reports.service';
import {
  MissionSummaryReport,
  MissionSummaryReportSchema,
} from './schemas/mission-summary-report.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MissionSummaryReport.name, schema: MissionSummaryReportSchema },
      { name: PersonalMissionItem.name, schema: PersonalMissionItemSchema },
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
      // Nhiệm vụ tự nhập chọn trục từ danh mục, nên cần model Trục ở đây.
      { name: Axis.name, schema: AxisSchema },
      // Khối A chụp lại tên và điểm tối đa của tiêu chí lúc chấm, và đọc mẫu
      // `forCriteria` để biết bảng có những cột nào mà kiểm.
      { name: Criterion.name, schema: CriterionSchema },
      { name: FormTemplate.name, schema: FormTemplateSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
    // Dùng lại cách gom Trục → Nội dung và bộ cột mẫu đã khoá của bảng tổng,
    // để báo cáo tổng không dựng bảng theo một luật khác.
    forwardRef(() => PersonalMissionModule),
  ],
  controllers: [MissionSummaryReportsController],
  providers: [MissionSummaryReportsService],
  exports: [MissionSummaryReportsService],
})
export class MissionSummaryReportsModule {}
