import { StringRequired } from "@/common/decorators";

export class LoginDto {
    @StringRequired('Tên đăng nhập')
    username!: string;

    @StringRequired('Mật khẩu')
    password!: string;
}