import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UploadDocument = HydratedDocument<Upload>;

/**
 * Một tệp đã tải lên. Bản ghi giữ tên gốc và đường dẫn trên đĩa; tên lưu trên
 * đĩa là chuỗi ngẫu nhiên nên người dùng không đoán được đường dẫn tệp khác.
 */
@Schema({ timestamps: true, collection: 'uploads' })
export class Upload {
  /** Tên gốc lúc người dùng chọn tệp - dùng khi tải về. */
  @Prop({ required: true, trim: true })
  originalName!: string;

  /** Đường dẫn tương đối trong thư mục uploads, ví dụ 2026/08/ab12....pdf */
  @Prop({ required: true, trim: true })
  path!: string;

  @Prop({ required: true, trim: true })
  mimeType!: string;

  @Prop({ required: true, min: 0 })
  size!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  uploadedById!: Types.ObjectId;
}

export const UploadSchema = SchemaFactory.createForClass(Upload);
