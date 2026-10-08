import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorkContentSetDocument = HydratedDocument<WorkContentSet>;

/**
 * Bộ nội dung công việc - danh sách dòng "Nội dung công việc" của MỘT phụ lục
 * (Phụ lục 2 khối An ninh, Phụ lục 3 khối Cảnh sát…).
 *
 * Các phụ lục dùng chung bộ cột và chung trục, chỉ khác nhau ở danh sách nội
 * dung trong mỗi trục. Nên nội dung vẫn chia theo trục như cũ, bộ chỉ trả lời
 * thêm câu "dòng này thuộc phụ lục nào". Một nội dung thuộc được nhiều bộ: phần
 * "Nhiệm vụ công tác chung" giống nhau giữa các khối, khai một lần rồi gắn
 * nhiều bộ, không nhân bản - nhân bản thì thống kê theo nội dung không gom được
 * qua các khối.
 *
 * Bộ KHÔNG tự mang phạm vi đơn vị: mẫu báo cáo đã có phạm vi (by_department >
 * by_level > all), mẫu nào trỏ tới bộ nào thì đơn vị dùng mẫu đó thấy bộ đó.
 * Tách khỏi mẫu báo cáo vì mẫu đổi theo năm, còn danh mục phụ lục dùng lại.
 */
@Schema({ timestamps: true, collection: 'mission_work_content_sets' })
export class WorkContentSet {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true, default: '' })
  description!: string;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const WorkContentSetSchema =
  SchemaFactory.createForClass(WorkContentSet);
WorkContentSetSchema.index({ sortOrder: 1, name: 1 });
