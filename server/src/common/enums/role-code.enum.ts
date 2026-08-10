export enum RoleCode {
    /** Chỉ cấu hình hệ thống, không nằm trong chuỗi báo cáo. */
    SUPER_ADMIN = 'SUPER_ADMIN',
    /** Cấp cao nhất của chuỗi nghiệp vụ - nhận báo cáo tổng hợp từ các đơn vị. */
    CAT_ADMIN = 'CAT_ADMIN',
    UNIT_ADMIN = 'UNIT_ADMIN',
    MANAGER = 'MANAGER',
    STAFF = 'STAFF',
}