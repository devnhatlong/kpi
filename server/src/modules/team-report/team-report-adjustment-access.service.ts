import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { RoleCode } from '@/common/enums/role-code.enum';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  TeamReportAdjustmentSheet,
  TeamReportAdjustmentSheetDocument,
} from './schemas/team-report-adjustment-sheet.schema';
import { TeamReportAdjustmentRoutingService } from './team-report-adjustment-routing.service';

/** Kết quả kiểm quyền, kèm lý do để màn nhập nói được vì sao bị chặn. */
export type AdjustmentAccessResult = {
  allowed: boolean;
  /** Đã có luồng nào cho bảng này chưa. */
  configured: boolean;
  reason: string;
};

/**
 * Ai được NHẬP / ai được NHẬN bảng điểm cộng, trừ & xếp loại - suy thẳng từ
 * LUỒNG TRÌNH, không có luật riêng thứ hai:
 *
 * - Khớp vế "ai gửi" của một luồng đang dùng → thấy menu Nhập, nhập và trình.
 * - Nằm trong vế "gửi cho ai" của một luồng (hoặc đã có bảng trình tới đơn
 *   vị mình) → thấy menu Duyệt, mở hộp đến, duyệt / trả.
 * - Chưa có luồng nào → không ai thấy (trừ quản trị hệ thống).
 *
 * Quản trị hệ thống luôn qua cả hai. Kiểm ở SERVICE - route không gác mã quyền
 * vì luồng có thể trỏ tới tài khoản đội.
 */
@Injectable()
export class TeamReportAdjustmentAccessService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(TeamReportAdjustmentSheet.name)
    private readonly sheetModel: Model<TeamReportAdjustmentSheetDocument>,
    private readonly routing: TeamReportAdjustmentRoutingService,
  ) {}

  async check(userId: string): Promise<AdjustmentAccessResult> {
    const who = await this.who(userId);
    if (!who) {
      return {
        allowed: false,
        configured: false,
        reason: 'Không rõ tài khoản.',
      };
    }
    if (who.superAdmin) {
      return { allowed: true, configured: true, reason: 'Quản trị hệ thống.' };
    }
    const configured = await this.routing.hasRoutes('ADJUSTMENT');
    if (!configured) {
      return {
        allowed: false,
        configured,
        reason:
          'Chưa đặt luồng trình cho bảng này - quản trị khai ở Luồng trình báo cáo.',
      };
    }
    const allowed = await this.routing.matchesSender('ADJUSTMENT', userId);
    return {
      allowed,
      configured,
      reason: allowed
        ? 'Nằm trong vế "ai gửi" của luồng trình.'
        : 'Bảng này chỉ mở cho người nằm trong vế "ai gửi" của một luồng trình quản trị đã đặt.',
    };
  }

  async assertAllowed(userId: string) {
    const result = await this.check(userId);
    if (!result.allowed) throw new ForbiddenException(result.reason);
  }

  async canReceive(userId: string): Promise<boolean> {
    const who = await this.who(userId);
    if (!who) return false;
    if (who.superAdmin) return true;
    if (await this.routing.isListedRecipient('ADJUSTMENT', userId)) return true;
    if (!who.departmentId) return false;
    const addressed = await this.sheetModel.exists({
      recipientDepartmentId: who.departmentId,
      status: { $ne: 'DRAFT' },
    });
    return Boolean(addressed);
  }

  async assertCanReceive(userId: string) {
    if (!(await this.canReceive(userId))) {
      throw new ForbiddenException(
        'Chưa có bảng nào trình tới đơn vị bạn, và bạn không nằm trong vế "gửi cho ai" của luồng trình.',
      );
    }
  }

  private async who(userId: string) {
    if (!Types.ObjectId.isValid(userId)) return null;
    const user = await this.userModel
      .findById(userId)
      .select('roleAssignments departmentId');
    if (!user) return null;
    const codes = (user.roleAssignments ?? []).map((a) => a.roleCode);
    return {
      departmentId: user.departmentId ?? null,
      superAdmin: codes.includes(RoleCode.SUPER_ADMIN),
    };
  }
}
