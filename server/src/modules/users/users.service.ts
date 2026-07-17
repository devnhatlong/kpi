import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User, UserDocument } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /** Tìm user theo username, kèm password để phục vụ so sánh đăng nhập. */
  async findByUsername(username: string) {
    return this.userModel.findOne({ username }).select('+password');
  }

  async findById(id: string) {
    return this.userModel.findById(id);
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
      throw new BadRequestException('Tài khoản đã được đăng ký.');
    }

    const user = await this.userModel.create({
      username: createUserDto.username,
      password: createUserDto.password,
    });

    return {
      message: 'Đăng ký tài khoản thành công.',
      user: user.toSafeObject(),
    };
  }

  async findAll() {
    const users = await this.userModel.find().sort({ createdAt: -1 });
    return users.map((user) => user.toSafeObject());
  }

  async findOne(id: string) {
    const user = await this.requireUser(id);
    return user.toSafeObject();
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const user = await this.requireUser(id, true);

    if (updateUserDto.password !== undefined) {
      user.password = updateUserDto.password;
    }
    if (updateUserDto.fullName !== undefined) {
      user.fullName = updateUserDto.fullName;
    }
    if (updateUserDto.email !== undefined) {
      user.email = updateUserDto.email;
    }
    if (updateUserDto.phone !== undefined) {
      user.phone = updateUserDto.phone;
    }
    if (updateUserDto.departmentId !== undefined) {
      if (!updateUserDto.departmentId) {
        user.set('departmentId', undefined);
      } else if (!Types.ObjectId.isValid(updateUserDto.departmentId)) {
        throw new BadRequestException('Mã đơn vị không hợp lệ.');
      } else {
        user.departmentId = new Types.ObjectId(updateUserDto.departmentId);
      }
    }
    if (updateUserDto.isActive !== undefined) {
      user.isActive = updateUserDto.isActive;
    }

    await user.save();

    return {
      message: 'Cập nhật người dùng thành công.',
      user: user.toSafeObject(),
    };
  }

  async remove(id: string) {
    const user = await this.requireUser(id);
    await user.deleteOne();

    return { message: 'Xóa người dùng thành công.' };
  }

  private async requireUser(id: string, withPassword = false) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }

    const query = this.userModel.findById(id);
    if (withPassword) {
      query.select('+password');
    }

    const user = await query;
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng.');
    }

    return user;
  }
}
