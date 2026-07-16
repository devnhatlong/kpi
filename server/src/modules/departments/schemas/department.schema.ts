import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Model, Types } from 'mongoose';
import { Helper } from 'src/ultis/helpers';
import { DepartmentLevel } from './department-level.schema';

export type DepartmentDocument = HydratedDocument<Department>;

@Schema({ timestamps: true })
export class Department {
    @Prop({ required: true, unique: true, trim: true })
    code!: string;

    @Prop({ required: true, trim: true })
    name!: string;

    @Prop()
    slug!: string;

    @Prop({ type: Types.ObjectId, ref: DepartmentLevel.name })
    levelId!: Types.ObjectId;

    // Đơn vị cha (gốc thì null)
    @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
    parentId!: Types.ObjectId | null;

    // Mảng tổ tiên (gốc -> cha gần nhất). Tìm con cháu: { ancestors: id }
    @Prop({ type: [{ type: Types.ObjectId, ref: 'Department' }], default: [], index: true })
    ancestors!: Types.ObjectId[];

    // Chuỗi "/id/id/" tiện sắp xếp & breadcrumb
    @Prop({ default: '/', index: true })
    path!: string;

    @Prop({ default: 0 })
    depth!: number; // gốc = 0

    @Prop({ default: 0 })
    sortOrder!: number;

    @Prop({ default: true })
    isActive!: boolean;
}

export const DepartmentSchema = SchemaFactory.createForClass(Department);

DepartmentSchema.index({ parentId: 1 });
DepartmentSchema.index({ levelId: 1 });

// slug từ name (giống các schema khác)
DepartmentSchema.pre<DepartmentDocument>('validate', function () {
    if (this.name) {
        this.slug = Helper.slugify(this.name);
    }
});

// Tự tính ancestors / path / depth từ đơn vị cha khi tạo mới hoặc đổi parentId.
// Lưu ý: phải dùng .save()/create() để hook chạy (insertMany KHÔNG chạy hook này).
DepartmentSchema.pre<DepartmentDocument>('save', async function () {
    if (this.isNew || this.isModified('parentId')) {
        const DepartmentModel = this.constructor as Model<DepartmentDocument>;

        if (this.parentId) {
            const parent = await DepartmentModel.findById(this.parentId)
                .select('ancestors path depth')
                .lean();
            if (!parent) throw new Error('parentId không tồn tại');

            this.ancestors = [...parent.ancestors, parent._id];
            this.depth = parent.depth + 1;
            this.path = `${parent.path}${this._id.toString()}/`;
        } else {
            this.ancestors = [];
            this.depth = 0;
            this.path = `/${this._id.toString()}/`;
        }
    }
});