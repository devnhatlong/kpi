import { RoleCode } from '@/common/enums/role-code.enum';

export interface JwtRoleAssignment {
  roleCode: RoleCode;
  scopeDepartmentId: string | null;
}

/** User gắn vào req.user sau khi JwtStrategy.validate. */
export interface JwtPayloadUser {
  uid: string;
  role: JwtRoleAssignment[];
}
