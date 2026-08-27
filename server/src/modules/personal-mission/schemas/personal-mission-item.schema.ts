import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Axis } from '@/modules/mission-form-config/schemas/axis.schema';
import { FormTemplate } from '@/modules/mission-form-config/schemas/form-template.schema';
import { WorkContent } from '@/modules/mission-form-config/schemas/work-content.schema';
import { User } from '@/modules/users/schemas/user.schema';

export type PersonalMissionItemDocument = HydratedDocument<PersonalMissionItem>;

/**
 * Trạng thái duyệt TẠI CẤP ĐANG GIỮ nhiệm vụ.
 * - DRAFT    : còn ở chỗ cán bộ, chưa gửi
 * - PENDING  : đang chờ người nhận hiện tại duyệt
 * - APPROVED : cấp đang giữ đã duyệt, có thể gửi tiếp lên trên
 * - RETURNED : bị trả lại, nằm ở chỗ người gửi lượt đó để sửa
 * - COMPLETED: chốt xong, không gửi lên nữa - điểm dừng của chuỗi
 */
export const PERSONAL_MISSION_REVIEW_STATUSES = [
  'DRAFT',
  'PENDING',
  'APPROVED',
  'RETURNED',
  'COMPLETED',
] as const;

export type PersonalMissionReviewStatus =
  (typeof PERSONAL_MISSION_REVIEW_STATUSES)[number];

/**
 * Một tệp đã đính vào cột kiểu "file".
 * `id` trỏ tới bản ghi trong collection uploads; tên và cỡ chép lại để hiển thị
 * danh sách mà không phải join.
 */
export type PersonalMissionAttachment = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};

/**
 * Giá trị đã chọn ở một cột lấy từ danh mục.
 * Tên chép lại lúc lưu để báo cáo đã gửi giữ nguyên chữ tại thời điểm đó, kể cả
 * khi danh mục bị sửa về sau - cùng nguyên tắc với việc khoá phiên bản mẫu bảng.
 */
export type PersonalMissionCatalogValue = {
  id: string;
  name: string;
};

/**
 * Cán bộ cùng làm việc này, ngoài người báo cáo.
 *
 * Người xử lý CHÍNH không nằm ở đây - đó luôn là `ownerId`, tức người khai
 * nhiệm vụ. Danh sách này chỉ dành cho người phối hợp.
 *
 * Chép sẵn `name` bên cạnh `userId`: bảng báo cáo bày hàng trăm dòng, join sang
 * users cho từng dòng chỉ để lấy cái tên là quá đắt. Cán bộ đổi tên thì tên
 * trong nhiệm vụ cũ giữ nguyên - đúng thứ cần khi đọc lại báo cáo đã trình.
 */
@Schema({ _id: false })
export class PersonalMissionCollaborator {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  userId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  name!: string;
}

export const PersonalMissionCollaboratorSchema = SchemaFactory.createForClass(
  PersonalMissionCollaborator,
);

/** Một trường bị cấp trên sửa - giữ cả giá trị trước và sau. */
@Schema({ _id: false })
export class PersonalMissionFieldChange {
  @Prop({ required: true, trim: true })
  field!: string;

  @Prop({ trim: true, default: '' })
  label!: string;

  @Prop({ type: Object, default: null })
  from!: unknown;

  @Prop({ type: Object, default: null })
  to!: unknown;
}

export const PersonalMissionFieldChangeSchema = SchemaFactory.createForClass(
  PersonalMissionFieldChange,
);

/**
 * Một lần cấp trên sửa nội dung nhiệm vụ trước khi gửi lên.
 * Cán bộ khai gì vẫn tra ngược được từ `from` của lần sửa đầu tiên.
 */
@Schema({ _id: false })
export class PersonalMissionEdit {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  byId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  byName!: string;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  byDepartmentId!: Types.ObjectId | null;

  /** Nhiệm vụ đang ở cấp mấy khi bị sửa. */
  @Prop({ default: 0, min: 0 })
  level!: number;

  @Prop({ type: [PersonalMissionFieldChangeSchema], default: [] })
  changes!: PersonalMissionFieldChange[];

  @Prop({ trim: true, default: '' })
  reason!: string;

  @Prop({ type: Date, default: Date.now })
  at!: Date;
}

export const PersonalMissionEditSchema =
  SchemaFactory.createForClass(PersonalMissionEdit);

/** Các ô mà một lần cập nhật tiến độ có thể động tới. */
export const PERSONAL_MISSION_PROGRESS_FIELDS = [
  'progress',
  'quality',
  'product',
  'evidence',
  /** Ô kết quả của trục chấm theo mục - tên cột nằm ở `detail`. */
  'result',
  /**
   * Cấp trên sửa một ô nội dung - tên trường (trục, nội dung công việc, hoặc
   * tên cột của mẫu) nằm ở `detail`.
   */
  'content',
  /** Đổi danh sách cán bộ phối hợp - tên người nằm ở `from` / `to`. */
  'collaborators',
] as const;

export type PersonalMissionProgressField =
  (typeof PERSONAL_MISSION_PROGRESS_FIELDS)[number];

/**
 * Một ô đổi giá trị trong lần cập nhật.
 *
 * Chỉ lưu giá trị thô (số phần trăm, chữ, số tệp) chứ không lưu câu chữ đã
 * định dạng - nhãn và cách hiển thị để client lo, vì tên cột còn đổi theo mẫu.
 */
@Schema({ _id: false })
export class PersonalMissionProgressChange {
  @Prop({
    type: String,
    enum: PERSONAL_MISSION_PROGRESS_FIELDS,
    required: true,
  })
  field!: PersonalMissionProgressField;

  @Prop({ trim: true, default: '' })
  from!: string;

  @Prop({ trim: true, default: '' })
  to!: string;

  /** Chi tiết thêm - ví dụ tên các tệp vừa đính kèm. */
  @Prop({ trim: true, default: '' })
  detail!: string;
}

export const PersonalMissionProgressChangeSchema = SchemaFactory.createForClass(
  PersonalMissionProgressChange,
);

/**
 * Loại việc đã xảy ra với nhiệm vụ.
 * PROGRESS = cán bộ cập nhật tiến độ; SUBMIT = gửi lên trên; RETURN = cấp trên
 * trả lại; COMPLETE = cấp trên chốt hoàn thành; EDIT = cấp trên sửa nội dung.
 */
export const PERSONAL_MISSION_LOG_TYPES = [
  'PROGRESS',
  'SUBMIT',
  'RETURN',
  'COMPLETE',
  'EDIT',
] as const;

export type PersonalMissionLogType =
  (typeof PERSONAL_MISSION_LOG_TYPES)[number];

/**
 * Một mốc trong đời của nhiệm vụ: cập nhật tiến độ, gửi lên, bị trả lại, chốt.
 *
 * Chỉ ghi ĐÚNG THỨ ĐÃ ĐỔI chứ không chụp lại toàn bộ nhiệm vụ mỗi lần lưu:
 * ảnh chụp thì phình theo số lần sửa mà đọc lại vẫn phải tự so hai bản mới biết
 * khác chỗ nào. Hình dạng bảng (mẫu nhiệm vụ) đã có bản chụp riêng theo phiên bản,
 * nên không mất gì khi chỉ lưu delta ở đây.
 */
@Schema({ _id: false })
export class PersonalMissionProgressLog {
  @Prop({
    type: String,
    enum: PERSONAL_MISSION_LOG_TYPES,
    default: 'PROGRESS',
    index: true,
  })
  type!: PersonalMissionLogType;

  /** Nhiệm vụ đang ở cấp mấy lúc xảy ra - dùng cho mốc gửi / trả lại. */
  @Prop({ default: 0, min: 0 })
  level!: number;

  /** Người nhận của lượt gửi. Rỗng ở các loại mốc khác. */
  @Prop({ trim: true, default: '' })
  toName!: string;
  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  byId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  byName!: string;

  /** Phần trăm tiến độ ngay sau lần cập nhật này; null = chưa nhập. */
  @Prop({ type: Number, default: null })
  percent!: number | null;

  @Prop({ trim: true, default: '' })
  note!: string;

  /** Ngày báo cáo (YYYY-MM-DD theo giờ server) của lần cập nhật. */
  @Prop({ trim: true, default: '' })
  onDate!: string;

  /** Những ô đã đổi giá trị trong lần này. */
  @Prop({ type: [PersonalMissionProgressChangeSchema], default: [] })
  changes!: PersonalMissionProgressChange[];

  @Prop({ type: Date, default: Date.now })
  at!: Date;
}

export const PersonalMissionProgressLogSchema = SchemaFactory.createForClass(
  PersonalMissionProgressLog,
);

/** Nhiệm vụ cá nhân - một dòng trong báo cáo ngày. */
@Schema({ timestamps: true, collection: 'personal_mission_items' })
export class PersonalMissionItem {
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  ownerId!: Types.ObjectId;

  /** Đơn vị của cán bộ lúc tạo - để cấp trên gom theo đơn vị mà không join. */
  @Prop({ type: Types.ObjectId, ref: 'Department', default: null, index: true })
  ownerDepartmentId!: Types.ObjectId | null;

  /**
   * Cán bộ phối hợp - KHÔNG BẮT BUỘC, và không gồm người xử lý chính.
   *
   * Người xử lý chính chính là `ownerId` ở trên: nhiệm vụ cá nhân do ai khai
   * thì người đó chịu trách nhiệm chính, không có đường nào khai hộ người khác.
   * Vì vậy không dựng thêm trường `mainHandlerId` - hai trường luôn bằng nhau
   * là hai trường chờ ngày lệch nhau.
   */
  @Prop({ type: [PersonalMissionCollaboratorSchema], default: [] })
  collaborators!: PersonalMissionCollaborator[];

  /** Ngày báo cáo (YYYY-MM-DD) theo giờ Việt Nam trên server. */
  @Prop({ required: true, trim: true, index: true })
  reportDate!: string;

  // ------------------------------------------------------------- nội dung

  @Prop({
    type: Types.ObjectId,
    ref: Axis.name,
    required: true,
    index: true,
  })
  axisId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: WorkContent.name,
    required: true,
    index: true,
  })
  workContentId!: Types.ObjectId;

  /**
   * Giá trị các cột lấy từ danh mục, key = FormTemplateColumn.key.
   * Theo khoá cột chứ không theo loại danh mục, để hai cột cùng lấy một danh
   * mục vẫn giữ được hai giá trị khác nhau.
   */
  @Prop({ type: Object, default: {} })
  catalogValues!: Record<string, PersonalMissionCatalogValue>;

  /**
   * Giá trị mọi cột chữ/số của mẫu bảng, key = FormTemplateColumn.key.
   * Chỉ cột lấy từ danh mục mới có field cứng riêng (workContentId,
   * scoreGroupId, qualityLevelId); còn lại nằm hết ở đây.
   */
  @Prop({ type: Object, default: {} })
  fieldValues!: Record<string, string | number>;

  /**
   * Tệp đính kèm của các cột kiểu "file", key = FormTemplateColumn.key.
   * Để riêng khỏi fieldValues vì giá trị là danh sách chứ không phải chuỗi -
   * nhét JSON vào fieldValues sẽ làm hỏng cả hiển thị lẫn tìm kiếm.
   */
  @Prop({ type: Object, default: {} })
  attachments!: Record<string, PersonalMissionAttachment[]>;

  // ----------------------------------------------------- chỉ huy chấm điểm

  /**
   * Điểm chỉ huy chấm lại, theo khoá cột - ĐÂY MỚI LÀ SỐ CHỐT.
   *
   * Để riêng chứ không đè lên fieldValues: đè thì mất số cán bộ tự chấm, không
   * đối chiếu được và cũng không biết ai sửa. Công thức tính điểm trục ưu tiên
   * đọc map này, ô nào chưa chấm mới lấy số tự chấm.
   */
  @Prop({ type: Object, default: {} })
  reviewValues!: Record<string, string | number>;

  /** Ô danh mục do chỉ huy chọn lại (mức chất lượng), theo khoá cột. */
  @Prop({ type: Object, default: {} })
  reviewCatalogValues!: Record<string, PersonalMissionCatalogValue>;

  @Prop({ trim: true, default: '' })
  reviewNote!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  reviewScoredById!: Types.ObjectId | null;

  @Prop({ trim: true, default: '' })
  reviewScoredByName!: string;

  @Prop({ type: Date, default: null })
  reviewScoredAt!: Date | null;

  // --------------------------------------------------------- mẫu bảng khoá

  /**
   * Mẫu bảng dùng để dựng dòng này, chốt tại lần gửi đầu tiên.
   * Super admin sửa mẫu về sau không làm méo báo cáo đã gửi.
   */
  @Prop({
    type: Types.ObjectId,
    ref: FormTemplate.name,
    default: null,
    index: true,
  })
  formTemplateId!: Types.ObjectId | null;

  @Prop({ type: Number, default: null })
  formTemplateVersion!: number | null;

  // ------------------------------------------------- vị trí trong chuỗi gửi

  /** 0 = còn ở cán bộ, 1 = đang ở cấp thứ nhất, 2 = cấp thứ hai... */
  @Prop({ default: 0, min: 0, index: true })
  holderLevel!: number;

  @Prop({
    type: String,
    enum: PERSONAL_MISSION_REVIEW_STATUSES,
    default: 'DRAFT',
    index: true,
  })
  reviewStatus!: PersonalMissionReviewStatus;

  /** Người đang phải duyệt. Null khi nhiệm vụ còn ở chỗ cán bộ. */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  currentRecipientId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  currentRecipientDepartmentId!: Types.ObjectId | null;

  @Prop({
    type: Types.ObjectId,
    ref: 'PersonalMissionSubmission',
    default: null,
    index: true,
  })
  currentSubmissionId!: Types.ObjectId | null;

  /** Người gửi lượt gần nhất - đổ vào cột "Người gửi" của bảng tổng. */
  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true })
  lastSenderId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  lastSenderDepartmentId!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  lastSentAt!: Date | null;

  /**
   * Lần cán bộ cập nhật tiến độ gần nhất.
   *
   * Tách khỏi `updatedAt` vì `updatedAt` nhúc nhích cả khi cấp trên duyệt hay
   * hệ thống tính lại cột - dựa vào nó thì việc bỏ bê vẫn trông như vừa được
   * đụng tới. Đây là mốc để tính "im lặng N ngày".
   */
  @Prop({ type: Date, default: null })
  lastProgressAt!: Date | null;

  /** Nhật ký đời nhiệm vụ (cập nhật, gửi, trả lại, chốt) - cũ trước mới sau. */
  @Prop({ type: [PersonalMissionProgressLogSchema], default: [] })
  progressLogs!: PersonalMissionProgressLog[];

  // ------------------------------------------------------- kết quả duyệt

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  lastDecidedById!: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  lastDecidedAt!: Date | null;

  @Prop({ trim: true, default: '' })
  returnReason!: string;

  /** Lịch sử cấp trên sửa nội dung. Rỗng nghĩa là còn nguyên lời cán bộ khai. */
  @Prop({ type: [PersonalMissionEditSchema], default: [] })
  edits!: PersonalMissionEdit[];

  // ------------------------------------------- giá trị suy ra, chép sẵn
  /*
    Bốn trường dưới đây KHÔNG phải dữ liệu người dùng nhập. Chúng là thứ suy ra
    từ `fieldValues` cộng với MẪU BẢNG của trục, chép sẵn ra thành trường riêng
    mỗi lần ghi.

    Vì sao phải chép: hạn và tiến độ nằm trong `fieldValues` dưới khoá cột do
    mẫu tự đặt, mẫu nào cũng có thể khác. Mongo không lọc, không đếm, không sắp
    xếp theo thứ nó không nhìn thấy - nên nếu không chép ra thì mọi bộ lọc kiểu
    "trễ hạn", "chưa cập nhật", "chờ xác nhận" đều buộc phải kéo cả bảng về máy
    người dùng rồi lọc ở đó. Ở cấp cao nhận báo cáo của nhiều đơn vị thì đó là
    hàng nghìn dòng mỗi lần mở trang.

    Đổi lại: phải tính lại mỗi lần nội dung, điểm chỉ huy chấm, hoặc mẫu của
    trục thay đổi. Tất cả đi qua `refreshDerived` trong service - đừng ghi tay
    mấy trường này ở chỗ khác.
  */

  /** Hạn hoàn thành (YYYY-MM-DD) đọc từ cột ngày của mẫu; null = mẫu không có. */
  @Prop({ type: String, default: null })
  deadlineDate!: string | null;

  /** % tiến độ chốt (đã ghép điểm chỉ huy chấm lại); null = chưa khai. */
  @Prop({ type: Number, default: null })
  progressPercent!: number | null;

  /** Mẫu của trục này có cột tiến độ hay không - trục chấm theo mục thì không. */
  @Prop({ type: Boolean, default: false })
  tracksProgress!: boolean;

  /**
   * Cán bộ đã làm xong phần việc của mình chưa - KHÁC "chỉ huy đã chốt".
   *
   * Trục có cột tiến độ: đủ 100%. Trục chấm theo mục: đã khai kết quả (điểm Đạt
   * hoặc tích Không đạt). Đây là căn cứ của tab "Chờ xác nhận hoàn thành", và
   * cũng là thứ khiến một việc thôi bị tính là trễ hạn.
   */
  @Prop({ type: Boolean, default: false })
  workDone!: boolean;

  /**
   * Ngày (YYYY-MM-DD, giờ server) của lần đụng vào tiến độ gần nhất; chưa cập
   * nhật lần nào thì lấy ngày tạo.
   *
   * Có sẵn dạng chuỗi ngày để so trực tiếp với mốc "im lặng N ngày" - so bằng
   * `lastProgressAt` kiểu Date thì phải quy múi giờ trong lúc truy vấn, và
   * cập nhật lúc 23h hôm qua sẽ ra 0 ngày thay vì 1.
   */
  @Prop({ type: String, default: '' })
  lastTouchedDate!: string;

  /**
   * Nội dung nhiệm vụ gộp lại, đã bỏ dấu và hạ chữ thường, cho ô tìm kiếm.
   *
   * Thay cho cách cũ là `$expr` + `$objectToArray` quét từng khoá của
   * `fieldValues`: cách đó không dùng được index nên mỗi lần gõ tìm kiếm là
   * một lượt quét toàn bộ collection.
   *
   * CHỈ chứa nội dung của chính nhiệm vụ. Tên cán bộ, tên đơn vị, tên trục nằm
   * ở collection khác và đổi được - chép vào đây là tự tạo ra dữ liệu cũ. Tìm
   * theo mấy tên đó thì service tra id trước rồi lọc theo id.
   */
  @Prop({ trim: true, default: '' })
  searchText!: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PersonalMissionItemSchema =
  SchemaFactory.createForClass(PersonalMissionItem);

/** Danh sách của cán bộ: nhiệm vụ của tôi theo ngày. */
PersonalMissionItemSchema.index({ ownerId: 1, reportDate: -1 });
PersonalMissionItemSchema.index({
  ownerId: 1,
  reviewStatus: 1,
  reportDate: -1,
});

/** Bảng tổng của cấp trên: việc đang nằm ở tay tôi, gom theo trục. */
PersonalMissionItemSchema.index({
  currentRecipientId: 1,
  reviewStatus: 1,
  reportDate: -1,
});
PersonalMissionItemSchema.index({
  currentRecipientId: 1,
  reportDate: -1,
  axisId: 1,
  workContentId: 1,
});

/*
  Bảng tổng lọc theo tab. Mọi truy vấn đều bắt đầu bằng người đang giữ + khoảng
  ngày, nên hai khoá đó đứng đầu; trường của tab đứng sau để cùng một index
  phục vụ được cả "trễ hạn" lẫn "sắp đến hạn".
*/
PersonalMissionItemSchema.index({
  currentRecipientId: 1,
  reportDate: 1,
  workDone: 1,
  deadlineDate: 1,
});
PersonalMissionItemSchema.index({
  currentRecipientId: 1,
  reportDate: 1,
  workDone: 1,
  lastTouchedDate: 1,
});

/** Ô tìm kiếm trên bảng tổng và trên danh sách của cán bộ. */
PersonalMissionItemSchema.index({ currentRecipientId: 1, searchText: 1 });
PersonalMissionItemSchema.index({ ownerId: 1, searchText: 1 });
