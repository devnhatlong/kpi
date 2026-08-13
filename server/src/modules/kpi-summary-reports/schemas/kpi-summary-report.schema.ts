import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { PersonalKpiItem } from '@/modules/personal-kpi/schemas/personal-kpi-item.schema';
import { User } from '@/modules/users/schemas/user.schema';

export type KpiSummaryReportDocument = HydratedDocument<KpiSummaryReport>;

/**
 * - DRAFT     : còn sửa được, thêm bớt nhiệm vụ thoải mái
 * - FINALIZED : đã chốt, khoá danh sách nhiệm vụ - chỉ còn xem và xuất file
 */
export const KPI_SUMMARY_REPORT_STATUSES = ['DRAFT', 'FINALIZED'] as const;

export type KpiSummaryReportStatus =
  (typeof KPI_SUMMARY_REPORT_STATUSES)[number];

/**
 * Báo cáo tổng: một tập nhiệm vụ KPI cá nhân ĐÃ HOÀN THÀNH được người lập nhặt
 * ra và gom lại, trải hết các trục.
 *
 * Chỉ giữ `itemIds` chứ không chép nội dung nhiệm vụ sang đây. Nhiệm vụ đã
 * COMPLETED là điểm dừng của chuỗi duyệt nên nội dung gần như đứng yên, mà giữ
 * tham chiếu thì báo cáo luôn khớp với dữ liệu gốc thay vì trôi thành hai bản.
 * Bù lại, cần bản đóng băng thật sự thì xuất file ra giữ.
 */
@Schema({ timestamps: true, collection: 'kpi_summary_reports' })
export class KpiSummaryReport {
  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  /** Kỳ báo cáo theo ngày báo cáo của nhiệm vụ (YYYY-MM-DD). */
  @Prop({ trim: true, default: '', index: true })
  fromDate!: string;

  @Prop({ trim: true, default: '', index: true })
  toDate!: string;

  @Prop({ trim: true, default: '', maxlength: 2000 })
  note!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  ownerId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  ownerName!: string;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null, index: true })
  ownerDepartmentId!: Types.ObjectId | null;

  /** Nhiệm vụ đã nhặt vào báo cáo, giữ nguyên thứ tự người lập tích. */
  @Prop({
    type: [{ type: Types.ObjectId, ref: PersonalKpiItem.name }],
    default: [],
    index: true,
  })
  itemIds!: Types.ObjectId[];

  /**
   * Số nhiệm vụ, chép lại để danh sách báo cáo khỏi phải nạp cả mảng itemIds.
   * Luôn ghi cùng lúc với itemIds.
   */
  @Prop({ default: 0, min: 0 })
  itemCount!: number;

  @Prop({
    type: String,
    enum: KPI_SUMMARY_REPORT_STATUSES,
    default: 'DRAFT',
    index: true,
  })
  status!: KpiSummaryReportStatus;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  finalizedById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  finalizedAt!: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const KpiSummaryReportSchema =
  SchemaFactory.createForClass(KpiSummaryReport);

/** Danh sách báo cáo của tôi, mới nhất trước. */
KpiSummaryReportSchema.index({ ownerId: 1, createdAt: -1 });

/** Tra ngược "nhiệm vụ này đã nằm trong báo cáo nào chưa". */
KpiSummaryReportSchema.index({ itemIds: 1, ownerId: 1 });
