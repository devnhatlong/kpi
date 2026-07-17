// src/modules/users/schemas/user.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import {
    RoleAssignment,
    RoleAssignmentSchema,
} from './role-assignment.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({
    timestamps: true,
})
export class User {
    @Prop({
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    })
    username!: string;

    /**
     * Chỉ lưu mật khẩu đã hash.
     *
     * select: false giúp mặc định không trả password
     * khi thực hiện find/findOne.
     */
    @Prop({
        required: true,
        select: false,
    })
    password!: string;

    @Prop({
        required: true,
        trim: true,
    })
    fullName!: string;

    @Prop({
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true,
    })
    email?: string;

    @Prop({
        trim: true,
    })
    phone?: string;

    /**
     * Đơn vị công tác chính của người dùng.
     */
    @Prop({
        type: Types.ObjectId,
        ref: 'Department',
        index: true,
    })
    departmentId?: Types.ObjectId;

    /**
     * Một người có thể kiêm nhiệm nhiều vai trò,
     * tại nhiều phạm vi đơn vị khác nhau.
     */
    @Prop({
        type: [RoleAssignmentSchema],
        default: [],
    })
    roleAssignments!: RoleAssignment[];

    @Prop({
        default: true,
        index: true,
    })
    isActive!: boolean;

    @Prop({
        type: Date,
        default: null,
    })
    lastLoginAt?: Date | null;

    /** So sánh mật khẩu plain với hash đã lưu. */
    comparePassword!: (password: string) => Promise<boolean>;

    /** Trả về object user không kèm password. */
    toSafeObject!: () => Omit<User, 'password' | 'comparePassword' | 'toSafeObject'>;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.methods.comparePassword = async function (
    this: UserDocument,
    password: string,
): Promise<boolean> {
    return bcrypt.compareSync(password, this.password);
};

UserSchema.methods.toSafeObject = function (this: UserDocument) {
    const obj = this.toObject();
    const { password: _, ...rest } = obj;
    return rest;
};

/**
 * Hash password trước khi lưu nếu field bị thay đổi.
 */
UserSchema.pre('save', async function () {
    if (!this.isModified('password')) {
        return;
    }

    this.password = await bcrypt.hash(this.password, 10);
});

/**
 * Tìm người dùng theo đơn vị và trạng thái.
 */
UserSchema.index({
    departmentId: 1,
    isActive: 1,
});

/**
 * Tìm người có một vai trò cụ thể trong phạm vi đơn vị.
 */
UserSchema.index({
    'roleAssignments.roleCode': 1,
    'roleAssignments.scopeDepartmentId': 1,
});