import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AxisDocument = HydratedDocument<Axis>;

/** Trục nhiệm vụ - phân loại cấp cao cho nội dung công việc. */
@Schema({ timestamps: true })
export class Axis {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  /**
   * Điểm tối đa của trục - dòng "Điểm quy đổi" ở cuối bảng lấy tỉ lệ hoàn thành
   * nhân với số này. Tổng điểm max của các trục đang hoạt động nên bằng 100,
   * nhưng không ép cứng vì kỳ đánh giá có thể tạm tắt bớt trục.
   */
  @Prop({ default: 0, min: 0 })
  maxScore!: number;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const AxisSchema = SchemaFactory.createForClass(Axis);
AxisSchema.index({ sortOrder: 1, name: 1 });
