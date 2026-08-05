import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { RoleAssignment, RoleAssignmentSchema } from './role-assignment.schema';

@Schema({
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
})
export class User {
    @Prop({ required: true, unique: true, trim: true, lowercase: true })
    username!: string;

    /**
     * Chỉ lưu mật khẩu đã hash.
     * select: false giúp mặc định không trả password khi find/findOne.
     */
    @Prop({ required: true, select: false })
    password!: string;

    @Prop({ trim: true })
    fullName?: string;

    @Prop({ unique: true, sparse: true, lowercase: true, trim: true })
    email?: string;

    @Prop({ trim: true })
    phone?: string;

    /** Chức vụ hiển thị trên hồ sơ, vd: "Đội trưởng". */
    @Prop({ trim: true })
    position?: string;

    /** Đơn vị công tác chính của người dùng. */
    @Prop({ type: Types.ObjectId, ref: 'Department', index: true })
    departmentId?: Types.ObjectId;

    /** Một người có thể kiêm nhiệm nhiều vai trò tại nhiều đơn vị. */
    @Prop({ type: [RoleAssignmentSchema], default: [] })
    roleAssignments!: RoleAssignment[];

    @Prop({ default: true, index: true })
    isActive!: boolean;

    @Prop({ type: Date, default: null })
    lastLoginAt?: Date | null;
}

/** Object user an toàn (không kèm password), có thêm virtual id. */
export type SafeUser = Omit<User, 'password'> & { id: string };

/** Document Mongoose kèm các instance method. */
export type UserDocument = HydratedDocument<User> & {
    comparePassword(password: string): Promise<boolean>;
    toSafeObject(): SafeUser;
};

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.methods.comparePassword = async function (
    this: UserDocument,
    password: string,
): Promise<boolean> {
    return bcrypt.compare(password, this.password);
};

UserSchema.methods.toSafeObject = function (this: UserDocument): SafeUser {
    const { password, _id, __v, ...rest } = this.toObject();
    return rest as SafeUser;
};

/** Hash password trước khi lưu nếu field bị thay đổi. */
UserSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

/** Tìm người dùng theo đơn vị và trạng thái. */
UserSchema.index({ departmentId: 1, isActive: 1 });

/** Tìm người có một vai trò cụ thể trong phạm vi đơn vị. */
UserSchema.index({
    'roleAssignments.roleCode': 1,
    'roleAssignments.scopeDepartmentId': 1,
});