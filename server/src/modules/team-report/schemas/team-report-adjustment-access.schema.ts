import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Department } from '@/modules/departments/schemas/department.schema';
import { User } from '@/modules/users/schemas/user.schema';

export type TeamReportAdjustmentAccessDocument = TeamReportAdjustmentAccess &
  Document;

/**
 * Ai được NHẬP "Bảng đề xuất điểm cộng, điểm trừ và điều chỉnh, khống chế mức
 * xếp loại" - quản trị đặt, một bản duy nhất cho cả hệ.
 *
 * Ba cách khoanh, dùng được cùng lúc và khớp MỘT trong ba là đủ:
 * - theo VAI TRÒ (mã vai trò),
 * - theo TÀI KHOẢN (chỉ đích danh),
 * - theo ĐƠN VỊ / KHỐI (tick một khối và bật "cả cấp dưới" là mọi đơn vị trong
 *   khối đó được nhập).
 *
 * Chưa đặt gì cả (cả ba rỗng) thì rơi về luật cũ: ai có quyền nhập báo cáo
 * ngày (TEAM_REPORT_ENTRY) thì nhập được. Quản trị hệ thống luôn qua.
 *
 * Để trong module này chứ không nhét vào vai trò / quyền: đây là luật của
 * riêng một bảng, thêm một mã quyền mới cho nó là bắt quản trị đi sửa từng vai
 * trò trong khi họ chỉ muốn nói "phòng X và đội Y được nhập".
 */
@Schema({ timestamps: true, collection: 'team_report_adjustment_access' })
export class TeamReportAdjustmentAccess {
  /** Khoá cố định - chỉ có đúng một bản ghi. */
  @Prop({ required: true, unique: true, default: 'default' })
  key!: string;

  @Prop({ type: [String], default: [] })
  roleCodes!: string[];

  @Prop({ type: [Types.ObjectId], ref: User.name, default: [] })
  userIds!: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: Department.name, default: [] })
  departmentIds!: Types.ObjectId[];

  /** Đơn vị đã tick thì mọi đơn vị con cháu của nó cũng được nhập. */
  @Prop({ default: true })
  includeDescendants!: boolean;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  updatedById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  updatedByName!: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamReportAdjustmentAccessSchema = SchemaFactory.createForClass(
  TeamReportAdjustmentAccess,
);
