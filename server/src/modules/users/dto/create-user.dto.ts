import { BooleanNotRequired, StringNotRequired, StringRequired } from "@/common/decorators";

export class CreateUserDto {
    @StringRequired('Tên đăng nhập', { example: 'longnguyen' })
    username!: string;

    @StringRequired('Mật khẩu', { example: '123456' })
    password!: string;

    @StringNotRequired('Họ và tên', { example: 'Nguyễn Nhật Long' })
    fullName!: string;

    @StringNotRequired('Email', { example: 'long@example.com' })
    email?: string;

    @StringNotRequired('Số điện thoại', { example: '0901234567' })
    phone?: string;

    @StringNotRequired('Mã đơn vị', { example: '507f1f77bcf86cd799439011' })
    departmentId?: string;

    @BooleanNotRequired('Trạng thái hoạt động', { example: true })
    isActive?: boolean;
}