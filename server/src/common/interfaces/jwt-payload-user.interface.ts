export interface JwtRoleAssignment {
  roleCode: string;
  scopeDepartmentId: string | null;
}

/** User gắn vào req.user sau khi JwtStrategy.validate. */
export interface JwtPayloadUser {
  uid: string;
  role: JwtRoleAssignment[];
}
