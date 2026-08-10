import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
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
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { CurrentUser } from '@/common/decorators';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  UPLOAD_ROOT,
  UploadsService,
} from './uploads.service';

/** Năm/tháng để một thư mục không phình ra hàng vạn tệp. */
function monthFolder() {
  const now = new Date();
  return join(
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0'),
  );
}

@ApiTags('Uploads')
@ApiBearerAuth()
@UseGuards(JwtGuard)
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
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const absolute = join(UPLOAD_ROOT, monthFolder());
          mkdirSync(absolute, { recursive: true });
          cb(null, absolute);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase();
          cb(null, `${randomBytes(16).toString('hex')}${ext}`);
        },
      }),
      limits: { fileSize: MAX_UPLOAD_BYTES },
      // Chặn trước khi ghi ra đĩa, không để tệp lạ nằm lại trong uploads/.
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
          cb(
            new BadRequestException(
              `Không nhận tệp đuôi "${ext || 'không rõ'}".`,
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  async upload(
    @CurrentUser() user: JwtPayloadUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Chưa chọn tệp.');

    const data = await this.uploadsService.register({
      originalName: file.originalname,
      relativePath: join(monthFolder(), file.filename),
      mimeType: file.mimetype,
      size: file.size,
      uploadedById: user.uid,
    });

    return { message: 'Đã tải tệp lên.', data };
  }

  @ApiOperation({ summary: 'Tải tệp về theo id' })
  @Get(':id')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { doc, stream } = await this.uploadsService.openForDownload(id);

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Length', String(doc.size));
    // encodeURIComponent để tên tiếng Việt không làm hỏng header.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
    );
    stream.pipe(res);
  }
}
