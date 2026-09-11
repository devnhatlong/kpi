import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Permission } from '@/common/enums/permission.enum';
import { RoleCode } from '@/common/enums/role-code.enum';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import { RolesService } from '@/modules/roles/roles.service';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  TeamReportAdjustmentAccess,
  TeamReportAdjustmentAccessDocument,
} from './schemas/team-report-adjustment-access.schema';
import { SaveTeamReportAdjustmentAccessDto } from './dto/team-report.dto';

const KEY = 'default';

/** Kết quả kiểm quyền, kèm lý do để màn nhập nói được vì sao bị chặn. */
export type AdjustmentAccessResult = {
  allowed: boolean;
  /** Đã có luật riêng chưa; chưa thì đang chạy luật mặc định. */
  configured: boolean;
  reason: string;
};

/**
 * Luật "ai được nhập" của bảng điểm cộng / trừ / xếp loại.
 *
 * Kiểm ở SERVICE chứ không ở guard: luật gồm cả tài khoản lẫn đơn vị, guard
 * chỉ biết mã quyền. Mọi đường ghi vào bảng đều phải gọi `assertAllowed`.
 */
@Injectable()
export class TeamReportAdjustmentAccessService {
  constructor(
    @InjectModel(TeamReportAdjustmentAccess.name)
    private readonly accessModel: Model<TeamReportAdjustmentAccessDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly rolesService: RolesService,
  ) {}

  /** Luật hiện hành - cho màn quản trị. */
  async rule() {
    const doc = await this.accessModel.findOne({ key: KEY });
    return {
      message: 'OK',
      data: this.toClient(doc),
    };
  }

  async save(userId: string, dto: SaveTeamReportAdjustmentAccessDto) {
    const actor = await this.userModel
      .findById(userId)
      .select('fullName username');
    if (!actor) throw new NotFoundException('Không tìm thấy người dùng.');

    const roleCodes = [
      ...new Set(
        (dto.roleCodes ?? []).map((code) => code.trim()).filter(Boolean),
      ),
    ];
    const userIds = [...new Set(dto.userIds ?? [])].map(
      (id) => new Types.ObjectId(id),
    );
    const departmentIds = [...new Set(dto.departmentIds ?? [])].map(
      (id) => new Types.ObjectId(id),
    );

    /* Id lạ thì chặn ngay thay vì lưu vào một luật không bao giờ khớp ai. */
    if (userIds.length) {
      const found = await this.userModel.countDocuments({
        _id: { $in: userIds },
      });
      if (found !== userIds.length) {
        throw new BadRequestException('Có tài khoản không tồn tại.');
      }
    }
    if (departmentIds.length) {
      const found = await this.departmentModel.countDocuments({
        _id: { $in: departmentIds },
      });
      if (found !== departmentIds.length) {
        throw new BadRequestException('Có đơn vị không tồn tại.');
      }
    }

    const doc = await this.accessModel.findOneAndUpdate(
      { key: KEY },
      {
        $set: {
          roleCodes,
          userIds,
          departmentIds,
          includeDescendants: dto.includeDescendants ?? true,
          updatedById: actor._id,
          updatedByName: actor.fullName?.trim() || actor.username,
        },
        $setOnInsert: { key: KEY },
      },
      { upsert: true, new: true },
    );
    return { message: 'Đã lưu quyền nhập bảng.', data: this.toClient(doc) };
  }

  /**
   * Người này có được nhập không.
   *
   * Khớp MỘT trong ba là đủ: đúng tài khoản, giữ một vai trò được phép, hoặc
   * thuộc đơn vị được phép (tính cả cấp dưới nếu bật). Chưa đặt luật thì rơi
   * về mặc định cũ - có TEAM_REPORT_ENTRY là nhập được. Quản trị hệ thống
   * luôn qua.
   */
  async check(userId: string): Promise<AdjustmentAccessResult> {
    if (!Types.ObjectId.isValid(userId)) {
      return {
        allowed: false,
        configured: false,
        reason: 'Không rõ tài khoản.',
      };
    }
    const user = await this.userModel
      .findById(userId)
      .select('roleAssignments departmentId');
    if (!user) {
      return {
        allowed: false,
        configured: false,
        reason: 'Không rõ tài khoản.',
      };
    }

    const roleCodes = (user.roleAssignments ?? [])
      .map((assignment) => assignment.roleCode)
      .filter(Boolean);
    if (roleCodes.includes(RoleCode.SUPER_ADMIN)) {
      return { allowed: true, configured: true, reason: 'Quản trị hệ thống.' };
    }

    const rule = await this.accessModel.findOne({ key: KEY });
    const configured = Boolean(
      rule &&
      (rule.roleCodes.length ||
        rule.userIds.length ||
        rule.departmentIds.length),
    );

    if (!configured) {
      const permissions =
        await this.rolesService.getPermissionsByCodes(roleCodes);
      const allowed = permissions.includes(Permission.TEAM_REPORT_ENTRY);
      return {
        allowed,
        configured: false,
        reason: allowed
          ? 'Chưa đặt luật riêng - dùng quyền nhập báo cáo ngày.'
          : 'Chưa đặt luật riêng, và tài khoản không có quyền nhập báo cáo ngày.',
      };
    }

    if (rule!.userIds.some((id) => String(id) === String(user._id))) {
      return { allowed: true, configured, reason: 'Tài khoản được chỉ định.' };
    }
    if (roleCodes.some((code) => rule!.roleCodes.includes(code))) {
      return { allowed: true, configured, reason: 'Vai trò được phép.' };
    }
    if (user.departmentId && rule!.departmentIds.length) {
      const home = await this.departmentModel
        .findById(user.departmentId)
        .select('ancestors');
      const allowedIds = new Set(rule!.departmentIds.map((id) => String(id)));
      if (allowedIds.has(String(user.departmentId))) {
        return { allowed: true, configured, reason: 'Đơn vị được phép.' };
      }
      if (
        rule!.includeDescendants &&
        (home?.ancestors ?? []).some((id) => allowedIds.has(String(id)))
      ) {
        return {
          allowed: true,
          configured,
          reason: 'Thuộc khối / đơn vị được phép.',
        };
      }
    }

    return {
      allowed: false,
      configured,
      reason:
        'Bảng này chỉ mở cho vai trò, tài khoản hoặc đơn vị mà quản trị đã chỉ định.',
    };
  }

  async assertAllowed(userId: string) {
    const result = await this.check(userId);
    if (!result.allowed) throw new ForbiddenException(result.reason);
  }

  private toClient(doc: TeamReportAdjustmentAccessDocument | null) {
    return {
      roleCodes: doc?.roleCodes ?? [],
      userIds: (doc?.userIds ?? []).map((id) => String(id)),
      departmentIds: (doc?.departmentIds ?? []).map((id) => String(id)),
      includeDescendants: doc?.includeDescendants ?? true,
      updatedByName: doc?.updatedByName ?? '',
      updatedAt: doc?.updatedAt ?? null,
      configured: Boolean(
        doc &&
        (doc.roleCodes.length ||
          doc.userIds.length ||
          doc.departmentIds.length),
      ),
    };
  }
}
