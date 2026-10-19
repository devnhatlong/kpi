import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
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
import { UploadAccessService } from './upload-access.service';
import { UploadExceptionFilter } from './upload-exception.filter';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  asciiFallbackName,
  contentMatchesExtension,
  fixOriginalName,
  isAllowedExtension,
  setFileSecurityHeaders,
} from './upload-file.utils';

/** Hạn mức upload: tối đa chừng này tệp mỗi tài khoản trong một cửa sổ. */
const UPLOAD_QUOTA_PER_WINDOW = 200;
const UPLOAD_QUOTA_WINDOW_MS = 60 * 60 * 1000;

@ApiTags('Uploads')
@ApiBearerAuth()
// Guard chạy trước interceptor, nên request thiếu token bị chặn TRƯỚC khi
// multer nạp 10MB vào RAM.
@UseGuards(JwtGuard)
@UseFilters(UploadExceptionFilter)
@Controller('uploads')
export class UploadsController {
  constructor(
    private readonly uploadsService: UploadsService,
    private readonly uploadAccess: UploadAccessService,
  ) {}

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

    // Hạn mức theo tài khoản: chặn một tài khoản đẩy liên tục tệp 10MB làm
    // đầy CSDL. Mức rộng hơn hẳn nhu cầu thật của một đội trong một giờ.
    const since = new Date(Date.now() - UPLOAD_QUOTA_WINDOW_MS);
    const recent = await this.uploadsService.countUploadsSince(user.uid, since);
    if (recent >= UPLOAD_QUOTA_PER_WINDOW) {
      throw new HttpException(
        'Tài khoản đã tải lên quá nhiều tệp trong một giờ. Vui lòng thử lại sau.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

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
      buffer: file.buffer,
      uploadedById: user.uid,
    });

    return { message: 'Đã tải tệp lên.', data };
  }

  @ApiOperation({ summary: 'Tải tệp về theo id' })
  @Get(':id')
  async download(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.uploadAccess.assertCanRead(user.uid, id);
    const file = await this.uploadsService.openForDownload(id);

    setFileSecurityHeaders(res);
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
