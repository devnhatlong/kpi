import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { Axis, AxisSchema } from '../kpi-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentSchema,
} from '../kpi-form-config/schemas/work-content.schema';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import {
  FormTemplate,
  FormTemplateSchema,
} from '../kpi-form-config/schemas/form-template.schema';
import { KpiFormConfigModule } from '../kpi-form-config/kpi-form-config.module';
import { UploadsModule } from '../uploads/uploads.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PersonalKpiController } from './personal-kpi.controller';
import { PersonalKpiService } from './personal-kpi.service';
import {
  PersonalKpiItem,
  PersonalKpiItemSchema,
} from './schemas/personal-kpi-item.schema';
import {
  PersonalKpiSubmission,
  PersonalKpiSubmissionSchema,
} from './schemas/personal-kpi-submission.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PersonalKpiItem.name, schema: PersonalKpiItemSchema },
      { name: PersonalKpiSubmission.name, schema: PersonalKpiSubmissionSchema },
      { name: Axis.name, schema: AxisSchema },
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: FormTemplate.name, schema: FormTemplateSchema },
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
    // Lấy FormTemplatesService để dựng lại đúng phiên bản mẫu lúc gửi.
    forwardRef(() => KpiFormConfigModule),
    // Kiểm tệp đính kèm có thật trước khi lưu vào nhiệm vụ.
    forwardRef(() => UploadsModule),
  ],
  controllers: [PersonalKpiController],
  providers: [PersonalKpiService],
  exports: [PersonalKpiService],
})
export class PersonalKpiModule {}
