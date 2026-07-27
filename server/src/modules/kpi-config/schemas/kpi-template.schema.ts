import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { CatalogScope } from './catalog-scope.enum';

export type KpiTemplateDocument = HydratedDocument<KpiTemplate>;

export enum TemplateVisibilityScope {
  ALL = 'ALL',
  ROLES = 'ROLES',
  USERS = 'USERS',
}

export enum TemplateColumnDataType {
  TEXT = 'text',
  NUMBER = 'number',
  DATE = 'date',
  TIME = 'time',
  DATETIME = 'datetime',
  TEXT_FILE = 'text_file',
  AUTO_INCREMENT = 'auto_increment',
}

@Schema({ _id: false })
export class TemplateColumn {
  @Prop({ required: true, trim: true })
  id!: string;

  @Prop({ required: true, trim: true })
  key!: string;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ type: [String], default: [] })
  headerPath!: string[];

  @Prop({ required: true, min: 1 })
  width!: number;

  @Prop({ default: true })
  visible!: boolean;

  @Prop({ trim: true, default: '' })
  inputRoleCode!: string;

  @Prop({
    required: true,
    enum: Object.values(TemplateColumnDataType),
    default: TemplateColumnDataType.TEXT,
  })
  dataType!: TemplateColumnDataType;

  @Prop({ default: false })
  required!: boolean;
}

export const TemplateColumnSchema =
  SchemaFactory.createForClass(TemplateColumn);

@Schema({ _id: false })
export class TemplateHeaderGroup {
  @Prop({ required: true, trim: true })
  id!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: [], default: [] })
  children!: TemplateHeaderGroup[];
}

export const TemplateHeaderGroupSchema = SchemaFactory.createForClass(
  TemplateHeaderGroup,
);
TemplateHeaderGroupSchema.add({
  children: [TemplateHeaderGroupSchema],
});

@Schema({ timestamps: true, toJSON: { virtuals: true } })
export class KpiTemplate {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ type: [TemplateColumnSchema], default: [] })
  columns!: TemplateColumn[];

  @Prop({ type: [TemplateHeaderGroupSchema], default: [] })
  headerGroups!: TemplateHeaderGroup[];

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'WorkContent' }],
    default: [],
  })
  includedContentIds!: Types.ObjectId[];

  @Prop({ default: 50, min: 0, max: 100 })
  progressWeight!: number;

  @Prop({ default: 50, min: 0, max: 100 })
  qualityWeight!: number;

  @Prop({
    required: true,
    enum: Object.values(TemplateVisibilityScope),
    default: TemplateVisibilityScope.ALL,
  })
  visibilityScope!: TemplateVisibilityScope;

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'Role' }],
    default: [],
  })
  assignedRoleIds!: Types.ObjectId[];

  @Prop({
    type: [{ type: MongooseSchema.Types.ObjectId, ref: 'User' }],
    default: [],
  })
  assignedUserIds!: Types.ObjectId[];

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

export const KpiTemplateSchema = SchemaFactory.createForClass(KpiTemplate);
KpiTemplateSchema.index(
  { scope: 1, ownerDepartmentId: 1, code: 1 },
  { unique: true },
);
