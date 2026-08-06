import {
  BooleanNotRequired,
  NumberRequired,
  StringNotRequired,
  StringRequired,
} from '@/common/decorators';

export class CreateDepartmentLevelDto {
  @StringRequired('Mã cấp đơn vị', { example: 'TINH' })
  code!: string;

  @StringRequired('Tên cấp đơn vị', { example: 'Tỉnh' })
  name!: string;

  @NumberRequired('Thứ tự cấp', { example: 1 })
  rank!: number;

  @BooleanNotRequired('Trạng thái hoạt động', { example: true })
  isActive?: boolean;

  @BooleanNotRequired('Là cấp đơn vị nhận KPI (Phòng, Xã...)', {
    example: true,
  })
  isKpiUnit?: boolean;
}
