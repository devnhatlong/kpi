import { applyDecorators } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export const StringRequired = (name: string) => applyDecorators(
    ApiProperty({ description: 'Tên người dùng', example: 'Nguyen Nhat Long', type: String, required: true }),
    IsString({ message: `${name} phải là một chuỗi` }),
    IsNotEmpty({ message: `${name} không được để trống` })
);

export const StringNotRequired = applyDecorators(
    ApiProperty({ description: 'Tên người dùng', example: 'Nguyen Nhat Long', type: String, required: false }),
    IsString(),
    IsNotEmpty()
);

export const NumberRequired = applyDecorators(

);

export const NumberNotRequired = applyDecorators(
    ApiProperty({ description: 'Tuổi', example: 26, type: Number, required: false }),
    IsOptional(),
    Type(() => Number),
    IsNumber()
);

export const BooleanRequired = applyDecorators(

);

export const BooleanNotRequired = applyDecorators(
    ApiProperty({ required: false }),
    IsOptional(),
    IsBoolean()
);