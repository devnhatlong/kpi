import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '@/common/decorators';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { UploadsService } from './uploads.service';
import { UploadExceptionFilter } from './upload-exception.filter';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  asciiFallbackName,
  contentMatchesExtension,
  fixOriginalName,
  isAllowedExtension,
} from './upload-file.utils';

@ApiTags('Uploads')
@ApiBearerAuth()
// Guard chạy trước interceptor, nên request thiếu token bị chặn TRƯỚC khi
// multer nạp 20MB vào RAM.
@UseGuards(JwtGuard)
@UseFilters(UploadExceptionFilter)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @ApiOperation({ summary: 'Tải một tệp lên, trả về id để gắn vào nhiệm vụ' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      // Giữ trong RAM rồi đẩy thẳng vào GridFS - không sinh tệp tạm trên đĩa.
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async upload(
    @CurrentUser() user: JwtPayloadUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Chưa chọn tệp.');

    // Tên tiếng Việt bị busboy đọc thành Latin-1; phải sửa trước khi lưu.
    const originalName = fixOriginalName(file.originalname);

    if (!isAllowedExtension(originalName)) {
      throw new BadRequestException(
        `Chỉ nhận tệp: ${ALLOWED_UPLOAD_EXTENSIONS.join(', ')}.`,
      );
    }
    if (!contentMatchesExtension(file.buffer, originalName)) {
      throw new BadRequestException(
        'Nội dung tệp không đúng định dạng - có thể tệp hỏng hoặc bị đổi đuôi.',
      );
    }

    const data = await this.uploadsService.saveBuffer({
      originalName,
      mimeType: file.mimetype,
      buffer: file.buffer,
      uploadedById: user.uid,
    });

    return { message: 'Đã tải tệp lên.', data };
  }

  @ApiOperation({ summary: 'Tải tệp về theo id' })
  @Get(':id')
  async download(@Param('id') id: string, @Res() res: Response) {
    const file = await this.uploadsService.openForDownload(id);

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    // Vừa có bản ASCII cho trình duyệt cũ, vừa có bản UTF-8 giữ tên tiếng Việt.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallbackName(file.fileName)}"; ` +
        `filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    // Không cache: mở lại cùng một tệp sau khi thay nội dung không bị bản cũ.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    file.stream.pipe(res);
  }
}
