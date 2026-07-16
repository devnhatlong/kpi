// src/modules/users/schemas/role-assignment.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

import { RoleCode } from '@/common/enums/role-code.enum';

@Schema({
    _id: false,
})
export class RoleAssignment {
    /**
     * Mã vai trò.
     *
     * Đây là tham chiếu logic tới Role.code,
     * không phải tham chiếu ObjectId tới Role._id.
     */
    @Prop({
        required: true,
        enum: RoleCode,
    })
    roleCode!: RoleCode;

    /**
     * null:
     *   Quyền toàn hệ thống.
     *
     * ObjectId:
     *   Quyền trong đơn vị này và các đơn vị con cháu.
     */
    @Prop({
        type: Types.ObjectId,
        ref: 'Department',
        default: null,
    })
    scopeDepartmentId!: Types.ObjectId | null;
}

export const RoleAssignmentSchema =
    SchemaFactory.createForClass(RoleAssignment);