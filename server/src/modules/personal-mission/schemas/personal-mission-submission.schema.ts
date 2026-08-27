import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '@/modules/users/schemas/user.schema';

export type PersonalMissionSubmissionDocument =
  HydratedDocument<PersonalMissionSubmission>;

export const PERSONAL_MISSION_SUBMISSION_STATUSES = [
  'PENDING',
  'REVIEWED',
] as const;

export type PersonalMissionSubmissionStatus =
  (typeof PERSONAL_MISSION_SUBMISSION_STATUSES)[number];

/**
 * Một lượt gửi báo cáo lên trên.
 *
 * Đây là NHẬT KÝ, không phải nơi giữ trạng thái: trạng thái duyệt hiện tại nằm
 * trên từng nhiệm vụ (`PersonalMissionItem.reviewStatus`) vì cấp trên duyệt/trả lại
 * theo từng dòng trong bảng tổng. Lượt gửi trả lời câu "nhiệm vụ này đã đi qua
 * những ai" và cho phép trả lại đúng người đã gửi.
 */
@Schema({ timestamps: true, collection: 'personal_mission_submissions' })
export class PersonalMissionSubmission {
  @Prop({ required: true, trim: true, index: true })
  reportDate!: string;

  /** 1 = cán bộ gửi lên, 2 = cấp thứ nhất gửi tiếp... */
  @Prop({ required: true, min: 1, index: true })
  level!: number;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  senderId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  senderName!: string;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  senderDepartmentId!: Types.ObjectId | null;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  recipientId!: Types.ObjectId;

  @Prop({ trim: true, default: '' })
  recipientName!: string;

  @Prop({ type: Types.ObjectId, ref: 'Department', default: null })
  recipientDepartmentId!: Types.ObjectId | null;

  /** Đúng những nhiệm vụ được tích trong lượt này. */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'PersonalMissionItem' }],
    default: [],
    index: true,
  })
  itemIds!: Types.ObjectId[];

  /**
   * Bảng khối A đi kèm lượt gửi này.
   *
   * Mảng riêng chứ không nhét chung `itemIds`: hai mảng trỏ vào hai collection
   * khác nhau nên trộn lại là hỏng `populate`, và `history` của nhiệm vụ tra
   * ngược bằng đúng `{ itemIds: <id nhiệm vụ> }` sẽ vớ phải cả id bảng.
   */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'PersonalMissionCriteriaSheet' }],
    default: [],
    index: true,
  })
  criteriaSheetIds!: Types.ObjectId[];

  /** Các lượt cấp dưới được gộp vào lượt này. Rỗng ở lượt của cán bộ. */
  @Prop({
    type: [{ type: Types.ObjectId, ref: 'PersonalMissionSubmission' }],
    default: [],
  })
  sourceSubmissionIds!: Types.ObjectId[];

  @Prop({ trim: true, default: '' })
  note!: string;

  @Prop({
    type: String,
    enum: PERSONAL_MISSION_SUBMISSION_STATUSES,
    default: 'PENDING',
    index: true,
  })
  status!: PersonalMissionSubmissionStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PersonalMissionSubmissionSchema = SchemaFactory.createForClass(
  PersonalMissionSubmission,
);

/** Hộp đến của người duyệt, mới nhất trước. */
PersonalMissionSubmissionSchema.index({ recipientId: 1, createdAt: -1 });
PersonalMissionSubmissionSchema.index({ senderId: 1, createdAt: -1 });
PersonalMissionSubmissionSchema.index({ reportDate: -1, level: 1 });
