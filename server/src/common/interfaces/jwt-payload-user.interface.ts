export interface JwtRoleAssignment {
  roleCode: string;
  scopeDepartmentId: string | null;
}

/** User gắn vào req.user sau khi JwtStrategy.validate. */
export interface JwtPayloadUser {
  uid: string;
  /** Vai trò HIỆN TẠI đọc từ CSDL mỗi request, không phải bản chụp trong token. */
  role: JwtRoleAssignment[];
  /** Phiên quản trị vào hộ bằng mật khẩu thứ 2. */
  imp?: boolean;
}
