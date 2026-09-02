import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Department } from '@/modules/departments/schemas/department.schema';
import { User } from '@/modules/users/schemas/user.schema';
import {
  TeamReportDay,
  TeamReportDayRow,
  TEAM_REPORT_DAY_STATUSES,
  type TeamReportDayStatus,
} from './team-report-day.schema';

export type TeamReportUnitDayDocument = TeamReportUnitDay & Document;

/**
 * Bản chụp của phòng: một dòng nhiệm vụ kèm tên đội đã khai nó.
 *
 * Tỉnh chỉ nhận bản của phòng, không mở lẻ từng báo cáo đội, nên tên đội phải
 * nằm ngay trên dòng - không thì cả bản gộp đọc ra một mớ nhiệm vụ không rõ của
 * ai.
 */
@Schema({ _id: false })
export class TeamReportUnitDayRow extends TeamReportDayRow {
  @Prop({ type: Types.ObjectId, ref: Department.name, default: null })
  teamDepartmentId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  teamDepartmentName!: string;
}

export const TeamReportUnitDayRowSchema =
  SchemaFactory.createForClass(TeamReportUnitDayRow);

/**
 * Báo cáo ngày của PHÒNG, gộp từ báo cáo các đội trực thuộc, trình lên tỉnh.
 *
 * Tách hẳn khỏi `team_report_days` chứ không dùng chung một collection với một
 * cờ "cấp nào": hai thứ khác nhau về nguồn (đội tự khai / phòng gộp lại), khác
 * người gửi, và khác cả cách sinh ra dòng. Nhập chung là mọi truy vấn đều phải
 * kèm điều kiện lọc cấp, quên một chỗ là lẫn số của hai cấp.
 */
@Schema({ timestamps: true, collection: 'team_report_unit_days' })
export class TeamReportUnitDay {
  /** Phòng lập báo cáo. */
  @Prop({
    type: Types.ObjectId,
    ref: Department.name,
    required: true,
    index: true,
  })
  departmentId!: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  reportDate!: string;

  @Prop({
    type: String,
    enum: TEAM_REPORT_DAY_STATUSES,
    default: 'PENDING',
    index: true,
  })
  status!: TeamReportDayStatus;

  /** Các báo cáo đội đã gộp vào bản này. */
  @Prop({
    type: [{ type: Types.ObjectId, ref: TeamReportDay.name }],
    default: [],
  })
  sourceDayIds!: Types.ObjectId[];

  @Prop({ type: [TeamReportUnitDayRowSchema], default: [] })
  rows!: TeamReportUnitDayRow[];

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  sentById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  sentByName!: string;

  @Prop({ type: Date, default: null })
  sentAt!: Date | null;

  @Prop({ trim: true, default: '' })
  note!: string;

  /** Đơn vị nhận - cấp tỉnh. */
  @Prop({
    type: Types.ObjectId,
    ref: Department.name,
    default: null,
    index: true,
  })
  recipientDepartmentId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  decidedById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  decidedByName!: string;

  @Prop({ type: Date, default: null })
  decidedAt!: Date | null;

  @Prop({ trim: true, default: '' })
  returnReason!: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamReportUnitDaySchema =
  SchemaFactory.createForClass(TeamReportUnitDay);

/** Một phòng một ngày một bản gộp - cùng lý do với bảng của đội. */
TeamReportUnitDaySchema.index(
  { departmentId: 1, reportDate: 1 },
  { unique: true },
);

/** Hộp đến của tỉnh. */
TeamReportUnitDaySchema.index({
  recipientDepartmentId: 1,
  status: 1,
  reportDate: -1,
});
