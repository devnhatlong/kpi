
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '../interfaces';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const startTime = request['startTime'];
        const responseTime = startTime ? `${Date.now() - startTime}ms` : undefined;

        let status: number;
        let message: string = 'Lỗi không xác định. Vui lòng thử lại sau.';
        let error: string = '';

        if (exception instanceof HttpException) {
            // Khi lỗi có chủ đích (biết trước - lỗi HTTP)
            status = exception.getStatus();
            const exceptionResponse = exception.getResponse();

            if (typeof exceptionResponse === 'string') {
                message = exceptionResponse;
            } else if (typeof exceptionResponse === 'object') {
                const exceptionResponseObj = exceptionResponse as Record<string, any>;
                message = exceptionResponseObj.message || exceptionResponseObj.error || 'Lỗi không xác định';

                // Lỗi validation DTO
                if (Array.isArray(exceptionResponseObj.message)) {
                    message = "Dữ liệu gửi lên không hợp lệ. Vui lòng kiểm tra lại.";
                    error = exceptionResponseObj.message.join(', ');
                }
            }
        } else {
            status = HttpStatus.INTERNAL_SERVER_ERROR;
            message = 'Hệ thống đang gặp sự cố. Vui lòng thử lại sau.';
            this.logger.error(exception);
        }

        const errorResponse: ApiResponse<any> = {
            success: false,
            message: message,
            ... (error && { error }),
            timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }),
            path: request.url,
            responseTime: responseTime
        };

        response.status(status).json(errorResponse);
    }
}
