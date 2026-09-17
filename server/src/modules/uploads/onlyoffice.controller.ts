import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '@/common/decorators';
import type { JwtPayloadUser } from '@/common/interfaces/jwt-payload-user.interface';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { OnlyOfficeService } from './onlyoffice.service';
import { asciiFallbackName } from './upload-file.utils';

@ApiTags('OnlyOffice')
@Controller('onlyoffice')
export class OnlyOfficeController {
  constructor(private readonly onlyOffice: OnlyOfficeService) {}

  @ApiOperation({ summary: 'Có Document Server để xem tệp trực tiếp không' })
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @Get('status')
  status() {
    return { message: 'OK', data: { enabled: this.onlyOffice.enabled } };
  }

  @ApiOperation({ summary: 'Cấu hình mở một tệp bằng OnlyOffice (chỉ xem)' })
  @ApiBearerAuth()
  @UseGuards(JwtGuard)
  @Get('config/:id')
  async config(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    const data = await this.onlyOffice.viewerConfig(id, {
      id: user.uid,
      name: user.uid,
    });
    return { message: 'OK', data };
  }

  /*
    Document Server (container) gọi về đây để kéo tệp - không có Bearer token,
    xác thực bằng vé HMAC ngắn hạn trong URL do `viewerConfig` cấp.
  */
  @ApiOperation({ summary: 'Document Server tải tệp về (vé HMAC)' })
  @Get('files/:id')
  async file(
    @Param('id') id: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const file = await this.onlyOffice.openForDocumentServer(id, exp, sig);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiFallbackName(file.fileName)}"; ` +
        `filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    );
    res.setHeader('Cache-Control', 'no-store');
    file.stream.pipe(res);
  }
}
