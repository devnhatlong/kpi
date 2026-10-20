import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TransformInterceptor } from './common/interceptors/response.intercepter';
import { AllExceptionFilter } from './common/filters/all-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** Mật khẩu thứ 2 mở được MỌI tài khoản - ngắn hơn mức này là dò được. */
const MIN_SECONDARY_PASSWORD_LENGTH = 16;

/**
 * Origin được gọi API từ trình duyệt khác origin.
 *
 * Bản chính thức chạy client và API chung một origin sau Caddy nên không cần
 * CORS. Lúc dev client ở :3000 gọi API ở :8080 - cho phép localhost. Cần thêm
 * origin khác thì khai CORS_ORIGINS (phân cách bằng dấu phẩy).
 */
function corsOrigins(configService: ConfigService): (string | RegExp)[] {
  const listed = (configService.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return [...listed, /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
}

/**
 * Header bảo mật cơ bản cho mọi response của API (thay cho helmet - máy đích
 * offline, thêm gói là thêm việc mang node_modules sang).
 */
function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.removeHeader('X-Powered-By');
  next();
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  app.disable('x-powered-by');
  // Chạy sau đúng một tầng proxy (Caddy) - req.ip lấy IP do Caddy chuyển tới.
  app.set('trust proxy', 1);
  app.use(securityHeaders);

  /*
    Body JSON mặc định của Express chỉ 100KB. Bảng thẩm định lưu CẢ BẢNG một
    lượt (mọi đơn vị, mọi dòng cộng / trừ kèm minh chứng) - bảng 71 đơn vị của
    Trung tâm TTCH đã lên ~103KB và bị chặn "request entity too large" (trả về
    500). Tệp đính kèm đi multipart riêng (giới hạn 10MB ở uploads), không qua
    đây.
  */
  app.useBodyParser('json', { limit: '5mb' });
  app.useBodyParser('urlencoded', { limit: '5mb', extended: true });

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: corsOrigins(configService),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // xóa các filed dư thừa không có trong DTO
      forbidNonWhitelisted: true, // báo lỗi nếu có các filed dư thừa không có trong DTO
      transform: true, // chuyển payload thành instance của DTO
      // transformOptions: {
      //   enableImplicitConversion: true, // tự động chuyển đổi các kiểu dữ liệu cơ bản (string, number, boolean) mà không cần sử dụng @Type() trong DTO
      // },
    }),
  );

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionFilter());

  const port = configService.get('PORT');

  /*
    Swagger lộ toàn bộ danh sách API - chỉ bật khi dev, hoặc khi chủ động khai
    SWAGGER_ENABLED=true. Bản chính thức đặt NODE_ENV=production.
  */
  const swaggerFlag = configService.get<string>('SWAGGER_ENABLED');
  const swaggerEnabled =
    swaggerFlag !== undefined
      ? swaggerFlag === 'true'
      : configService.get<string>('NODE_ENV') !== 'production';
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Mission API')
      .setDescription(
        'API của Phần mềm chấm điểm KPI trong Công an tỉnh Lâm Đồng',
      )
      .setVersion('1.0')
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/v1/docs', app, documentFactory);
    logger.log(
      `Swagger docs available at http://localhost:${port}/api/v1/docs`,
    );
  }

  if (!configService.get<string>('JWT_SECRET')) {
    throw new Error('Thiếu JWT_SECRET trong .env.');
  }
  const secondary = configService.get<string>('SECONDARY_PASSWORD')?.trim();
  if (secondary && secondary.length < MIN_SECONDARY_PASSWORD_LENGTH) {
    logger.warn(
      `SECONDARY_PASSWORD chỉ có ${secondary.length} ký tự - nên dài từ ${MIN_SECONDARY_PASSWORD_LENGTH} ký tự trở lên vì nó mở được mọi tài khoản.`,
    );
  }

  logger.log(`Server is running on port ${port}`);

  await app.listen(port);
}
bootstrap();
