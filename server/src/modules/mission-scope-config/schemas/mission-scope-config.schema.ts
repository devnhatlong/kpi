import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { MISSION_SCOPES, type MissionScope } from '../mission-scope.constants';

export type MissionScopeConfigDocument = HydratedDocument<MissionScopeConfig>;

/** Phạm vi giao nhiệm vụ của một vai trò. */
@Schema({ timestamps: true, collection: 'mission_scope_configs' })
export class MissionScopeConfig {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  roleCode!: string;

  /** Tắt = vai trò này không giao được nhiệm vụ cho bất kỳ phạm vi nào. */
  @Prop({ default: false })
  isEnabled!: boolean;

  @Prop({ type: [String], enum: MISSION_SCOPES, default: [] })
  scopes!: MissionScope[];

  /** Tắt = kết quả gửi lên tự động duyệt, không cần cấp trên xác nhận. */
  @Prop({ default: true })
  requireApproval!: boolean;

  @Prop({ trim: true, default: '' })
  note!: string;
}

export const MissionScopeConfigSchema =
  SchemaFactory.createForClass(MissionScopeConfig);
