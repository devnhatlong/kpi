import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({ timestamps: true })
export class RefreshToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  /** SHA-256 hash của refresh token (không lưu plain text). */
  @Prop({ required: true, unique: true })
  tokenHash!: string;

  /** Index TTL khai báo bên dưới (schema.index), không dùng index: true ở đây. */
  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt?: Date | null;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;

export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

/** TTL: Mongo tự xóa document sau khi hết hạn. */
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
