import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthsService {
  constructor(
    private readonly usersService: UsersService
  ) { }

  async validateUser(email: string, password: string) {
    return await this.usersService.validateUser(email, password);
  }
}
