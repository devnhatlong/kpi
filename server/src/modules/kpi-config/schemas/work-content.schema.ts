import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { CatalogScope } from './catalog-scope.enum';

export type WorkContentDocument = HydratedDocument<WorkContent>;

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class WorkContent {
  @Prop({ required: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, type: Types.ObjectId, ref: 'WorkGroup', index: true })
  groupId!: Types.ObjectId;

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

  @Prop({ type: Types.ObjectId, ref: 'Department', index: true, default: null })
  ownerDepartmentId?: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const WorkContentSchema = SchemaFactory.createForClass(WorkContent);
WorkContentSchema.index(
  { scope: 1, ownerDepartmentId: 1, code: 1 },
  { unique: true },
);
WorkContentSchema.index({ groupId: 1, sortOrder: 1, name: 1 });
