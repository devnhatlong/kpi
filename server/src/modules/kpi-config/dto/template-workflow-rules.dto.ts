import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
} from 'class-validator';
import {
  TemplateExecuteMode,
  TemplatePublishMode,
  TemplateTaskCreatorRole,
} from '../schemas/kpi-template.schema';

export class TemplateWorkflowRulesDto {
  @ApiPropertyOptional({ enum: TemplatePublishMode })
  @IsOptional()
  @IsEnum(TemplatePublishMode, {
    message: 'Chế độ phát hành không hợp lệ.',
  })
  publishMode?: TemplatePublishMode;

  @ApiPropertyOptional({ enum: TemplateExecuteMode })
  @IsOptional()
  @IsEnum(TemplateExecuteMode, {
    message: 'Chế độ thực hiện không hợp lệ.',
  })
  executeMode?: TemplateExecuteMode;

  @ApiPropertyOptional({
    enum: TemplateTaskCreatorRole,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(TemplateTaskCreatorRole, {
    each: true,
    message: 'Vai trò tạo nhiệm vụ không hợp lệ.',
  })
  taskCreators?: TemplateTaskCreatorRole[];

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  contentColumnLocked?: boolean;
}
