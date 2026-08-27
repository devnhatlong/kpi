import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  SCORE_GROUP_SCALE_MAX,
  SCORE_GROUP_SCALE_MIN,
} from '../score-group.constants';

export type ScoreGroupDocument = HydratedDocument<ScoreGroup>;

/** Nhóm điểm - dải điểm trên thang 100. */
@Schema({ timestamps: true })
export class ScoreGroup {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  @Prop({
    required: true,
    min: SCORE_GROUP_SCALE_MIN,
    max: SCORE_GROUP_SCALE_MAX,
  })
  minScore!: number;

  @Prop({
    required: true,
    min: SCORE_GROUP_SCALE_MIN,
    max: SCORE_GROUP_SCALE_MAX,
  })
  maxScore!: number;

  @Prop({ default: false })
  maxInclusive!: boolean;

  /**
   * Điểm chuẩn của nhóm dùng cho công thức tính điểm trục - mỗi nhiệm vụ thuộc
   * nhóm này góp đúng số đó vào mẫu số.
   *
   * Tách khỏi minScore/maxScore vì hai trường kia chỉ để kiểm điểm nhập có nằm
   * trong dải không. null = để hệ thống suy từ dải (dải hở thì lùi một điểm),
   * khai số cụ thể khi đơn vị quy định khác.
   */
  @Prop({ type: Number, default: null })
  formulaScore!: number | null;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ default: false, index: true })
  isSystem!: boolean;
}

export const ScoreGroupSchema = SchemaFactory.createForClass(ScoreGroup);
ScoreGroupSchema.index({ sortOrder: 1, name: 1 });
