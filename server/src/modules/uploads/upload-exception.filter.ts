import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { MAX_UPLOAD_BYTES } from './upload-file.utils';

/**
 * Multer báo lỗi bằng tiếng Anh ("File too large") và Nest bọc thành
 * PayloadTooLargeException, người dùng cuối đọc không hiểu. Filter này dịch lại
 * và giữ nguyên khuôn phản hồi chung của hệ thống.
 */
@Catch(PayloadTooLargeException)
export class UploadExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const megabytes = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

    response.status(exception.getStatus()).json({
      success: false,
      message: `Tệp vượt quá ${megabytes}MB - hãy nén lại hoặc chia nhỏ trước khi tải lên.`,
      timestamp: new Date().toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour12: false,
      }),
      path: request.url,
    });
  }
}
