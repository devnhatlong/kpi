import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService
  ) { }

  async validateUser(email: string, password: string) {
    return await this.usersService.validateUser(email, password);
  }

  async login({ id, roleAssignments }) {
    const accessToken = await this.jwtService.signAsync({
      uid: id,
      role: roleAssignments,
    });

    return {
      message: 'Đăng nhập thành công.',
      accessToken: accessToken
    }
  }
}
