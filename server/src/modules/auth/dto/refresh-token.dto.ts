import { StringNotRequired } from '@/common/decorators';

export class RefreshTokenDto {
  /**
   * Refresh token giờ đi trong cookie HttpOnly. Trường này chỉ còn để phiên
   * cũ (token đang nằm trong localStorage từ trước khi đổi) chuyển sang cookie
   * mà không bắt người dùng đăng nhập lại.
   */
  @StringNotRequired('Refresh token (phiên cũ)')
  refreshToken?: string;
}
