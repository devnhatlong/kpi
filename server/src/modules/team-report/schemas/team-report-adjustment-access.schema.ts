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

  /*
    Chỉ luật LUỒNG TRÌNH (key 'recipients') dùng: luồng áp cho NGƯỜI GỬI nào.
    Rỗng cả hai = mọi người gửi. Người gửi không khớp thì đi mặc định (cấp
    trên trực tiếp) - để "phòng gửi xuống đội" không làm đội mất đường gửi
    lên phòng.
  */
  @Prop({ type: [String], default: [] })
  senderRoleCodes!: string[];

  @Prop({ type: [Types.ObjectId], ref: User.name, default: [] })
  senderUserIds!: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: Department.name, default: [] })
  senderDepartmentIds!: Types.ObjectId[];

  @Prop({ default: true })
  senderIncludeDescendants!: boolean;

  /**
   * Hướng gửi của luồng: 'DOWN' = người gửi khớp vế trên trình XUỐNG các đơn
   * vị cấp dưới của mình; 'UP' (mặc định) = lên cấp trên trực tiếp có quyền
   * duyệt, như báo cáo tổng hợp.
   */
  @Prop({ type: String, enum: ['UP', 'DOWN'], default: 'UP' })
  direction!: 'UP' | 'DOWN';

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
