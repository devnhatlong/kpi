import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';

import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
  ) { }

  /** Tìm user theo username, kèm password để phục vụ so sánh đăng nhập. */
  async findByUsername(username: string) {
    return this.userModel.findOne({ username }).select('+password');
  }

  async validateUser(username: string, password: string) {
    const user = await this.findByUsername(username);
    if (!user) {
      throw new BadRequestException(
        'Tài khoản hoặc mật khẩu không chính xác.',
      );
    }

    const isCorrectPassword = await user.comparePassword(password);
    if (!isCorrectPassword) {
      throw new BadRequestException(
        'Tài khoản hoặc mật khẩu không chính xác.',
      );
    }

    return user;
  }

  async register(createUserDto: CreateUserDto) {
    const alreadyExist = await this.findByUsername(createUserDto.username);

    if (alreadyExist) {
      throw new BadRequestException(
        'Tài khoản đã được đăng ký.',
      );
    }

    await this.userModel.create(createUserDto as any);

    return {
      message: 'Đăng ký tài khoản thành công.'
    }
  }
}