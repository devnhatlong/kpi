/** Độ dài tối thiểu cho mật khẩu người dùng TỰ đặt (đổi mật khẩu, đăng ký). */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Mật khẩu mặc định cấp cho tài khoản nhập từ Excel. Đăng nhập bằng đúng chuỗi
 * này là tài khoản bị gắn cờ phải đổi mật khẩu - kể cả tài khoản tạo từ trước
 * khi có cờ, vì ai cũng đoán được chuỗi này.
 */
export const DEFAULT_IMPORT_PASSWORD = '123456';

/**
 * Các route vẫn gọi được khi tài khoản đang bị bắt đổi mật khẩu - đủ để xem
 * mình là ai, đổi mật khẩu và đăng xuất. So theo đuôi đường dẫn (sau prefix
 * /api/v1).
 */
export const PASSWORD_CHANGE_ALLOWED_PATHS = [
  '/auth/me',
  '/auth/change-password',
  '/auth/logout',
  '/auth/logout-all',
  '/system/server-time',
];
