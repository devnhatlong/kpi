import { StringRequired } from '@/common/decorators';

export class RefreshTokenDto {
  @StringRequired('Refresh token')
  refreshToken!: string;
}
