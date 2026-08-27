import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { Axis, AxisSchema } from '../mission-form-config/schemas/axis.schema';
import {
  WorkContent,
  WorkContentSchema,
} from '../mission-form-config/schemas/work-content.schema';
import {
  Department,
  DepartmentSchema,
} from '../departments/schemas/department.schema';
import {
  FormTemplate,
  FormTemplateSchema,
} from '../mission-form-config/schemas/form-template.schema';
import {
  WorkTask,
  WorkTaskSchema,
} from '../mission-form-config/schemas/work-task.schema';
import {
  ScoreGroup,
  ScoreGroupSchema,
} from '../mission-form-config/schemas/score-group.schema';
import {
  QualityLevel,
  QualityLevelSchema,
} from '../mission-form-config/schemas/quality-level.schema';
import { MissionFormConfigModule } from '../mission-form-config/mission-form-config.module';
import { UploadsModule } from '../uploads/uploads.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PersonalMissionController } from './personal-mission.controller';
import { PersonalMissionService } from './personal-mission.service';
import {
  PersonalMissionItem,
  PersonalMissionItemSchema,
} from './schemas/personal-mission-item.schema';
import {
  PersonalMissionSubmission,
  PersonalMissionSubmissionSchema,
} from './schemas/personal-mission-submission.schema';
import {
  PersonalMissionCriteriaSheet,
  PersonalMissionCriteriaSheetSchema,
} from './schemas/personal-mission-criteria-sheet.schema';
import {
  Criterion,
  CriterionSchema,
} from '../mission-form-config/schemas/criterion.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PersonalMissionItem.name, schema: PersonalMissionItemSchema },
      {
        name: PersonalMissionSubmission.name,
        schema: PersonalMissionSubmissionSchema,
      },
      { name: Axis.name, schema: AxisSchema },
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: FormTemplate.name, schema: FormTemplateSchema },
      { name: WorkTask.name, schema: WorkTaskSchema },
      { name: ScoreGroup.name, schema: ScoreGroupSchema },
      { name: QualityLevel.name, schema: QualityLevelSchema },
      { name: User.name, schema: UserSchema },
      { name: Department.name, schema: DepartmentSchema },
      // Khối A của báo cáo cá nhân: danh mục tiêu chí + bảng cán bộ tự chấm.
      { name: Criterion.name, schema: CriterionSchema },
      {
        name: PersonalMissionCriteriaSheet.name,
        schema: PersonalMissionCriteriaSheetSchema,
      },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
    // Lấy FormTemplatesService để dựng lại đúng phiên bản mẫu lúc gửi.
    forwardRef(() => MissionFormConfigModule),
    // Kiểm tệp đính kèm có thật trước khi lưu vào nhiệm vụ.
    forwardRef(() => UploadsModule),
  ],
  controllers: [PersonalMissionController],
  providers: [PersonalMissionService],
  exports: [PersonalMissionService],
})
export class PersonalMissionModule {}
