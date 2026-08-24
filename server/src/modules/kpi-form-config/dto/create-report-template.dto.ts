import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsMongoId, IsOptional } from 'class-validator';
import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

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

  @NumberNotRequired('Thứ tự hiển thị', { example: 0 })
  sortOrder?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;
}
