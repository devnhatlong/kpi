import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { UsersModule } from './modules/users/users.module';
import { RequestTimingMiddleware } from './common/middlewares/request-timing.middleware';
import { AuthsModule } from './modules/auth/auth.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DepartmentLevelsModule } from './modules/department-levels/department-levels.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { SystemModule } from './modules/system/system.module';
import { MissionFormConfigModule } from './modules/mission-form-config/mission-form-config.module';
import { PersonalMissionModule } from './modules/personal-mission/personal-mission.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { MissionAssignmentsModule } from './modules/mission-assignments/mission-assignments.module';
import { MissionScopeConfigModule } from './modules/mission-scope-config/mission-scope-config.module';
import { MissionSummaryReportsModule } from './modules/mission-summary-reports/mission-summary-reports.module';
import { mongooseConfig } from './config/database.config';
import { JwtModule } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: mongooseConfig,
    }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
          ) as SignOptions['expiresIn'],
        },
      }),
      global: true,
    }),
    UsersModule,
    AuthsModule,
    DepartmentsModule,
    DepartmentLevelsModule,
    RolesModule,
    PermissionsModule,
    SystemModule,
    MissionFormConfigModule,
    PersonalMissionModule,
    MissionSummaryReportsModule,
    MissionScopeConfigModule,
    MissionAssignmentsModule,
    UploadsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestTimingMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
