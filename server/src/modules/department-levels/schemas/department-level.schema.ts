import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DepartmentLevelDocument = HydratedDocument<DepartmentLevel>;

@Schema({
    timestamps: true
})
export class DepartmentLevel {
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
     * Thứ tự cấp đơn vị:
     * 1 = cấp cao nhất.
     */
    @Prop({
        required: true,
        default: 0,
        min: 0,
    })
    rank!: number;

    @Prop({
        default: true,
        index: true,
    })
    isActive!: boolean;

    createdAt?: Date;
    updatedAt?: Date;
}

export const DepartmentLevelSchema = SchemaFactory.createForClass(DepartmentLevel);