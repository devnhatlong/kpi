import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schemas/user.schema';
import { Model } from 'mongoose';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) { }

  async findByEmail(email: string) {
    return await this.userModel.findOne({ where: { email } })
  }

  async validateUser(email: string, password: string) {
    const alreadyExist = await this.findByEmail(email);

    if (!alreadyExist) throw new BadRequestException("Tài khoản hoặc mật khẩu không đúng");

    console.log({ alreadyExist });
    return { message: 'Login' }
  }

  async register() {

  }
}
