import { ConflictException } from '@nestjs/common';
import { Document, Error as MongooseError } from 'mongoose';

/** Nhiều người dùng chung một tài khoản - ai lưu sau trên bản cũ thì gặp lỗi này. */
export const conflict = () =>
  new ConflictException(
    'Bảng vừa được người khác lưu - tải lại trang để xem bản mới rồi nhập tiếp.',
  );

/**
 * Lưu bảng CHỈ KHI trong DB vẫn là bản `expected` lúc đọc ra.
 *
 * Kiểm tra version ở đầu hàm chưa đủ: hai lượt lưu tới gần như cùng lúc đều
 * đọc được cùng một version và cùng qua. Nên điều kiện version được đưa luôn
 * vào câu lệnh ghi (`$where`) - Mongo khớp 0 bản thì lượt đó thua.
 *
 * Bảng chưa có (lượt lưu đầu của tháng): hai người cùng tạo thì index unique
 * (đơn vị, tháng) chặn người sau - cũng quy về xung đột.
 */
export async function saveIfUnchanged(sheet: Document, expected: number) {
  if (!sheet.isNew) sheet.$where = { version: expected };
  try {
    await sheet.save();
  } catch (error) {
    if (
      error instanceof MongooseError.DocumentNotFoundError ||
      (error as { code?: number })?.code === 11000
    ) {
      throw conflict();
    }
    throw error;
  }
}
