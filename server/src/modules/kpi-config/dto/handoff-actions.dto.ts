import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsMongoId, IsOptional } from 'class-validator';
import { StringNotRequired } from '@/common/decorators';

export class AcceptUnitHandoffDto {
  @ApiPropertyOptional({
    description: 'Sheet Form 1 bên nhận. Nếu bỏ trống, hệ thống tự lấy/tạo.',
  })
  @IsOptional()
  @IsMongoId({ message: 'Sheet không hợp lệ.' })
  sheetId?: string;

  @ApiPropertyOptional({
    description: 'Kỳ KPI khi cần tạo sheet mới',
  })
  @IsOptional()
  @IsMongoId({ message: 'Kỳ KPI không hợp lệ.' })
  periodId?: string;

  @ApiPropertyOptional({
    description: 'Template khi cần tạo sheet mới',
  })
  @IsOptional()
  @IsMongoId({ message: 'Biểu mẫu không hợp lệ.' })
  templateId?: string;
}

export class RejectUnitHandoffDto {
  @ApiProperty({ description: 'Lý do từ chối' })
  @StringNotRequired('Lý do từ chối')
  rejectReason?: string;
}

export class AssignTaskTargetDto {
  @ApiProperty({
    description: 'USER | CHILD_DEPARTMENT',
    enum: ['USER', 'CHILD_DEPARTMENT'],
  })
  @IsIn(['USER', 'CHILD_DEPARTMENT'])
  targetType!: 'USER' | 'CHILD_DEPARTMENT';

  @ApiPropertyOptional({ description: 'User khi targetType = USER' })
  @IsOptional()
  @IsMongoId({ message: 'Người nhận không hợp lệ.' })
  userId?: string;

  @ApiPropertyOptional({
    description: 'Đội con khi targetType = CHILD_DEPARTMENT',
  })
  @IsOptional()
  @IsMongoId({ message: 'Đơn vị nhận không hợp lệ.' })
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Template sheet đội con (nếu chưa có sheet)',
  })
  @IsOptional()
  @IsMongoId()
  childTemplateId?: string;
}
