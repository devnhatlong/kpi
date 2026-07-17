import { SetMetadata } from '@nestjs/common';
import { RoleCode } from '@/common/enums/role-code.enum';

export const ROLES_KEY = 'roles';

/** Yêu cầu user có ít nhất một role trong danh sách (OR). */
export const Roles = (...roles: RoleCode[]) => SetMetadata(ROLES_KEY, roles);
