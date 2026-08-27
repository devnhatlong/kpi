import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ScoreGroup } from './score-group.schema';
import { WorkContent } from './work-content.schema';

export type WorkTaskDocument = HydratedDocument<WorkTask>;

/**
 * Danh mục NHIỆM VỤ của một nội dung công việc.
 *
 * Có trục (như trục 2) mà nhiệm vụ là văn bản quy định sẵn, cán bộ không được
 * tự nghĩ ra: admin khai một lần ở đây, form nhập chỉ còn là dropdown chọn.
 * Trục nào vẫn để cán bộ tự gõ nhiệm vụ thì đơn giản là không khai gì.
 */
@Schema({ timestamps: true, collection: 'mission_work_tasks' })
export class WorkTask {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  /** Nguyên văn nhiệm vụ trong bảng nhiệm vụ - thường là một đoạn dài. */
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({
    type: Types.ObjectId,
    ref: WorkContent.name,
    required: true,
    index: true,
  })
  workContentId!: Types.ObjectId;

  /**
   * Điểm chuẩn riêng của nhiệm vụ này; để trống thì lấy nhóm điểm của nội dung
   * công việc. Cùng một mục có thể có nhiều mức điểm theo cấp ghi nhận (Bộ Công
   * an 3 điểm, Công an tỉnh 1-2 điểm...) nên mức điểm phải khai được tới đây.
   */
  @Prop({
    type: Types.ObjectId,
    ref: ScoreGroup.name,
    default: null,
    index: true,
  })
  scoreGroupId!: Types.ObjectId | null;

  /** Ghi chú riêng của nhiệm vụ; để trống thì lấy ghi chú của nội dung. */
  @Prop({ trim: true, default: '' })
  note!: string;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const WorkTaskSchema = SchemaFactory.createForClass(WorkTask);
WorkTaskSchema.index({ workContentId: 1, sortOrder: 1, name: 1 });
