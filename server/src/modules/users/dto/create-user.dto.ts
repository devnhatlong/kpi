import { Type } from "class-transformer";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class CreateUserDto {
    @IsString({ message: 'Name phải là một chuỗi' })
    name!: string;

    @IsNumber({}, { message: 'Age phải là một số' },)
    @Type(() => Number)
    age!: number;

    @IsNotEmpty()
    password!: string;
}
