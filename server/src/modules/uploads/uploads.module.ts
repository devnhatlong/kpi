import { Module, forwardRef } from '@nestjs/common';
import { AuthsModule } from '../auth/auth.module';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { OnlyOfficeController } from './onlyoffice.controller';
import { OnlyOfficeService } from './onlyoffice.service';

/**
 * Tệp nằm trong GridFS nên module này không đăng ký schema nào -
 * mongoose tự quản hai collection uploads.files và uploads.chunks.
 */
@Module({
  imports: [forwardRef(() => AuthsModule)],
  controllers: [UploadsController, OnlyOfficeController],
  providers: [UploadsService, OnlyOfficeService],
  exports: [UploadsService],
})
export class UploadsModule {}
