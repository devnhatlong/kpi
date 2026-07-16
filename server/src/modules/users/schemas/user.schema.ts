import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * Một lần gán vai trò cho user:
 *  - roleCode: vai trò (tham chiếu Role.code)
 *  - scopeDepartmentId: node phạm vi trên cây đơn vị.
 *      null  = phạm vi toàn hệ thống (dành cho SUPER_ADMIN)
 *      <id>  = chỉ trong nhánh con cháu của đơn vị này
 *
 * Dùng mảng để hỗ trợ kiêm nhiệm (một người admin nhiều đơn vị,
 * hoặc vừa là manager phòng này vừa staff phòng khác).
 */
export interface RoleAssignment {
    roleCode: string;
    scopeDepartmentId: Types.ObjectId | null;
}

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
    @Prop({ required: true, unique: true, trim: true })
    username!: string;

    @Prop({ required: true })
    passwordHash!: string;

    @Prop({ required: true, trim: true })
    fullName!: string;

    @Prop({ unique: true, sparse: true, lowercase: true, trim: true })
    email!: string;

    @Prop({ trim: true })
    phone!: string;

    // Đơn vị công tác của user
    @Prop({ type: Types.ObjectId, ref: 'Department', index: true })
    departmentId!: Types.ObjectId;

    // Vai trò + phạm vi
    @Prop({
        type: [
            {
                roleCode: { type: String, required: true },
                scopeDepartmentId: { type: Types.ObjectId, ref: 'Department', default: null },
            },
        ],
        default: [],
    })
    roleAssignments!: RoleAssignment[];

    @Prop({ default: true })
    isActive!: boolean;

    @Prop()
    lastLoginAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);