import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Helper } from 'src/ultis/helpers';

export type DepartmentLevelDocument = HydratedDocument<DepartmentLevel>;

@Schema({ timestamps: true, collection: 'department_levels' })
export class DepartmentLevel {
    @Prop({ required: true, unique: true, uppercase: true, trim: true })
    code!: string; // CUC, TINH, PHONG, DOI, TO, XA, PHUONG

    @Prop({ required: true, trim: true })
    name!: string; // Cục, Tỉnh, Phòng...

    @Prop()
    slug!: string;

    @Prop({ required: true, default: 0 })
    rank!: number; // thứ tự cấp (1 = cao nhất)

    @Prop({ default: true })
    isActive!: boolean;
}

export const DepartmentLevelSchema = SchemaFactory.createForClass(DepartmentLevel);

DepartmentLevelSchema.pre<DepartmentLevelDocument>('validate', function () {
    if (this.name) {
        this.slug = Helper.slugify(this.name);
    }
});