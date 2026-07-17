import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayloadUser } from '../interfaces';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayloadUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
