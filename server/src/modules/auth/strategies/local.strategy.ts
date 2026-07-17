import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '@/modules/users/users.service';
import { User } from '@/modules/users/schemas/user.schema';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
    constructor(private usersService: UsersService) {
        super();
    }

    async validate(username: string, password: string): Promise<User> {
        return await this.usersService.validateUser(username, password); // Return cái gì thì passportsjs sẽ gắn lên req.user
    }
}
