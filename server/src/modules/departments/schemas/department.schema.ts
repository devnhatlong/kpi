// src/modules/departments/schemas/department.schema.ts

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { DepartmentLevel } from '@/modules/department-levels/schemas/department-level.schema';

export type DepartmentDocument = HydratedDocument<Department>;

@Schema({
    timestamps: true
})
export class Department {
    @Prop({
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
    })
    code!: string;

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

    /**
     * Cấp đơn vị: Tỉnh, Phòng, Đội, Tổ, Xã...
     */
    @Prop({
        type: Types.ObjectId,
        ref: DepartmentLevel.name,
        index: true,
    })
    levelId?: Types.ObjectId;

    /**
     * Đơn vị cha.
     * null nghĩa là node gốc.
     */
    @Prop({
        type: Types.ObjectId,
        ref: 'Department',
        default: null,
        index: true,
    })
    parentId?: Types.ObjectId | null;

    /**
     * Danh sách tổ tiên, từ node gốc đến node cha.
     *
     * Ví dụ:
     * [tinhId, phongId, doiId]
     */
    @Prop({
        type: [
            {
                type: Types.ObjectId,
                ref: 'Department',
            },
        ],
        default: [],
        index: true,
    })
    ancestors!: Types.ObjectId[];

    /**
     * Ví dụ:
     * /tinhId/phongId/doiId/
     */
    @Prop({
        trim: true,
        default: '/',
        index: true,
    })
    path!: string;

    /**
     * Node gốc có depth = 0.
     */
    @Prop({
        default: 0,
        min: 0,
    })
    depth!: number;

    @Prop({
        default: 0,
    })
    sortOrder!: number;

    @Prop({
        default: true,
        index: true,
    })
    isActive!: boolean;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);

/**
 * Hỗ trợ tìm kiếm, sắp xếp danh sách con của một đơn vị.
 */
DepartmentSchema.index({
    parentId: 1,
    sortOrder: 1,
    name: 1,
});

/**
 * Hỗ trợ lấy các đơn vị theo cấp và trạng thái.
 */
DepartmentSchema.index({
    levelId: 1,
    isActive: 1,
});