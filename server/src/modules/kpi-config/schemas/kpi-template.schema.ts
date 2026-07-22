import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type KpiTemplateDocument = HydratedDocument<KpiTemplate>;

export enum TemplateVisibilityScope {
  ALL = 'ALL',
  ROLES = 'ROLES',
  USERS = 'USERS',
}

export enum TemplateColumnDataType {
  TEXT = 'text',
  NUMBER = 'number',
  TEXT_FILE = 'text_file',
  AUTO_INCREMENT = 'auto_increment',
}

export enum TemplateColumnSourceField {
  CONTENT_NAME = 'content_name',
  TASK_TITLE = 'task_title',
  ASSIGNEE = 'assignee',
  DUE_DATE = 'due_date',
  REPORT_DUE_DATE = 'report_due_date',
  PRODUCT = 'product',
  ACTUAL_PRODUCT = 'actual_product',
  STANDARD_SCORE = 'standard_score',
  SELF_PROGRESS_PERCENT = 'self_progress_percent',
  SELF_PROGRESS_SCORE = 'self_progress_score',
  SELF_QUALITY_PERCENT = 'self_quality_percent',
  SELF_QUALITY_SCORE = 'self_quality_score',
  PROPOSED_ADJUSTMENT = 'proposed_adjustment',
  PROPOSED_ADJUSTMENT_REASON = 'proposed_adjustment_reason',
  APPRAISAL_PROGRESS_PERCENT = 'appraisal_progress_percent',
  APPRAISAL_PROGRESS_SCORE = 'appraisal_progress_score',
  APPRAISAL_QUALITY_PERCENT = 'appraisal_quality_percent',
  APPRAISAL_QUALITY_SCORE = 'appraisal_quality_score',
  NOTE = 'note',
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

  @Prop({
    trim: true,
    enum: [...Object.values(TemplateColumnSourceField), ''],
    default: '',
  })
  sourceField!: TemplateColumnSourceField | '';
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

  @Prop({ required: true, unique: true, trim: true, uppercase: true })
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
}

export const KpiTemplateSchema = SchemaFactory.createForClass(KpiTemplate);
