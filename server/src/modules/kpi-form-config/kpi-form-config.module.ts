import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthsModule } from '../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import {
  WorkContent,
  WorkContentSchema,
} from './schemas/work-content.schema';
import {
  ContentGroup,
  ContentGroupSchema,
} from './schemas/content-group.schema';
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
import { ContentGroupsController } from './content-groups.controller';
import { ContentGroupsService } from './content-groups.service';
import { AxesController } from './axes.controller';
import { AxesService } from './axes.service';
import { ScoreGroupsController } from './score-groups.controller';
import { ScoreGroupsService } from './score-groups.service';
import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: ContentGroup.name, schema: ContentGroupSchema },
      { name: Axis.name, schema: AxisSchema },
      { name: ScoreGroup.name, schema: ScoreGroupSchema },
      { name: FormTemplate.name, schema: FormTemplateSchema },
      { name: FormTemplateVersion.name, schema: FormTemplateVersionSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [
    WorkContentsController,
    ContentGroupsController,
    AxesController,
    ScoreGroupsController,
    FormTemplatesController,
  ],
  providers: [
    WorkContentsService,
    ContentGroupsService,
    AxesService,
    ScoreGroupsService,
    FormTemplatesService,
  ],
  exports: [
    WorkContentsService,
    ContentGroupsService,
    AxesService,
    ScoreGroupsService,
    FormTemplatesService,
  ],
})
export class KpiFormConfigModule {}
