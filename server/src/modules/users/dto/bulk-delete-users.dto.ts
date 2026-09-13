import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsMongoId,
} from 'class-validator';

export class BulkDeleteUsersDto {
  @ApiProperty({
    type: [String],
    description: 'Danh sách id người dùng cần xoá',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Chưa chọn người dùng nào.' })
  @ArrayMaxSize(500, { message: 'Mỗi lượt xoá tối đa 500 người dùng.' })
  @IsMongoId({ each: true })
  ids!: string[];
}
