import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/response.intercepter';
import { AllExceptionFilter } from './common/filters/all-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const port = configService.get('port');

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // xóa các filed dư thừa không có trong DTO
    forbidNonWhitelisted: true, // báo lỗi nếu có các filed dư thừa không có trong DTO
    transform: true, // chuyển payload thành instance của DTO
    // transformOptions: {
    //   enableImplicitConversion: true, // tự động chuyển đổi các kiểu dữ liệu cơ bản (string, number, boolean) mà không cần sử dụng @Type() trong DTO
    // },
  }));

  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionFilter());

  app.setGlobalPrefix('api/v1');

  await app.listen(port);
}
bootstrap();
