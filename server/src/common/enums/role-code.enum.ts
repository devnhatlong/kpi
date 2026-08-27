/**
 * Bậc nghiệp vụ từ cao xuống thấp:
 * CAT_ADMIN › UNIT_ADMIN › VICE_UNIT_ADMIN › MANAGER › STAFF.
 * SUPER_ADMIN đứng ngoài chuỗi đó - xem chú thích bên dưới.
 */
export enum RoleCode {
    /** Chỉ cấu hình hệ thống, không nằm trong chuỗi báo cáo. */
    SUPER_ADMIN = 'SUPER_ADMIN',
    /** Cấp cao nhất của chuỗi nghiệp vụ - nhận báo cáo tổng hợp từ các đơn vị. */
    CAT_ADMIN = 'CAT_ADMIN',
    /** Trưởng phòng, trưởng xã. */
    UNIT_ADMIN = 'UNIT_ADMIN',
    /** Phó phòng, phó xã - đứng thay trưởng nên giữ đúng bộ quyền của trưởng. */
    VICE_UNIT_ADMIN = 'VICE_UNIT_ADMIN',
    /** Đội trưởng. */
    MANAGER = 'MANAGER',
    /** Cán bộ chiến sĩ. */
    STAFF = 'STAFF',
}