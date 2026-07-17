import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsBoolean,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
} from 'class-validator';

export { Permissions, PERMISSIONS_KEY } from './permissions.decorator';
export { Roles, ROLES_KEY } from './roles.decorator';
export { CurrentUser } from './current-user.decorator';

interface FieldOptions {
    description?: string;
    example?: unknown;
}

export const StringRequired = (name: string, opts: FieldOptions = {}) =>
    applyDecorators(
        ApiProperty({
            description: opts.description ?? name,
            example: opts.example,
            type: String,
            required: true,
        }),
        IsString({ message: `${name} phải là một chuỗi.` }),
        IsNotEmpty({ message: `${name} không được để trống.` }),
    );

export const StringNotRequired = (name: string, opts: FieldOptions = {}) =>
    applyDecorators(
        ApiProperty({
            description: opts.description ?? name,
            example: opts.example,
            type: String,
            required: false,
        }),
        IsOptional(),
        IsString({ message: `${name} phải là một chuỗi.` }),
    );

export const NumberRequired = (name: string, opts: FieldOptions = {}) =>
    applyDecorators(
        ApiProperty({
            description: opts.description ?? name,
            example: opts.example,
            type: Number,
            required: true,
        }),
        Type(() => Number),
        IsNumber({}, { message: `${name} phải là một số.` }),
        IsNotEmpty({ message: `${name} không được để trống.` }),
    );

export const NumberNotRequired = (name: string, opts: FieldOptions = {}) =>
    applyDecorators(
        ApiProperty({
            description: opts.description ?? name,
            example: opts.example,
            type: Number,
            required: false,
        }),
        IsOptional(),
        Type(() => Number),
        IsNumber({}, { message: `${name} phải là một số.` }),
    );

export const BooleanRequired = (name: string, opts: FieldOptions = {}) =>
    applyDecorators(
        ApiProperty({
            description: opts.description ?? name,
            example: opts.example,
            type: Boolean,
            required: true,
        }),
        IsBoolean({ message: `${name} phải là true hoặc false.` }),
    );

export const BooleanNotRequired = (name: string, opts: FieldOptions = {}) =>
    applyDecorators(
        ApiProperty({
            description: opts.description ?? name,
            example: opts.example,
            type: Boolean,
            required: false,
        }),
        IsOptional(),
        IsBoolean({ message: `${name} phải là true hoặc false.` }),
    );