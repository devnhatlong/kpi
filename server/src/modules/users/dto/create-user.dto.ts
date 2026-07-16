
import { NumberNotRequired, StringRequired } from "src/common/decorators";

export class CreateUserDto {
    @StringRequired('Name')
    name!: string;

    @NumberNotRequired
    age!: number;

    @StringRequired('Password')
    password!: string;
}
