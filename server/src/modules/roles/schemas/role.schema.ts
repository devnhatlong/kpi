// src/modules/roles/schemas/role.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { Permission } from '@/common/enums/permission.enum';
import { RoleCode } from '@/common/enums/role-code.enum';

export type RoleDocument = HydratedDocument<Role>;

@Schema({
    timestamps: true
})
export class Role {
    @Prop({
        required: true,
        unique: true,
        enum: RoleCode,
        trim: true,
    })
    code!: RoleCode;

    @Prop({
        required: true,
        trim: true,
    })
    name!: string;

    @Prop({
        trim: true,
        lowercase: true,
    })
    slug?: string;

    @Prop({
        type: [String],
        enum: Permission,
        default: [],
    })
    permissions!: Permission[];

    /**
     * Vai trò hệ thống không được phép xóa.
     */
    @Prop({
        default: false,
    })
    isSystem!: boolean;

    @Prop({
        default: true,
        index: true,
    })
    isActive!: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);