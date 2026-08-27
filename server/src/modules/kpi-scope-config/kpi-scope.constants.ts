import { RoleCode } from '@/common/enums/role-code.enum';

/**
 * Phạm vi được giao nhiệm vụ xuống.
 * Mỗi vai trò bật những phạm vi nào thì chỉ thấy đúng nơi nhận thuộc phạm vi đó.
 */
export const KPI_SCOPES = [
  'SELF',
  'USERS_IN_OWN_UNIT',
  'USERS_IN_SUB_UNITS',
  'OWN_UNIT',
  'CHILD_UNITS',
  'DESCENDANT_UNITS',
] as const;

export type KpiScope = (typeof KPI_SCOPES)[number];

export type KpiScopeMeta = {
  key: KpiScope;
  group: 'PERSON' | 'UNIT';
  label: string;
  description: string;
};

export const KPI_SCOPE_META: KpiScopeMeta[] = [
  {
    key: 'SELF',
    group: 'PERSON',
    label: 'Chính mình',
    description: 'Tự đặt nhiệm vụ cho bản thân',
  },
  {
    key: 'USERS_IN_OWN_UNIT',
    group: 'PERSON',
    label: 'Cán bộ trong đơn vị mình',
    description: 'Giao cho từng cán bộ thuộc đơn vị đang phụ trách',
  },
  {
    key: 'USERS_IN_SUB_UNITS',
    group: 'PERSON',
    label: 'Cán bộ ở đơn vị cấp dưới',
    description: 'Giao thẳng cho cán bộ của các đơn vị bên dưới',
  },
  {
    key: 'OWN_UNIT',
    group: 'UNIT',
    label: 'Đơn vị của mình',
    description: 'Giao cho chính đơn vị đang phụ trách',
  },
  {
    key: 'CHILD_UNITS',
    group: 'UNIT',
    label: 'Đơn vị cấp liền kề',
    description: 'Giao xuống các đơn vị ngay dưới một cấp',
  },
  {
    key: 'DESCENDANT_UNITS',
    group: 'UNIT',
    label: 'Mọi đơn vị cấp dưới',
    description: 'Giao vượt cấp xuống bất kỳ đơn vị nào bên dưới',
  },
];

export type KpiScopeSeed = {
  roleCode: string;
  isEnabled: boolean;
  scopes: KpiScope[];
  requireApproval: boolean;
  note: string;
};

/** Mặc định hệ thống - nút "Mặc định" trên trang cấu hình khôi phục về đây. */
export const KPI_SCOPE_SEEDS: KpiScopeSeed[] = [
  {
    // Chỉ để cấu hình hệ thống, không tham gia giao/nhận KPI nghiệp vụ.
    roleCode: RoleCode.SUPER_ADMIN,
    isEnabled: false,
    scopes: [],
    requireApproval: true,
    note: 'Tài khoản cấu hình hệ thống - không giao KPI. Việc đó của Công an tỉnh.',
  },
  {
    roleCode: RoleCode.CAT_ADMIN,
    isEnabled: true,
    scopes: ['CHILD_UNITS', 'DESCENDANT_UNITS', 'USERS_IN_OWN_UNIT'],
    requireApproval: true,
    note: 'Cấp tỉnh giao xuống đơn vị, được phép vượt cấp khi cần.',
  },
  {
    roleCode: RoleCode.UNIT_ADMIN,
    isEnabled: true,
    scopes: ['CHILD_UNITS', 'USERS_IN_OWN_UNIT'],
    requireApproval: true,
    note: 'Quản trị đơn vị giao xuống đơn vị con hoặc cán bộ trong đơn vị.',
  },
  {
    // Phó đứng thay trưởng nên giao được đúng phạm vi của trưởng.
    roleCode: RoleCode.VICE_UNIT_ADMIN,
    isEnabled: true,
    scopes: ['CHILD_UNITS', 'USERS_IN_OWN_UNIT'],
    requireApproval: true,
    note: 'Phó phòng, phó xã giao xuống đơn vị con hoặc cán bộ trong đơn vị.',
  },
  {
    roleCode: RoleCode.MANAGER,
    isEnabled: true,
    scopes: ['CHILD_UNITS', 'USERS_IN_OWN_UNIT'],
    requireApproval: true,
    note: 'Chỉ huy giao trong phạm vi đơn vị mình phụ trách.',
  },
  {
    roleCode: RoleCode.STAFF,
    isEnabled: false,
    scopes: ['SELF'],
    requireApproval: true,
    note: 'Cán bộ chỉ tự tạo nhiệm vụ cá nhân.',
  },
];

export function defaultSeedFor(roleCode: string): KpiScopeSeed {
  return (
    KPI_SCOPE_SEEDS.find((item) => item.roleCode === roleCode) ?? {
      roleCode,
      isEnabled: false,
      scopes: [],
      requireApproval: true,
      note: '',
    }
  );
}
