import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AuthsService } from './auth.service';
import { LoginDto } from './dto/login-auth.dto';

@Controller('auths')
export class AuthsController {
  constructor(private readonly authsService: AuthsService) { }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return await this.authsService.validateUser(loginDto.email, loginDto.password);
  }

  // @Post()
  // create(@Body() createAuthDto: CreateAuthDto) {
  //   return this.authsService.create(createAuthDto);
  // }

  // @Get()
  // findAll() {
  //   return this.authsService.findAll();
  // }

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.authsService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updateAuthDto: UpdateAuthDto) {
  //   return this.authsService.update(+id, updateAuthDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.authsService.remove(+id);
  // }
}
