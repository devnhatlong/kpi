import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Axis } from './axis.schema';
import { ScoreGroup } from './score-group.schema';

export type WorkContentDocument = HydratedDocument<WorkContent>;

/** Danh mục nội dung công việc - dùng cho dropdown form KPI cá nhân. */
@Schema({ timestamps: true })
export class WorkContent {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  /** Cột "Nhiệm vụ" của bảng KPI - admin khai sẵn, cán bộ chỉ đọc. */
  @Prop({ trim: true, default: '' })
  description!: string;

  /**
   * Cột "Ghi chú" của bảng KPI - trần điểm của mục, quy ước riêng của mục đó...
   * Admin khai một lần theo nội dung công việc; mọi nhiệm vụ khai theo nội dung
   * này đều đọc chung, cán bộ không gõ lại.
   */
  @Prop({ trim: true, default: '' })
  note!: string;

  @Prop({ type: Types.ObjectId, ref: Axis.name, required: true, index: true })
  axisId!: Types.ObjectId;

  /**
   * Nhóm điểm gán cho nội dung công việc - mọi nhiệm vụ khai theo nội dung này
   * lấy chung một mức điểm chuẩn, cán bộ không tự chọn nữa.
   *
   * Để null được vì danh mục có sẵn từ trước khi có trường này; bản ghi cũ hiện
   * "Chưa gán" cho tới khi ai đó mở ra sửa.
   */
  @Prop({
    type: Types.ObjectId,
    ref: ScoreGroup.name,
    default: null,
    index: true,
  })
  scoreGroupId!: Types.ObjectId | null;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const WorkContentSchema = SchemaFactory.createForClass(WorkContent);
WorkContentSchema.index({ sortOrder: 1, name: 1 });
