import { SetMetadata } from '@nestjs/common';
import { Permission } from '@/common/enums/permission.enum';

export const PERMISSIONS_KEY = 'permissions';

/** Yêu cầu user phải có đủ tất cả permission (AND). */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
