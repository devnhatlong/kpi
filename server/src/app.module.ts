import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from './modules/users/users.module';
import { RequestTimingMiddleware } from './common/middlewares/request-timing.middleware';
import { AuthsModule } from './modules/auth/auth.module';
import { DepartmentsModule } from './modules/departments/departments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    AuthsModule,
    DepartmentsModule,
    AuthsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestTimingMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
