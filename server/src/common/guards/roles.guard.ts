import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import { RoleCode } from '@/common/enums/role-code.enum';
import { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayloadUser | undefined;
    const roleCodes = (user?.role ?? [])
      .map((assignment) => assignment?.roleCode)
      .filter((code): code is RoleCode => Boolean(code));

    if (roleCodes.includes(RoleCode.SUPER_ADMIN)) {
      return true;
    }

    const allowed = requiredRoles.some((role) => roleCodes.includes(role));
    if (!allowed) {
      throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
    }

    return true;
  }
}
