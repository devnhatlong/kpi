import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AuthsService } from '../auth.service';

@Injectable()
export class RefreshTokenCleanupTask {
  constructor(private readonly authsService: AuthsService) {}

  /** Mỗi giờ xóa các refresh token đã revoke. */
  @Cron(CronExpression.EVERY_HOUR)
  async handlePurgeRevokedTokens() {
    await this.authsService.purgeRevokedTokens();
  }
}
