import { ConfigService } from '@nestjs/config';
import { MongooseModuleOptions } from '@nestjs/mongoose';

export const mongooseConfig = (
    configService: ConfigService,
): MongooseModuleOptions => {
    const username = configService.getOrThrow<string>('DB_USERNAME');
    const password = configService.getOrThrow<string>('DB_PASSWORD');
    const host = configService.getOrThrow<string>('DB_HOST');
    const port = configService.get<string>('DB_PORT') ?? '27017';
    const database = configService.getOrThrow<string>('DB_NAME');
    const authSource = configService.getOrThrow<string>('DB_AUTH_SOURCE');

    const uri =
        `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}` +
        `@${host}:${port}/${database}` +
        `?authSource=${encodeURIComponent(authSource)}`;

    return { uri };
};