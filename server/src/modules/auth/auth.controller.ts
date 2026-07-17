import { Controller, Post, UseGuards, Req } from '@nestjs/common';
import { AuthsService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';

@Controller('auth')
export class AuthsController {
  constructor(private readonly authsService: AuthsService) { }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Req() req: any) {
    return this.authsService.login(req.user);
  }
}
