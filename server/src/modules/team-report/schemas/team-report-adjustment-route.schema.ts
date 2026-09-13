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

  /**
   * Chỉ vế NGƯỜI NHẬN dùng: thu danh sách về đơn vị cha GẦN NHẤT của người
   * gửi (đội → phòng của mình, tổ → xã của mình). "Trưởng phòng / xã" tick ở
   * vai trò + cờ này = đúng trưởng phòng / xã trực thuộc, không phải mọi
   * trưởng phòng toàn tỉnh. Cha gần nhất không có ai khớp thì leo lên cấp kế.
   */
  @Prop({ default: false })
  senderSuperiorOnly!: boolean;

  /**
   * Chỉ vế NGƯỜI NHẬN dùng: thu danh sách về các đơn vị CẤP DƯỚI của người
   * gửi (phòng → các đội của chính phòng đó). Kết hợp với vai trò đã tick.
   */
  @Prop({ default: false })
  senderSubordinatesOnly!: boolean;
}

const ScopeSchema = SchemaFactory.createForClass(TeamReportAdjustmentScope);

/**
 * Một LUỒNG TRÌNH của bảng điểm cộng / trừ / xếp loại: người gửi khớp vế
 * `sender` thì dropdown "Trình lên" chỉ hiện người khớp vế `recipients`.
 *
 * Nhiều luồng, xét theo `sortOrder`, khớp luồng đầu tiên. Không khớp luồng nào
 * → mặc định: cấp trên trực tiếp có quyền duyệt.
 */
/** Luồng của loại báo cáo nào. */
export const TEAM_REPORT_ROUTE_KINDS = ['ADJUSTMENT', 'SUMMARY'] as const;
export type TeamReportRouteKind = (typeof TEAM_REPORT_ROUTE_KINDS)[number];

@Schema({ timestamps: true, collection: 'team_report_adjustment_routes' })
export class TeamReportAdjustmentRoute {
  /**
   * ADJUSTMENT = bảng điểm cộng / trừ / xếp loại; SUMMARY = báo cáo tổng hợp.
   * Mỗi loại một bộ luồng riêng, xét riêng.
   */
  @Prop({
    type: String,
    enum: TEAM_REPORT_ROUTE_KINDS,
    default: 'ADJUSTMENT',
    index: true,
  })
  kind!: TeamReportRouteKind;

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
TeamReportAdjustmentRouteSchema.index({ kind: 1, sortOrder: 1 });
