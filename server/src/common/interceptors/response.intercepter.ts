import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
    private getDefaultMessage(method: string): string {
        switch (method) {
            case 'POST':
                return 'Tạo mới thành công.';
            case 'PUT':
                return 'Cập nhật thành công.';
            case 'GET':
                return 'Lấy dữ liệu thành công.';
            case 'DELETE':
                return 'Xóa thành công.';
            default:
                return 'Yêu cầu đã hoàn thành.';
        }
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
        const request = context.switchToHttp().getRequest();

        const startTime = request['startTime'];
        const responseTime = startTime ? `${Date.now() - startTime}ms` : undefined;

        return next.handle().pipe(map(data => {
            const defaultMessage = this.getDefaultMessage(request.method);

            // Controller/Service đã trả đúng format hoàn chỉnh
            if (
                data &&
                typeof data === 'object' &&
                'success' in data &&
                'message' in data &&
                'data' in data
            ) {
                return data as ApiResponse<T>;
            }

            // Controller/Service trả { message, data } (+ meta nếu có)
            if (
                data &&
                typeof data === 'object' &&
                ('message' in data || 'data' in data)
            ) {
                const servicedata = data as ApiResponse<T> & { meta?: unknown };

                return {
                    success: true,
                    message: servicedata.message ?? defaultMessage,
                    data: servicedata.data as T,
                    ...(servicedata.meta !== undefined
                        ? { meta: servicedata.meta }
                        : {}),
                    timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }),
                    path: request.url,
                    responseTime: responseTime
                };
            }

            // Controller/Service chỉ trả dữ liệu thông thường
            return {
                success: true,
                message: defaultMessage,
                data: data as T,
                timestamp: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }),
                path: request.url,
                responseTime: responseTime
            };
        }));

    }
}