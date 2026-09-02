import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

import { Department } from '@/modules/departments/schemas/department.schema';
import { User } from '@/modules/users/schemas/user.schema';
import { Axis } from '@/modules/mission-form-config/schemas/axis.schema';
import { FormTemplate } from '@/modules/mission-form-config/schemas/form-template.schema';
import { WorkContent } from '@/modules/mission-form-config/schemas/work-content.schema';

export type TeamReportTaskDocument = TeamReportTask & Document;

/** Tệp kiểm chứng đính kèm một nhiệm vụ. */
@Schema({ _id: false })
export class TeamReportEvidence {
  @Prop({ type: Types.ObjectId, required: true })
  uploadId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  name!: string;

  @Prop({ trim: true, default: '' })
  url!: string;
}

export const TeamReportEvidenceSchema =
  SchemaFactory.createForClass(TeamReportEvidence);

/** Ai sửa gì trên nhiệm vụ - dùng cho cả đội lẫn cấp phòng. */
@Schema({ _id: false })
export class TeamReportEdit {
  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  byId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  byName!: string;

  /** Đơn vị của người sửa - phân biệt đội tự sửa với phòng chỉnh lại. */
  @Prop({ type: Types.ObjectId, ref: Department.name, default: null })
  byDepartmentId!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  field!: string;

  @Prop({ trim: true, default: '' })
  from!: string;

  @Prop({ trim: true, default: '' })
  to!: string;

  @Prop({ trim: true, default: '' })
  reason!: string;

  @Prop({ type: Date, default: Date.now })
  at!: Date;
}

export const TeamReportEditSchema =
  SchemaFactory.createForClass(TeamReportEdit);

/**
 * Một nhiệm vụ của đội - thực thể SỐNG, không thuộc riêng ngày nào.
 *
 * Khác hẳn `personal_mission_items` của bản nghiệp vụ cũ: ở đó mỗi bản ghi gắn
 * chặt vào một `reportDate` và một cán bộ. Ở đây nhiệm vụ do CẢ ĐỘI khai qua
 * một tài khoản chung, sống qua nhiều ngày, và mỗi ngày được chụp lại một bản
 * vào `team_report_days`.
 *
 * Hai giai đoạn nhập nằm chung một bản ghi: nhóm trường GĐ1 do bất kỳ ai trong
 * đội gõ, nhóm GĐ2 do một người phân loại. Tách thành hai collection thì mỗi
 * dòng phải ghép lại lúc đọc mà chẳng được gì - chúng luôn đi cùng nhau.
 */
@Schema({ timestamps: true, collection: 'team_report_tasks' })
export class TeamReportTask {
  /** Đội sở hữu. Mọi truy vấn đều bắt đầu từ đây. */
  @Prop({
    type: Types.ObjectId,
    ref: Department.name,
    required: true,
    index: true,
  })
  departmentId!: Types.ObjectId;

  // ------------------------------------------------ giai đoạn 1: nhập thô

  @Prop({ required: true, trim: true })
  name!: string;

  /** Hạn hoàn thành (YYYY-MM-DD, giờ server); rỗng = không đặt hạn. */
  @Prop({ trim: true, default: '' })
  deadline!: string;

  /**
   * Điểm chuẩn do đội tự khai ở GĐ1.
   *
   * Lúc này chưa biết nhiệm vụ thuộc nội dung công việc nào nên chưa có dải
   * nhóm điểm để chiếu - phải gõ tay. Sang GĐ2 phân loại xong mới đối chiếu lại
   * được với dải của nhóm điểm.
   */
  @Prop({ type: Number, default: null })
  standardScore!: number | null;

  @Prop({ type: [TeamReportEvidenceSchema], default: [] })
  evidence!: TeamReportEvidence[];

  // --------------------------------------------- giai đoạn 2: phân loại

  /**
   * Trục công tác. Chọn trục là quyết định luôn BỘ CỘT của phần phân loại -
   * mỗi trục dùng một mẫu bảng do quản trị cấu hình sẵn.
   */
  @Prop({
    type: Types.ObjectId,
    ref: Axis.name,
    default: null,
    index: true,
  })
  axisId!: Types.ObjectId | null;

  /** Nội dung công việc thuộc trục trên - lấy từ danh mục dùng chung. */
  @Prop({
    type: Types.ObjectId,
    ref: WorkContent.name,
    default: null,
    index: true,
  })
  workContentId!: Types.ObjectId | null;

  /**
   * Mẫu bảng đã dùng lúc phân loại, kèm số phiên bản.
   *
   * Đóng dấu lại chứ không tra live mỗi lần đọc: quản trị sửa mẫu về sau thì
   * nhiệm vụ cũ vẫn phải bày đúng bộ cột lúc khai, không thì cột biến mất mà
   * giá trị vẫn nằm đó không ai hiểu là của cột nào.
   */
  @Prop({ type: Types.ObjectId, ref: FormTemplate.name, default: null })
  formTemplateId!: Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  formTemplateVersion!: number | null;

  /**
   * Giá trị các cột chữ / số / ngày của mẫu, khoá là `FormTemplateColumn.key`.
   *
   * Không dựng trường cứng cho tiến độ hay chất lượng nữa: mỗi trục một bộ cột
   * khác nhau do quản trị cấu hình, đặt trường cứng là chỉ đúng với một trục.
   */
  @Prop({ type: Object, default: {} })
  fieldValues!: Record<string, string | number>;

  /**
   * Giá trị các cột lấy từ danh mục (nhóm điểm, mức chất lượng, tiêu chí...),
   * khoá cũng là khoá cột. Chép sẵn cả tên để bảng đọc được mà không phải tra
   * lại danh mục, và để tên giữ nguyên nếu danh mục đổi về sau.
   */
  @Prop({ type: Object, default: {} })
  catalogValues!: Record<string, { id: string; name: string }>;

  // ------------------------------------------------------ cấp trên chỉnh

  /**
   * Giá trị cấp trên chấm lại, đè lên số đội khai. Cùng khoá cột với trên.
   *
   * Để riêng chứ không ghi đè thẳng: phải đọc được cả hai để đối chiếu, và để
   * biết ô nào đã bị cấp trên động vào.
   */
  @Prop({ type: Object, default: {} })
  reviewValues!: Record<string, string | number>;

  @Prop({ type: Object, default: {} })
  reviewCatalogValues!: Record<string, { id: string; name: string }>;

  @Prop({ type: [TeamReportEditSchema], default: [] })
  edits!: TeamReportEdit[];

  // ------------------------------------------------------------ vòng đời

  /**
   * Còn nằm trong bảng ngày hay không.
   *
   * Đóng khi đội khai đủ kết quả rồi gửi lượt của ngày đó, hoặc khi đội chủ
   * động dừng. Việc đã đóng không hiện lại ở bảng ngày hôm sau.
   */
  @Prop({ default: true, index: true })
  isOpen!: boolean;

  /** Ngày đóng (YYYY-MM-DD); rỗng = còn mở. */
  @Prop({ trim: true, default: '' })
  closedDate!: string;

  /** Lý do dừng giữa chừng - bắt buộc khi đóng mà chưa xong. */
  @Prop({ trim: true, default: '' })
  closedReason!: string;

  /** Ngày khai (YYYY-MM-DD) - bảng ngày nào cũng cần biết việc có từ bao giờ. */
  @Prop({ required: true, trim: true, index: true })
  createdDate!: string;

  /**
   * Số hiệu bản, tăng mỗi lần ghi.
   *
   * Cả đội dùng chung một tài khoản và cùng gõ vào một bảng, nên server không
   * phân biệt được ai đang sửa. Client gửi kèm số bản đang cầm; lệch thì server
   * từ chối và chỉ dòng đó báo "vừa được sửa" - không ai đè mất phần của ai.
   */
  @Prop({ type: Number, default: 1 })
  version!: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeamReportTaskSchema =
  SchemaFactory.createForClass(TeamReportTask);

/** Bảng nhập của đội: việc còn mở, mới nhất lên trước. */
TeamReportTaskSchema.index({ departmentId: 1, isOpen: 1, createdDate: -1 });

/** Tab phân loại: việc còn mở mà chưa gán nội dung công việc. */
TeamReportTaskSchema.index({ departmentId: 1, isOpen: 1, workContentId: 1 });

/** Gom theo trục khi cấp trên đọc báo cáo. */
TeamReportTaskSchema.index({ departmentId: 1, axisId: 1, createdDate: -1 });
