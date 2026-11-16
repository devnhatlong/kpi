import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TeamReportSettingDocument = TeamReportSetting & Document;

/** Khoá của bản cài đặt duy nhất - cả hệ thống dùng chung một bản. */
export const TEAM_REPORT_SETTING_KEY = 'default';

/**
 * Cài đặt chung của nghiệp vụ báo cáo - quản trị đặt, mọi đơn vị đọc chung.
 *
 * Một tài liệu duy nhất (`key = 'default'`); chưa có thì đọc mặc định.
 */
@Schema({ timestamps: true, collection: 'team_report_settings' })
export class TeamReportSetting {
  @Prop({ required: true, unique: true, trim: true })
  key!: string;

  /**
   * Hạn trình báo cáo THÁNG = ngày cuối kỳ (14) + số ngày này.
   * 0 = phải trình trong ngày 14; 3 = hạn hết ngày 17.
   */
  @Prop({ type: Number, default: 0, min: 0, max: 60 })
  monthSubmitGraceDays!: number;

  @Prop({ trim: true, default: '' })
  updatedByName!: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamReportSettingSchema =
  SchemaFactory.createForClass(TeamReportSetting);
