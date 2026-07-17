import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Role, RoleDocument } from './schemas/role.schema';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';

@Injectable()
export class RolesService {
    constructor(
        @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
        private readonly jwtService: JwtService,
    ) { }

    async findAll() {
        return this.roleModel.find();
    }
}
