import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsMongoId, IsOptional } from 'class-validator';
import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';
import {
  REPORT_SCOPE_TYPES,
  type ReportScopeType,
} from '../schemas/report-template.schema';

export class CreateReportTemplateDto {
  @StringNotRequired('Mã mẫu báo cáo (để trống sẽ tự sinh)', {
    example: 'MBC-0001',
  })
  code?: string;

  @StringRequired('Tên mẫu báo cáo', { example: 'Mẫu báo cáo KPI năm 2026' })
  name!: string;

  @StringNotRequired('Mô tả')
  description?: string;

  @NumberNotRequired('Năm áp dụng (bỏ trống = năm hiện tại của server)', {
    example: 2026,
  })
  year?: number;

  @BooleanNotRequired('Có khối "Danh mục điểm tiêu chí chung"', {
    example: true,
  })
  includeCriteria?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Các trục ghép vào mẫu, theo thứ tự hiện trên báo cáo',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Trục không hợp lệ.' })
  axisIds?: string[];

  @ApiPropertyOptional({
    enum: REPORT_SCOPE_TYPES,
    description:
      'all = mọi đơn vị; by_level = theo cấp đơn vị; by_department = các đơn vị đã chọn',
  })
  @IsOptional()
  @IsEnum(REPORT_SCOPE_TYPES, { message: 'Kiểu phạm vi không hợp lệ.' })
  scopeType?: ReportScopeType;

  @ApiPropertyOptional({
    type: [String],
    description: 'Các cấp đơn vị áp dụng (khi scopeType = by_level)',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Cấp đơn vị không hợp lệ.' })
  levelIds?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Các đơn vị áp dụng (khi scopeType = by_department)',
  })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true, message: 'Đơn vị không hợp lệ.' })
  departmentIds?: string[];

  @BooleanNotRequired('Đơn vị cấp dưới dùng theo mẫu của đơn vị cha', {
    example: true,
  })
  includeDescendants?: boolean;

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
