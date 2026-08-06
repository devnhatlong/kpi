import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { KPI_SCOPES, type KpiScope } from '../kpi-scope.constants';

export type KpiScopeConfigDocument = HydratedDocument<KpiScopeConfig>;

/** Phạm vi giao KPI của một vai trò. */
@Schema({ timestamps: true, collection: 'kpi_scope_configs' })
export class KpiScopeConfig {
  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  roleCode!: string;

  /** Tắt = vai trò này không giao được KPI cho bất kỳ phạm vi nào. */
  @Prop({ default: false })
  isEnabled!: boolean;

  @Prop({ type: [String], enum: KPI_SCOPES, default: [] })
  scopes!: KpiScope[];

  /** Tắt = kết quả gửi lên tự động duyệt, không cần cấp trên xác nhận. */
  @Prop({ default: true })
  requireApproval!: boolean;

  @Prop({ trim: true, default: '' })
  note!: string;
}

export const KpiScopeConfigSchema =
  SchemaFactory.createForClass(KpiScopeConfig);
