import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PermissionDocument = HydratedDocument<PermissionEntity>;

@Schema({
  timestamps: true,
  collection: 'permissions',
})
export class PermissionEntity {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  })
  code!: string;

  @Prop({
    required: true,
    trim: true,
  })
  name!: string;

  @Prop({
    trim: true,
  })
  description?: string;

  @Prop({
    trim: true,
    lowercase: true,
    default: 'general',
    index: true,
  })
  module!: string;

  /**
   * Thứ tự hiển thị (nhỏ hơn = đứng trước).
   */
  @Prop({
    required: true,
    default: 0,
    min: 0,
    index: true,
  })
  sortOrder!: number;

  /**
   * Quyền hệ thống (seed) không nên xóa nếu đang được dùng.
   */
  @Prop({
    default: false,
  })
  isSystem!: boolean;

  @Prop({
    default: true,
    index: true,
  })
  isActive!: boolean;
}

export const PermissionSchema = SchemaFactory.createForClass(PermissionEntity);
