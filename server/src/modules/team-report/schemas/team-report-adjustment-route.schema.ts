import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Department } from '@/modules/departments/schemas/department.schema';
import { User } from '@/modules/users/schemas/user.schema';

export type TeamReportAdjustmentRouteDocument = TeamReportAdjustmentRoute &
  Document;

/**
 * Một vế khoanh người: vai trò / cấp đơn vị / đơn vị (kèm cấp dưới) / tài
 * khoản đích danh. Dùng cho cả "ai gửi" lẫn "gửi cho ai".
 *
 * Nghĩa khi khớp NGƯỜI GỬI: đích danh thì khớp ngay; còn lại phải thoả MỌI
 * vế đã khai (vai trò ∩ cấp ∩ đơn vị) - "trưởng phòng ở khối An ninh" là
 * người vừa giữ vai trò đó vừa ở khối đó.
 *
 * Nghĩa khi lọc NGƯỜI NHẬN: y hệt - đích danh luôn có, cộng người thoả mọi vế
 * còn lại. Rỗng cả bốn = không ràng gì (nhận: mọi người - hầu như không dùng;
 * gửi: mọi người gửi).
 */
@Schema({ _id: false })
export class TeamReportAdjustmentScope {
  @Prop({ type: [String], default: [] })
  roleCodes!: string[];

  @Prop({ type: [Types.ObjectId], default: [] })
  levelIds!: Types.ObjectId[];

  @Prop({ type: [Types.ObjectId], ref: Department.name, default: [] })
  departmentIds!: Types.ObjectId[];

  @Prop({ default: true })
  includeDescendants!: boolean;

  @Prop({ type: [Types.ObjectId], ref: User.name, default: [] })
  userIds!: Types.ObjectId[];
}

const ScopeSchema = SchemaFactory.createForClass(TeamReportAdjustmentScope);

/**
 * Một LUỒNG TRÌNH của bảng điểm cộng / trừ / xếp loại: người gửi khớp vế
 * `sender` thì dropdown "Trình lên" chỉ hiện người khớp vế `recipients`.
 *
 * Nhiều luồng, xét theo `sortOrder`, khớp luồng đầu tiên. Không khớp luồng nào
 * → mặc định: cấp trên trực tiếp có quyền duyệt.
 */
@Schema({ timestamps: true, collection: 'team_report_adjustment_routes' })
export class TeamReportAdjustmentRoute {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ default: 0 })
  sortOrder!: number;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop({ type: ScopeSchema, required: true })
  sender!: TeamReportAdjustmentScope;

  @Prop({ type: ScopeSchema, required: true })
  recipients!: TeamReportAdjustmentScope;

  @Prop({ trim: true, default: '' })
  updatedByName!: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamReportAdjustmentRouteSchema = SchemaFactory.createForClass(
  TeamReportAdjustmentRoute,
);
TeamReportAdjustmentRouteSchema.index({ sortOrder: 1 });
