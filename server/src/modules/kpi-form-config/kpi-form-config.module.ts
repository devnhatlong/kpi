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
import {
  ScoreGroup,
  ScoreGroupSchema,
} from './schemas/score-group.schema';
import { WorkContentsController } from './work-contents.controller';
import { WorkContentsService } from './work-contents.service';
import { ContentGroupsController } from './content-groups.controller';
import { ContentGroupsService } from './content-groups.service';
import { ScoreGroupsController } from './score-groups.controller';
import { ScoreGroupsService } from './score-groups.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WorkContent.name, schema: WorkContentSchema },
      { name: ContentGroup.name, schema: ContentGroupSchema },
      { name: ScoreGroup.name, schema: ScoreGroupSchema },
    ]),
    forwardRef(() => AuthsModule),
    forwardRef(() => RolesModule),
  ],
  controllers: [WorkContentsController, ContentGroupsController, ScoreGroupsController],
  providers: [WorkContentsService, ContentGroupsService, ScoreGroupsService],
  exports: [WorkContentsService, ContentGroupsService, ScoreGroupsService],
})
export class KpiFormConfigModule {}
