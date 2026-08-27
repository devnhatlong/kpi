import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import {
  FormHeaderGroup,
  FormTemplate,
  FormTemplateColumn,
  FormTemplateColumnSchema,
  FormTemplateFooter,
  FormTemplateFooterSchema,
} from './form-template.schema';

export type FormTemplateVersionDocument = HydratedDocument<FormTemplateVersion>;

/**
 * Ảnh chụp một mẫu bảng tại thời điểm trước khi bị sửa.
 *
 * Nhiệm vụ đã gửi lưu `formTemplateId + formTemplateVersion`; nếu version đó
 * không còn là bản hiện hành thì lấy cột/nhóm header từ đây, để báo cáo cũ
 * không méo khi super admin đổi mẫu. Chỉ ghi khi mẫu thực sự bị sửa - không
 * nhân bản cột lên từng nhiệm vụ.
 */
@Schema({ timestamps: true, collection: 'mission_form_template_versions' })
export class FormTemplateVersion {
  @Prop({
    type: Types.ObjectId,
    ref: FormTemplate.name,
    required: true,
    index: true,
  })
  templateId!: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  version!: number;

  @Prop({ required: true, trim: true })
  code!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ type: [FormTemplateColumnSchema], default: [] })
  columns!: FormTemplateColumn[];

  @Prop({ type: [Object], default: [] })
  headerGroups!: FormHeaderGroup[];

  /**
   * Đổi cột mẫu số/tử số là đổi luôn ý nghĩa của dòng điểm, nên công thức phải
   * đóng băng cùng bộ cột - báo cáo cũ mở lại vẫn ra đúng con số lúc gửi.
   */
  @Prop({ type: FormTemplateFooterSchema, default: () => ({}) })
  footer!: FormTemplateFooter;
}

export const FormTemplateVersionSchema =
  SchemaFactory.createForClass(FormTemplateVersion);

FormTemplateVersionSchema.index(
  { templateId: 1, version: 1 },
  { unique: true },
);
