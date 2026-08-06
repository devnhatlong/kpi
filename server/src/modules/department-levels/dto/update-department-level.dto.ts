import {
  BooleanNotRequired,
  NumberNotRequired,
  StringNotRequired,
} from '@/common/decorators';

export class UpdateDepartmentLevelDto {
  @StringNotRequired('Mã cấp đơn vị', { example: 'TINH' })
  code?: string;

  @StringNotRequired('Tên cấp đơn vị', { example: 'Tỉnh' })
  name?: string;

  @NumberNotRequired('Thứ tự cấp', { example: 1 })
  rank?: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;

  @BooleanNotRequired('Là cấp đơn vị nhận KPI (Phòng, Xã...)', {
    example: true,
  })
  isKpiUnit?: boolean;
}
