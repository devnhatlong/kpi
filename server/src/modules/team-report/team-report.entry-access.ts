import { Permission } from '@/common/enums/permission.enum';
import { RoleCode } from '@/common/enums/role-code.enum';

/**
 * Vai được tự nhập việc / chấm bảng của đơn vị mình khi chỉ có quyền DUYỆT:
 * trưởng / phó đơn vị cấp phòng, xã - đúng những vai lập "báo cáo của đơn vị"
 * để trình tiếp lên trên. Tài khoản chỉ duyệt và cấp tỉnh có quyền duyệt nhưng
 * không trình gì đi đâu, nên không nằm ở đây.
 */
export const UNIT_ENTRY_ROLES: string[] = [
  RoleCode.UNIT_ADMIN,
  RoleCode.VICE_UNIT_ADMIN,
];

/**
 * Ai được nhập việc / chấm bảng của CHÍNH đơn vị mình: đội / tổ (quyền nhập),
 * hoặc trưởng / phó phòng, xã (quyền duyệt + vai trưởng đơn vị).
 *
 * Phòng / xã cần cửa này vì có việc do chính trưởng đơn vị làm, phải thêm vào
 * trước khi lập báo cáo tổng hợp - không đội nào khai hộ được.
 *
 * Kiểm ở service chứ không bằng `@Permissions`: guard đòi ĐỦ mọi quyền liệt kê,
 * mà luật ở đây là "quyền này HOẶC quyền kia kèm vai".
 */
export function canEnterUnitTasks(
  roleCodes: string[],
  permissions: ReadonlySet<string>,
): boolean {
  return (
    roleCodes.includes(RoleCode.SUPER_ADMIN) ||
    permissions.has(Permission.TEAM_REPORT_ENTRY) ||
    (permissions.has(Permission.TEAM_REPORT_REVIEW) &&
      roleCodes.some((code) => UNIT_ENTRY_ROLES.includes(code)))
  );
}
