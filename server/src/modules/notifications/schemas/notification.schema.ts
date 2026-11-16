import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { User } from '@/modules/users/schemas/user.schema';

export type NotificationDocument = Notification & Document;

/**
 * Loại thông báo - quyết biểu tượng / màu bên client, không quyết nội dung.
 *
 * - INCOMING: có bản trình tới tôi (chờ tôi duyệt).
 * - INFORM: bản trình tới đơn vị tôi để phối hợp / nhận để biết.
 * - RETURNED: bản của tôi bị trả lại (hoặc trả về tôi - người duyệt cấp 1).
 * - APPROVED: bản của tôi đã được duyệt.
 * - COMMENT: đơn vị phối hợp gửi ý kiến cho bản tôi đang chủ trì.
 * - DEADLINE: sắp / đến hạn trình báo cáo tháng mà đơn vị chưa trình.
 */
export const NOTIFICATION_KINDS = [
  'INCOMING',
  'INFORM',
  'RETURNED',
  'APPROVED',
  'COMMENT',
  'DEADLINE',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Giữ 180 ngày rồi Mongo tự xoá - thông báo là tin nhắc, không phải hồ sơ. */
export const NOTIFICATION_TTL_SECONDS = 180 * 24 * 60 * 60;

/**
 * Một thông báo gửi tới MỘT TÀI KHOẢN (hộp đến theo tài khoản, không theo đơn
 * vị). Nội dung chụp sẵn thành chữ lúc tạo: đơn vị đổi tên hay bản bị sửa về
 * sau thì thông báo cũ vẫn đọc đúng lúc nó được gửi.
 */
@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, enum: NOTIFICATION_KINDS, required: true })
  kind!: NotificationKind;

  @Prop({ required: true, trim: true })
  title!: string;

  @Prop({ trim: true, default: '' })
  body!: string;

  /** Đường trong app để mở khi bấm vào. */
  @Prop({ trim: true, default: '' })
  href!: string;

  @Prop({ type: Date, default: null })
  readAt!: Date | null;

  /**
   * Khoá chống gửi trùng (VD nhắc hạn chạy lại sau khi server khởi động lại).
   * Có khoá thì một tài khoản chỉ nhận đúng một thông báo cho khoá đó.
   */
  @Prop({ type: String, default: undefined })
  dedupeKey?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

/** Danh sách của một tài khoản, mới nhất trước. */
NotificationSchema.index({ userId: 1, createdAt: -1 });
/** Đếm chưa đọc - chạy mỗi lần client hỏi số trên chuông. */
NotificationSchema.index({ userId: 1, readAt: 1 });
NotificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } },
);
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NOTIFICATION_TTL_SECONDS },
);
