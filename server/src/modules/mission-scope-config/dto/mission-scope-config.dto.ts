import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { BooleanNotRequired, StringRequired } from '@/common/decorators';
import { MISSION_SCOPES, type MissionScope } from '../mission-scope.constants';

export class MissionScopeConfigItemDto {
  @StringRequired('Mã vai trò', { example: 'UNIT_ADMIN' })
  roleCode!: string;

  @BooleanNotRequired('Vai trò này được giao nhiệm vụ', { example: true })
  isEnabled?: boolean;

  @ApiProperty({ enum: MISSION_SCOPES, isArray: true })
  @IsArray()
  @IsEnum(MISSION_SCOPES, { each: true, message: 'Phạm vi không hợp lệ.' })
  scopes!: MissionScope[];

  @BooleanNotRequired('Kết quả cần cấp trên duyệt', { example: true })
  requireApproval?: boolean;

  @StringRequired('Ghi chú nội bộ', { example: '' })
  note!: string;
}

export class SaveMissionScopeConfigDto {
  @ApiProperty({ type: [MissionScopeConfigItemDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Chưa có cấu hình nào để lưu.' })
  @ValidateNested({ each: true })
  @Type(() => MissionScopeConfigItemDto)
  items!: MissionScopeConfigItemDto[];
}
