import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Permission } from '@/common/enums/permission.enum';
import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import { RolesService } from '@/modules/roles/roles.service';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  SaveTeamReportAdjustmentRoutesDto,
  TeamReportAdjustmentScopeDto,
} from './dto/team-report.dto';
import {
  TeamReportAdjustmentRoute,
  TeamReportAdjustmentRouteDocument,
  TeamReportAdjustmentScope,
} from './schemas/team-report-adjustment-route.schema';

/** Người nhận bảng - cùng dạng với người nhận báo cáo tổng hợp. */
export type AdjustmentRecipient = {
  id: string;
  fullName: string;
  username: string;
  departmentId: string | null;
  departmentName: string;
};

type Person = {
  _id: Types.ObjectId;
  departmentId?: Types.ObjectId | null;
  roleAssignments?: { roleCode: string }[];
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const scopeEmpty = (scope: TeamReportAdjustmentScope) =>
  !scope.roleCodes.length &&
  !scope.levelIds.length &&
  !scope.departmentIds.length &&
  !scope.userIds.length;

/**
 * LUỒNG TRÌNH của bảng điểm cộng / trừ / xếp loại - nhiều luồng, mỗi luồng
 * "ai gửi → gửi cho ai". Quản trị khai theo vai trò / cấp đơn vị / đơn vị /
 * tài khoản ở cả hai vế.
 *
 * Xét theo thứ tự, khớp luồng đầu tiên. Không khớp luồng nào → mặc định: cấp
 * trên trực tiếp có quyền duyệt (đội trình lên phòng / xã).
 */
@Injectable()
export class TeamReportAdjustmentRoutingService {
  constructor(
    @InjectModel(TeamReportAdjustmentRoute.name)
    private readonly routeModel: Model<TeamReportAdjustmentRouteDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    private readonly rolesService: RolesService,
  ) {}

  async list() {
    const routes = await this.routeModel.find().sort({ sortOrder: 1, _id: 1 });
    return { message: 'OK', data: routes.map((route) => this.toClient(route)) };
  }

  /** Thay cả danh sách - thứ tự mảng là thứ tự xét. */
  async saveAll(userId: string, dto: SaveTeamReportAdjustmentRoutesDto) {
    const actor = await this.userModel
      .findById(userId)
      .select('fullName username');
    if (!actor) throw new NotFoundException('Không tìm thấy người dùng.');
    const by = actor.fullName?.trim() || actor.username;

    const docs: Partial<TeamReportAdjustmentRoute>[] = [];
    for (const [index, route] of dto.routes.entries()) {
      const name = route.name.trim();
      if (!name) throw new BadRequestException('Luồng phải có tên.');
      const sender = await this.normalizeScope(
        route.sender,
        `"${name}" - ai gửi`,
      );
      const recipients = await this.normalizeScope(
        route.recipients,
        `"${name}" - gửi cho ai`,
      );
      if (scopeEmpty(recipients)) {
        throw new BadRequestException(`Luồng "${name}" chưa chọn gửi cho ai.`);
      }
      docs.push({
        name,
        sortOrder: index,
        isActive: route.isActive ?? true,
        sender,
        recipients,
        updatedByName: by,
      });
    }

    await this.routeModel.deleteMany({});
    if (docs.length) await this.routeModel.insertMany(docs);
    return {
      message: docs.length ? 'Đã lưu luồng trình.' : 'Đã bỏ hết luồng riêng.',
      data: (await this.routeModel.find().sort({ sortOrder: 1 })).map((route) =>
        this.toClient(route),
      ),
    };
  }

  /**
   * Danh sách người `actorId` được trình tới theo luồng khớp đầu tiên; null
   * nếu không khớp luồng nào (nơi gọi rơi về cấp trên trực tiếp).
   */
  async recipients(
    actorId: string,
    q?: string,
  ): Promise<AdjustmentRecipient[] | null> {
    const route = await this.routeFor(actorId);
    if (!route) return null;
    const clauses = await this.clausesOf(route.recipients);
    const and: Record<string, unknown>[] = [{ $or: clauses }];
    if (q?.trim()) {
      const like = { $regex: escapeRegex(q.trim()), $options: 'i' };
      and.push({ $or: [{ fullName: like }, { username: like }] });
    }
    const found = await this.userModel
      .find({
        isActive: true,
        _id: { $ne: new Types.ObjectId(actorId) },
        $and: and,
      })
      .select('fullName username departmentId')
      .populate('departmentId', 'code name')
      .sort({ fullName: 1, username: 1 })
      .limit(300);
    return found.map((user) => this.person(user));
  }

  /**
   * Mặc định: CẤP TRÊN TRỰC TIẾP có quyền duyệt - người ở đơn vị cha gần
   * nhất; cha gần nhất không có ai thì mới leo lên cấp kế. Không gộp mọi cấp
   * trên: đội trình bảng này lên phòng / xã, bày cả tỉnh ra là thừa.
   */
  async directSuperiors(
    actorId: string,
    q?: string,
  ): Promise<AdjustmentRecipient[]> {
    const actor = await this.userModel.findById(actorId).select('departmentId');
    if (!actor?.departmentId) return [];
    const home = await this.departmentModel
      .findById(actor.departmentId)
      .select('ancestors');
    const chain = [...(home?.ancestors ?? [])].reverse();
    const reviewerCodes = await this.rolesService.findCodesByPermission(
      Permission.TEAM_REPORT_REVIEW,
    );
    if (!chain.length || !reviewerCodes.length) return [];

    for (const departmentId of chain) {
      const filter: Record<string, unknown> = {
        isActive: true,
        departmentId,
        _id: { $ne: actor._id },
        'roleAssignments.roleCode': { $in: reviewerCodes },
      };
      if (q?.trim()) {
        const like = { $regex: escapeRegex(q.trim()), $options: 'i' };
        filter.$or = [{ fullName: like }, { username: like }];
      }
      const found = await this.userModel
        .find(filter)
        .select('fullName username departmentId')
        .populate('departmentId', 'code name')
        .sort({ fullName: 1, username: 1 })
        .limit(200);
      if (found.length) return found.map((user) => this.person(user));
    }
    return [];
  }

  /** Người này có nằm trong vế "gửi cho ai" của luồng nào không. */
  async isListedRecipient(userId: string): Promise<boolean> {
    const routes = await this.routeModel.find({ isActive: true });
    for (const route of routes) {
      const hit = await this.userModel.exists({
        _id: new Types.ObjectId(userId),
        isActive: true,
        $or: await this.clausesOf(route.recipients),
      });
      if (hit) return true;
    }
    return false;
  }

  /* ----------------------------------------------------------- nội bộ */

  private async routeFor(actorId: string) {
    const routes = await this.routeModel
      .find({ isActive: true })
      .sort({ sortOrder: 1, _id: 1 });
    if (!routes.length) return null;
    const user = await this.userModel
      .findById(actorId)
      .select('roleAssignments departmentId');
    if (!user) return null;
    const home = user.departmentId
      ? await this.departmentModel
          .findById(user.departmentId)
          .select('levelId ancestors')
      : null;
    for (const route of routes) {
      if (this.matches(route.sender, user, home)) return route;
    }
    return null;
  }

  /**
   * Người có khớp một vế không. Đích danh → khớp ngay. Còn lại phải thoả MỌI
   * vế đã khai (vai trò ∩ cấp ∩ đơn vị). Vế rỗng hoàn toàn = khớp tất cả.
   */
  private matches(
    scope: TeamReportAdjustmentScope,
    user: Person,
    home: { levelId?: Types.ObjectId; ancestors?: Types.ObjectId[] } | null,
  ): boolean {
    if (scope.userIds.some((id) => String(id) === String(user._id))) {
      return true;
    }
    if (
      !scope.roleCodes.length &&
      !scope.levelIds.length &&
      !scope.departmentIds.length
    ) {
      return !scope.userIds.length;
    }
    if (
      scope.roleCodes.length &&
      !(user.roleAssignments ?? []).some((a) =>
        scope.roleCodes.includes(a.roleCode),
      )
    ) {
      return false;
    }
    if (scope.levelIds.length) {
      const level = home?.levelId ? String(home.levelId) : '';
      if (!scope.levelIds.some((id) => String(id) === level)) return false;
    }
    if (scope.departmentIds.length) {
      if (!user.departmentId) return false;
      const allowed = new Set(scope.departmentIds.map((id) => String(id)));
      const own = allowed.has(String(user.departmentId));
      const below =
        scope.includeDescendants &&
        (home?.ancestors ?? []).some((id) => allowed.has(String(id)));
      if (!own && !below) return false;
    }
    return true;
  }

  /** Điều kiện Mongo lọc người khớp vế: đích danh, hoặc thoả mọi vế còn lại. */
  private async clausesOf(scope: TeamReportAdjustmentScope) {
    const clauses: Record<string, unknown>[] = [];
    if (scope.userIds.length) clauses.push({ _id: { $in: scope.userIds } });

    if (
      scope.roleCodes.length ||
      scope.levelIds.length ||
      scope.departmentIds.length
    ) {
      const clause: Record<string, unknown> = {};
      if (scope.roleCodes.length) {
        clause['roleAssignments.roleCode'] = { $in: scope.roleCodes };
      }
      let deptIds: Types.ObjectId[] | null = null;
      if (scope.departmentIds.length) {
        deptIds = [...scope.departmentIds];
        if (scope.includeDescendants) {
          const below = await this.departmentModel
            .find({ ancestors: { $in: scope.departmentIds } })
            .select('_id');
          deptIds.push(...below.map((row) => row._id));
        }
      }
      if (scope.levelIds.length) {
        const atLevel = await this.departmentModel
          .find({
            levelId: { $in: scope.levelIds },
            ...(deptIds ? { _id: { $in: deptIds } } : {}),
          })
          .select('_id');
        deptIds = atLevel.map((row) => row._id);
      }
      if (deptIds) clause.departmentId = { $in: deptIds };
      clauses.push(clause);
    }
    // Không có điều kiện nào thì không khớp ai - tránh $or rỗng làm Mongo lỗi.
    return clauses.length ? clauses : [{ _id: null }];
  }

  private async normalizeScope(
    input: TeamReportAdjustmentScopeDto | undefined,
    label: string,
  ): Promise<TeamReportAdjustmentScope> {
    const roleCodes = [
      ...new Set((input?.roleCodes ?? []).map((c) => c.trim()).filter(Boolean)),
    ];
    const toIds = (list?: string[]) =>
      [...new Set(list ?? [])].map((id) => new Types.ObjectId(id));
    const levelIds = toIds(input?.levelIds);
    const departmentIds = toIds(input?.departmentIds);
    const userIds = toIds(input?.userIds);
    if (userIds.length) {
      const n = await this.userModel.countDocuments({ _id: { $in: userIds } });
      if (n !== userIds.length) {
        throw new BadRequestException(`${label}: có tài khoản không tồn tại.`);
      }
    }
    if (departmentIds.length) {
      const n = await this.departmentModel.countDocuments({
        _id: { $in: departmentIds },
      });
      if (n !== departmentIds.length) {
        throw new BadRequestException(`${label}: có đơn vị không tồn tại.`);
      }
    }
    return {
      roleCodes,
      levelIds,
      departmentIds,
      includeDescendants: input?.includeDescendants ?? true,
      userIds,
    };
  }

  private person(user: UserDocument): AdjustmentRecipient {
    const dept = user.departmentId as unknown as {
      _id?: Types.ObjectId;
      name?: string;
    } | null;
    return {
      id: String(user._id),
      fullName: user.fullName?.trim() || user.username,
      username: user.username,
      departmentId: dept?._id ? String(dept._id) : null,
      departmentName: dept?.name ?? '',
    };
  }

  private toClient(route: TeamReportAdjustmentRouteDocument) {
    const scope = (s: TeamReportAdjustmentScope) => ({
      roleCodes: s.roleCodes,
      levelIds: s.levelIds.map(String),
      departmentIds: s.departmentIds.map(String),
      includeDescendants: s.includeDescendants,
      userIds: s.userIds.map(String),
    });
    return {
      _id: String(route._id),
      name: route.name,
      isActive: route.isActive,
      sender: scope(route.sender),
      recipients: scope(route.recipients),
      updatedByName: route.updatedByName,
      updatedAt: route.updatedAt ?? null,
    };
  }
}
