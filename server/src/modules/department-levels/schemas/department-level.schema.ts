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

    /**
     * Cấp này là đơn vị nhận KPI (Phòng, Xã...) hay chỉ để gom nhóm (Khối).
     * Nhiệm vụ giao xuống chỉ dừng ở các cấp bật cờ này.
     * Chưa cấp nào bật thì coi như mọi cấp đều nhận được.
     */
    @Prop({
        default: false,
        index: true,
    })
    isKpiUnit!: boolean;
}

export const DepartmentLevelSchema = SchemaFactory.createForClass(DepartmentLevel);