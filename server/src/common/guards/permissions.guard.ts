import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '@/common/decorators/permissions.decorator';
import { Permission } from '@/common/enums/permission.enum';
import { RoleCode } from '@/common/enums/role-code.enum';
import { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { RolesService } from '@/modules/roles/roles.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesService: RolesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    console.log(this.reflector);
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayloadUser | undefined;
    const roleCodes = this.extractRoleCodes(user);

    if (roleCodes.includes(RoleCode.SUPER_ADMIN)) {
      return true;
    }

    const permissions =
      await this.rolesService.getPermissionsByCodes(roleCodes);
    const permissionSet = new Set(permissions);
    const missing = requiredPermissions.filter((p) => !permissionSet.has(p));

    if (missing.length > 0) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    }

    return true;
  }

  private extractRoleCodes(user?: JwtPayloadUser): RoleCode[] {
    if (!user?.role?.length) {
      return [];
    }

    return user.role
      .map((assignment) => assignment?.roleCode)
      .filter((code): code is RoleCode => Boolean(code));
  }
}
