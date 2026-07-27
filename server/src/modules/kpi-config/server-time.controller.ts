import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller('system')
export class ServerTimeController {
  @ApiOperation({ summary: 'Lấy giờ hiện tại của server' })
  @Get('server-time')
  getServerTime() {
    return {
      serverTime: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }
}
