import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CatalogScope } from './catalog-scope.enum';

export type WorkGroupDocument = HydratedDocument<WorkGroup>;

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class WorkGroup {
  @Prop({ required: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  description?: string;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({
    required: true,
    enum: Object.values(CatalogScope),
    default: CatalogScope.SYSTEM,
    index: true,
  })
  scope!: CatalogScope;

  /** Bắt buộc khi scope = DEPARTMENT. */
  @Prop({ type: Types.ObjectId, ref: 'Department', index: true, default: null })
  ownerDepartmentId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const WorkGroupSchema = SchemaFactory.createForClass(WorkGroup);
WorkGroupSchema.index(
  { scope: 1, ownerDepartmentId: 1, code: 1 },
  { unique: true },
);
WorkGroupSchema.index({ scope: 1, ownerDepartmentId: 1, sortOrder: 1, name: 1 });
