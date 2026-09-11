import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdjustmentItemDocument = HydratedDocument<AdjustmentItem>;

/**
 * Ba phần của "Bảng đề xuất điểm cộng, điểm trừ và điều chỉnh, khống chế mức
 * xếp loại":
 *
 * - BONUS   (I)   Điểm cộng - có "Tối đa", tổng trần 10 điểm.
 * - PENALTY (II)  Điểm trừ - mức trừ theo lần / theo nhiệm vụ, không có trần
 *                 riêng từng dòng.
 * - RANKING (III) Đề xuất điều chỉnh, khống chế mức xếp loại - không có điểm,
 *                 chỉ có "mức xử lý" và "trường hợp áp dụng".
 */
export const ADJUSTMENT_SECTIONS = ['BONUS', 'PENALTY', 'RANKING'] as const;
export type AdjustmentSection = (typeof ADJUSTMENT_SECTIONS)[number];

/** Tiền tố mã theo phần - nhìn mã là biết dòng thuộc bảng nào. */
export const ADJUSTMENT_CODE_PREFIX: Record<AdjustmentSection, string> = {
  BONUS: 'DC',
  PENALTY: 'DT',
  RANKING: 'XL',
};

/**
 * Một dòng "nội dung để soi chiếu" của bảng đề xuất điểm cộng / trừ / xếp loại.
 *
 * Danh mục PHẲNG do quản trị khai sẵn, y như tiêu chí chung: nửa trái của bảng
 * (STT, nội dung, điều kiện & mức điểm, tối đa) là chữ in sẵn của văn bản; nửa
 * phải (kết quả cụ thể, điểm đề xuất) mới là phần đơn vị điền theo tháng. Ở
 * đây chỉ giữ nửa trái.
 *
 * Ba phần dùng chung một collection với trường `section` chứ không tách ba:
 * cùng hình dạng (tên + điều kiện + thứ tự), tách ra là ba bộ CRUD giống hệt
 * nhau.
 */
@Schema({ timestamps: true, collection: 'mission_adjustment_items' })
export class AdjustmentItem {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  code!: string;

  @Prop({
    type: String,
    enum: ADJUSTMENT_SECTIONS,
    required: true,
    index: true,
  })
  section!: AdjustmentSection;

  /**
   * Cột thứ hai của mỗi phần: "Nội dung cộng điểm" / "Nội dung, điều kiện trừ
   * điểm" / "Mức xử lý".
   */
  @Prop({ required: true, trim: true })
  name!: string;

  /**
   * Cột thứ ba: "Điều kiện, mức điểm" / "Mức điểm trừ" / "Trường hợp áp dụng".
   * Chữ dài cả đoạn, chép nguyên từ văn bản.
   */
  @Prop({ trim: true, default: '' })
  rule!: string;

  /**
   * Cột "Tối đa" - chỉ phần ĐIỂM CỘNG có. Hai phần kia để null: điểm trừ tính
   * theo lần, xếp loại không có điểm.
   */
  @Prop({ type: Number, default: null, min: 0 })
  maxScore!: number | null;

  @Prop({ default: 0, min: 0 })
  sortOrder!: number;

  @Prop({ default: true, index: true })
  isActive!: boolean;
}

export const AdjustmentItemSchema =
  SchemaFactory.createForClass(AdjustmentItem);
AdjustmentItemSchema.index({ section: 1, sortOrder: 1, name: 1 });
