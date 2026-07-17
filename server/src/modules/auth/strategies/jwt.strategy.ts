import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') as string,
    });
  }

  validate(payload: {
    uid: string;
    role?: JwtPayloadUser['role'];
  }): JwtPayloadUser {
    return {
      uid: payload.uid,
      role: Array.isArray(payload.role) ? payload.role : [],
    };
  }
}
