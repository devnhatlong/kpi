import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type QualityLevelDocument = HydratedDocument<QualityLevel>;

/**
 * Mức chất lượng thực hiện - danh mục rời rạc (100%, 75%, 50%, 25%, 0%).
 *
 * Khác nhóm điểm ở chỗ đây là các GIÁ TRỊ chọn được khi chấm, không phải dải
 * điểm; nên tách riêng thay vì nhét vào ScoreGroup với min = max.
 */
@Schema({ timestamps: true, collection: 'mission_quality_levels' })
export class QualityLevel {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  /** Phần trăm chất lượng, 0-100. */
  @Prop({ required: true, min: 0, max: 100 })
  percent!: number;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;

  /** Mức do hệ thống tạo sẵn - không cho xoá. */
  @Prop({ default: false, index: true })
  isSystem!: boolean;
}

export const QualityLevelSchema = SchemaFactory.createForClass(QualityLevel);
QualityLevelSchema.index({ sortOrder: 1, percent: -1 });
