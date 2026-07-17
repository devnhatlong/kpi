import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { TransformInterceptor } from './common/interceptors/response.intercepter';
import { AllExceptionFilter } from './common/filters/all-exception.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1');

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

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('KPI API')
    .setDescription('Xây dựng API cho hệ thống quản lý và chấm điểm KPI')
    .setVersion('1.0')
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, documentFactory);

  const port = configService.get('PORT');

  logger.log(`Server is running on port ${port}`);
  logger.log(`Swagger docs available at http://localhost:${port}/api/v1/docs`);

  await app.listen(port);
}
bootstrap();
