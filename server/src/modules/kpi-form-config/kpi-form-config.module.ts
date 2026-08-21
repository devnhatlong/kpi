import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import {
  WorkContent,
  WorkContentSchema,
} from './schemas/work-content.schema';
import { Axis, AxisSchema } from './schemas/axis.schema';
import {
  ScoreGroup,
  ScoreGroupSchema,
} from './schemas/score-group.schema';
import {
  FormTemplate,
  FormTemplateSchema,
} from './schemas/form-template.schema';
import {
  FormTemplateVersion,
  FormTemplateVersionSchema,
} from './schemas/form-template-version.schema';
import { WorkContentsController } from './work-contents.controller';
import { WorkContentsService } from './work-contents.service';
import { AxesController } from './axes.controller';
import { AxesService } from './axes.service';
import { ScoreGroupsController } from './score-groups.controller';
import { ScoreGroupsService } from './score-groups.service';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';
import { QualityLevelsController } from './quality-levels.controller';
import { QualityLevelsService } from './quality-levels.service';
import {
  QualityLevel,
  QualityLevelSchema,
} from './schemas/quality-level.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: Axis.name, schema: AxisSchema },
      { name: ScoreGroup.name, schema: ScoreGroupSchema },
      { name: FormTemplate.name, schema: FormTemplateSchema },
      { name: FormTemplateVersion.name, schema: FormTemplateVersionSchema },
      { name: QualityLevel.name, schema: QualityLevelSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [
    WorkContentsController,
    AxesController,
    ScoreGroupsController,
    FormTemplatesController,
    QualityLevelsController,
  ],
  providers: [
    WorkContentsService,
    AxesService,
    ScoreGroupsService,
    FormTemplatesService,
    QualityLevelsService,
  ],
  exports: [
    WorkContentsService,
    AxesService,
    ScoreGroupsService,
    FormTemplatesService,
    QualityLevelsService,
  ],
})
export class KpiFormConfigModule {}
