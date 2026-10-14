import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { POLICE_RANKS } from '@/common/enums/police-rank.enum';
import { RoleAssignment, RoleAssignmentSchema } from './role-assignment.schema';

@Schema({
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
})
export class User {
    @Prop({ required: true, unique: true, trim: true, lowercase: true })
    username!: string;

    /**
     * Chỉ lưu mật khẩu đã hash.
     * select: false giúp mặc định không trả password khi find/findOne.
     */
    @Prop({ required: true, select: false })
    password!: string;

    /**
     * MẬT KHẨU THỨ 2 - chỉ lưu bản đã hash (bcrypt), select: false như
     * `password`. Tài khoản mới tự lấy từ biến môi trường SECONDARY_PASSWORD
     * (xem hook pre-save); tài khoản có từ trước chèn bằng
     * scripts/set-secondary-password.js.
     */
    // Khai `type` tường minh: kiểu `string | null` NestJS không tự suy được.
    @Prop({ type: String, select: false, default: null })
    secondaryPassword?: string | null;

    /**
     * Lần gần nhất có người vào tài khoản này bằng mật khẩu thứ 2 - vết để
     * quản trị tra lại; ẩn khỏi API (select: false) như hai mật khẩu.
     */
    @Prop({ type: Date, default: null, select: false })
    lastSecondaryLoginAt?: Date | null;

    @Prop({ type: String, default: '', select: false })
    lastSecondaryLoginIp?: string;

    @Prop({ trim: true })
    fullName?: string;

    @Prop({ unique: true, sparse: true, lowercase: true, trim: true })
    email?: string;

    @Prop({ trim: true })
    phone?: string;

    /** Chức vụ hiển thị trên hồ sơ, vd: "Đội trưởng". */
    @Prop({ trim: true })
    position?: string;

    /**
     * Cấp bậc hàm, vd: "Đại úy". Khác `position`: cấp bậc đi theo con người,
     * chức vụ đi theo vị trí công tác - một đại úy có thể là đội trưởng hôm nay
     * và cán bộ đội khác ngày mai mà cấp bậc không đổi.
     *
     * Ràng buộc theo danh mục ngay ở tầng schema chứ không chỉ ở DTO: dữ liệu
     * nhập từ Excel và từ script cũng đi qua đây.
     */
    @Prop({ trim: true, enum: [...POLICE_RANKS, '', null] })
    rank?: string;

    /** Đơn vị công tác chính của người dùng. */
    @Prop({ type: Types.ObjectId, ref: 'Department', index: true })
    departmentId?: Types.ObjectId;

    /** Một người có thể kiêm nhiệm nhiều vai trò tại nhiều đơn vị. */
    @Prop({ type: [RoleAssignmentSchema], default: [] })
    roleAssignments!: RoleAssignment[];

    @Prop({ default: true, index: true })
    isActive!: boolean;

    @Prop({ type: Date, default: null })
    lastLoginAt?: Date | null;
}

/** Object user an toàn (không kèm hai mật khẩu), có thêm virtual id. */
export type SafeUser = Omit<
    User,
    | 'password'
    | 'secondaryPassword'
    | 'lastSecondaryLoginAt'
    | 'lastSecondaryLoginIp'
> & {
    id: string;
};

/** Document Mongoose kèm các instance method. */
export type UserDocument = HydratedDocument<User> & {
    comparePassword(password: string): Promise<boolean>;
    /** Cần nạp kèm `+secondaryPassword` khi find - trường mặc định ẩn. */
    compareSecondaryPassword(password: string): Promise<boolean>;
    toSafeObject(): SafeUser;
};

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.methods.comparePassword = async function (
    this: UserDocument,
    password: string,
): Promise<boolean> {
    return bcrypt.compare(password, this.password);
};

UserSchema.methods.compareSecondaryPassword = async function (
    this: UserDocument,
    password: string,
): Promise<boolean> {
    if (!this.secondaryPassword) return false;
    return bcrypt.compare(password, this.secondaryPassword);
};

UserSchema.methods.toSafeObject = function (this: UserDocument): SafeUser {
    const {
        password,
        secondaryPassword,
        lastSecondaryLoginAt,
        lastSecondaryLoginIp,
        _id,
        __v,
        ...rest
    } = this.toObject();
    return rest as SafeUser;
};

/** Hash password trước khi lưu nếu field bị thay đổi. */
UserSchema.pre('save', async function () {
    /*
      Tài khoản MỚI chưa có mật khẩu thứ 2 thì lấy từ SECONDARY_PASSWORD - đặt
      ở hook chứ không ở từng chỗ tạo, để mọi đường tạo (form, nhập Excel, tạo
      hàng loạt) đều có, không sót đường nào. Thiếu biến môi trường thì bỏ qua.
    */
    const secondary = process.env.SECONDARY_PASSWORD?.trim();
    if (this.isNew && !this.secondaryPassword && secondary) {
        this.secondaryPassword = secondary;
    }
    if (this.isModified('secondaryPassword') && this.secondaryPassword) {
        this.secondaryPassword = await bcrypt.hash(this.secondaryPassword, 10);
    }

    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 10);
});

/** Tìm người dùng theo đơn vị và trạng thái. */
UserSchema.index({ departmentId: 1, isActive: 1 });

/** Tìm người có một vai trò cụ thể trong phạm vi đơn vị. */
UserSchema.index({
    'roleAssignments.roleCode': 1,
    'roleAssignments.scopeDepartmentId': 1,
});