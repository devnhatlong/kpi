import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthsModule } from '../auth/auth.module';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import { Axis, AxisSchema } from '../kpi-form-config/schemas/axis.schema';
import { PersonalKpiModule } from '../personal-kpi/personal-kpi.module';
import {
  PersonalKpiItem,
  PersonalKpiItemSchema,
} from '../personal-kpi/schemas/personal-kpi-item.schema';
import { RolesModule } from '../roles/roles.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { KpiSummaryReportsController } from './kpi-summary-reports.controller';
import { KpiSummaryReportsService } from './kpi-summary-reports.service';
import {
  KpiSummaryReport,
  KpiSummaryReportSchema,
} from './schemas/kpi-summary-report.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: KpiSummaryReport.name, schema: KpiSummaryReportSchema },
      { name: PersonalKpiItem.name, schema: PersonalKpiItemSchema },
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
      // Nhiệm vụ tự nhập chọn trục từ danh mục, nên cần model Trục ở đây.
      { name: Axis.name, schema: AxisSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
    // Dùng lại cách gom Trục → Nội dung và bộ cột mẫu đã khoá của bảng tổng,
    // để báo cáo tổng không dựng bảng theo một luật khác.
    forwardRef(() => PersonalKpiModule),
  ],
  controllers: [KpiSummaryReportsController],
  providers: [KpiSummaryReportsService],
  exports: [KpiSummaryReportsService],
})
export class KpiSummaryReportsModule {}
