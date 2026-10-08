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
  type TeamReportRouteKind,
  type TeamReportRouteUnit,
  type TeamReportUnitRole,
} from './schemas/team-report-adjustment-route.schema';
import type { TeamReportParticipant } from './schemas/team-report-summary.schema';

/** Người nhận bảng - cùng dạng với người nhận báo cáo tổng hợp. */
export type AdjustmentRecipient = {
  id: string;
  fullName: string;
  username: string;
  departmentId: string | null;
  departmentName: string;
  /** Đơn vị cha của đơn vị người nhận - để nhãn "tên - phòng / xã". */
  parentDepartmentName: string;
};

/** Một dòng bảng nơi nhận, đã kèm tên tài khoản và đơn vị để bày ra. */
export type SummaryRouteUnit = {
  userId: string;
  fullName: string;
  username: string;
  departmentId: string | null;
  departmentName: string;
  /** Đơn vị cha - nhãn "tên - phòng" như dropdown chọn người. */
  parentDepartmentName: string;
  /** Tài khoản còn hoạt động VÀ còn gắn đơn vị - thiếu một là không trình được. */
  isActive: boolean;
  role: TeamReportUnitRole;
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

  async list(kind: TeamReportRouteKind) {
    const routes = await this.routeModel
      .find({ kind })
      .sort({ sortOrder: 1, _id: 1 });
    return { message: 'OK', data: routes.map((route) => this.toClient(route)) };
  }

  /** Thay cả danh sách của MỘT loại - thứ tự mảng là thứ tự xét. */
  async saveAll(
    kind: TeamReportRouteKind,
    userId: string,
    dto: SaveTeamReportAdjustmentRoutesDto,
  ) {
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
      const units = await this.normalizeUnits(route.units ?? [], name);
      if (!units.length && scopeEmpty(recipients)) {
        throw new BadRequestException(`Luồng "${name}" chưa chọn gửi cho ai.`);
      }
      if (scopeEmpty(sender)) {
        throw new BadRequestException(`Luồng "${name}" chưa chọn ai gửi.`);
      }
      docs.push({
        kind,
        name,
        sortOrder: index,
        isActive: route.isActive ?? true,
        units,
        sender,
        recipients,
        updatedByName: by,
      });
    }

    await this.routeModel.deleteMany({ kind });
    if (docs.length) await this.routeModel.insertMany(docs);
    return {
      message: docs.length ? 'Đã lưu luồng trình.' : 'Đã bỏ hết luồng riêng.',
      data: (await this.routeModel.find({ kind }).sort({ sortOrder: 1 })).map(
        (route) => this.toClient(route),
      ),
    };
  }

  /**
   * Danh sách người `actorId` được trình tới theo luồng khớp đầu tiên; null
   * nếu không khớp luồng nào (nơi gọi rơi về cấp trên trực tiếp).
   *
   * Người nhận = TÀI KHOẢN ĐÍCH DANH (luôn có, không bị cờ nào thu hẹp) ∪
   * người thoả vai trò ∩ cấp ∩ đơn vị đã tick. Hai cờ "chỉ cấp trên trực
   * thuộc" / "chỉ cấp dưới" của người gửi chỉ thu hẹp vế thứ hai: không tick
   * gì mà bật cờ thì = mọi người ở cấp trên / cấp dưới đó.
   */
  async recipients(
    kind: TeamReportRouteKind,
    actorId: string,
    q?: string,
  ): Promise<AdjustmentRecipient[] | null> {
    const route = await this.routeFor(kind, actorId);
    if (!route) return null;
    const scope = route.recipients;
    const self = new Types.ObjectId(actorId);

    const actor = await this.userModel.findById(self).select('departmentId');
    const home = actor?.departmentId
      ? await this.departmentModel
          .findById(actor.departmentId)
          .select('ancestors')
      : null;

    /* Vế "tương đối với người gửi": chuỗi cha (gần nhất trước) hoặc cây con. */
    let chain: Types.ObjectId[] = [];
    let relative: Types.ObjectId[] | null = null;
    if (scope.senderSuperiorOnly) {
      chain = [...(home?.ancestors ?? [])].reverse();
      relative = chain;
    } else if (scope.senderSubordinatesOnly && actor?.departmentId) {
      const below = await this.departmentModel
        .find({ ancestors: actor.departmentId, isActive: true })
        .select('_id');
      relative = below.map((row) => row._id);
    }

    const like = q?.trim()
      ? { $regex: escapeRegex(q.trim()), $options: 'i' }
      : null;
    const nameFilter = like
      ? [{ $or: [{ fullName: like }, { username: like }] }]
      : [];
    const select = 'fullName username departmentId';
    const populate = {
      path: 'departmentId',
      select: 'code name parentId',
      populate: { path: 'parentId', select: 'name' },
    };

    /* 1. Đích danh - luôn có. */
    const named = scope.userIds.length
      ? await this.userModel
          .find({
            _id: { $in: scope.userIds, $ne: self },
            isActive: true,
            ...(nameFilter.length ? { $and: nameFilter } : {}),
          })
          .select(select)
          .populate(populate)
      : [];

    /* 2. Theo vai trò ∩ cấp ∩ đơn vị, có thể thu hẹp theo người gửi. */
    const criteria = await this.groupClause(scope);
    let matched: typeof named = [];
    const hasGroup =
      criteria !== null || (relative !== null && relative.length > 0);
    if (hasGroup && !(relative !== null && relative.length === 0)) {
      const and: Record<string, unknown>[] = [...nameFilter];
      if (criteria) and.push(criteria);
      if (relative) and.push({ departmentId: { $in: relative } });
      matched = await this.userModel
        .find({
          isActive: true,
          _id: { $ne: self },
          ...(and.length ? { $and: and } : {}),
        })
        .select(select)
        .populate(populate)
        .sort({ fullName: 1, username: 1 })
        .limit(300);
      // Cấp trên trực thuộc: chỉ giữ cấp cha GẦN NHẤT còn có người.
      if (chain.length) {
        const deptOf = (user: (typeof matched)[number]) =>
          String(
            (user.departmentId as unknown as { _id?: Types.ObjectId })?._id ??
              user.departmentId,
          );
        const nearest = chain.find((id) =>
          matched.some((user) => deptOf(user) === String(id)),
        );
        matched = matched.filter((user) => deptOf(user) === String(nearest));
      }
    }

    const seen = new Set<string>();
    return [...named, ...matched]
      .filter((user) => {
        const id = String(user._id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((user) => this.person(user));
  }

  /** Điều kiện vai trò ∩ cấp ∩ đơn vị; null = không tick gì. */
  private async groupClause(
    scope: TeamReportAdjustmentScope,
  ): Promise<Record<string, unknown> | null> {
    if (
      !scope.roleCodes.length &&
      !scope.levelIds.length &&
      !scope.departmentIds.length
    ) {
      return null;
    }
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
    return clause;
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
        .populate({
          path: 'departmentId',
          select: 'code name parentId',
          populate: { path: 'parentId', select: 'name' },
        })
        .sort({ fullName: 1, username: 1 })
        .limit(200);
      if (found.length) return found.map((user) => this.person(user));
    }
    return [];
  }

  /**
   * Bảng nơi nhận cố định của luồng khớp người gửi, kèm tên tài khoản
   * và đơn vị. null = không khớp luồng nào, hoặc luồng để người trình tự chọn.
   *
   * Tài khoản đã khoá / mất đơn vị vẫn trả về (`isActive = false`) để người
   * trình thấy và báo quản trị, thay vì lặng lẽ bỏ đi rồi trình thiếu nơi.
   */
  async unitsFor(
    kind: TeamReportRouteKind,
    actorId: string,
  ): Promise<SummaryRouteUnit[] | null> {
    const route = await this.routeFor(kind, actorId);
    if (!route?.units?.length) return null;
    const users = await this.userModel
      .find({ _id: { $in: route.units.map((unit) => unit.userId) } })
      .select('fullName username departmentId isActive')
      .populate({
        path: 'departmentId',
        select: 'name parentId isActive',
        populate: { path: 'parentId', select: 'name' },
      });
    const byId = new Map(users.map((user) => [String(user._id), user]));
    return route.units.map((unit) => {
      const user = byId.get(String(unit.userId));
      const dept = user?.departmentId as unknown as {
        _id?: Types.ObjectId;
        name?: string;
        isActive?: boolean;
        parentId?: { name?: string } | null;
      } | null;
      return {
        userId: String(unit.userId),
        fullName:
          user?.fullName?.trim() || user?.username || '(tài khoản đã xoá)',
        username: user?.username ?? '',
        departmentId: dept?._id ? String(dept._id) : null,
        departmentName: dept?.name ?? '',
        parentDepartmentName: dept?.parentId?.name ?? '',
        isActive: !!user?.isActive && !!dept?._id && dept.isActive !== false,
        role: unit.role,
      };
    });
  }

  /**
   * Bản trình đi đâu theo BẢNG NƠI NHẬN cố định: một chủ trì + các nơi phối
   * hợp / nhận để biết. null = luồng để người trình tự chọn (nơi gọi lo).
   *
   * Dùng chung cho báo cáo tổng hợp và bảng điểm cộng / trừ - một luật, một
   * chỗ.
   */
  async fixedTargets(
    kind: TeamReportRouteKind,
    actor: { id: Types.ObjectId | string; departmentId: Types.ObjectId | null },
  ): Promise<{
    recipient: {
      id: Types.ObjectId;
      name: string;
      departmentId: Types.ObjectId;
    };
    participants: TeamReportParticipant[];
  } | null> {
    const units = await this.unitsFor(kind, String(actor.id));
    if (!units) return null;
    const inactive = units.find((unit) => !unit.isActive);
    if (inactive) {
      throw new BadRequestException(
        `Tài khoản "${inactive.fullName}" trong luồng trình đã bị khoá hoặc không còn đơn vị - báo quản trị sửa luồng trước khi trình.`,
      );
    }
    const lead = units.find((unit) => unit.role === 'LEAD')!;
    // Chặn cuối: dù cấu hình lệch thế nào cũng không để một đơn vị tự trình
    // cho chính mình rồi tự duyệt.
    if (lead.departmentId === String(actor.departmentId)) {
      throw new BadRequestException(
        'Đơn vị bạn đang là chủ trì của luồng trình này - báo quản trị đặt chủ trì thay thế.',
      );
    }
    return {
      recipient: {
        id: new Types.ObjectId(lead.userId),
        name: lead.fullName,
        departmentId: new Types.ObjectId(lead.departmentId!),
      },
      participants: units
        .filter((unit) => unit.role !== 'LEAD')
        // Đơn vị lập không tự phối hợp / nhận để biết bản của chính mình.
        .filter((unit) => unit.departmentId !== String(actor.departmentId))
        .map((unit) => ({
          departmentId: new Types.ObjectId(unit.departmentId!),
          departmentName: unit.departmentName,
          userId: new Types.ObjectId(unit.userId),
          userName: unit.fullName,
          role: unit.role as 'COORDINATE' | 'INFORM',
          seenAt: null,
          comment: '',
          commentedByName: '',
          commentedAt: null,
        })),
    };
  }

  /** Có luồng nào đang dùng cho loại này không. */
  async hasRoutes(kind: TeamReportRouteKind): Promise<boolean> {
    return Boolean(await this.routeModel.exists({ kind, isActive: true }));
  }

  /** Người này có khớp vế "ai gửi" của một luồng đang dùng không. */
  async matchesSender(
    kind: TeamReportRouteKind,
    userId: string,
  ): Promise<boolean> {
    return Boolean(await this.routeFor(kind, userId));
  }

  /**
   * Người này có nằm trong vế "gửi cho ai" của luồng nào không - để hiện menu
   * Duyệt trước cả khi có bản trình tới.
   *
   * Đích danh / vai trò / cấp / đơn vị: so thẳng. Cờ "cấp dưới của người gửi"
   * hay "cấp trên trực thuộc": phải tồn tại ít nhất một người gửi (khớp vế
   * "ai gửi") mà đơn vị của họ là tổ tiên / hậu duệ của đơn vị người này.
   */
  async isListedRecipient(
    kind: TeamReportRouteKind,
    userId: string,
  ): Promise<boolean> {
    const routes = await this.routeModel.find({ kind, isActive: true });
    if (!routes.length) return false;
    const user = await this.userModel
      .findById(userId)
      .select('roleAssignments departmentId');
    if (!user) return false;
    const home = user.departmentId
      ? await this.departmentModel
          .findById(user.departmentId)
          .select('levelId ancestors')
      : null;

    for (const route of routes) {
      /* Luồng có bảng tài khoản: đích danh, hoặc cùng đơn vị với một tài khoản
         trong bảng - hộp đến lọc theo đơn vị nên cả đơn vị đều xử lý được. */
      if (route.units?.length) {
        if (
          route.units.some((unit) => String(unit.userId) === String(user._id))
        ) {
          return true;
        }
        if (user.departmentId) {
          const sameUnit = await this.userModel.exists({
            _id: { $in: route.units.map((unit) => unit.userId) },
            departmentId: user.departmentId,
          });
          if (sameUnit) return true;
        }
        continue;
      }
      const scope = route.recipients;
      if (scope.userIds.some((id) => String(id) === String(user._id))) {
        return true;
      }
      const criteria = await this.groupClause(scope);
      if (criteria) {
        const hit = await this.userModel.exists({
          _id: user._id,
          isActive: true,
          ...criteria,
        });
        if (!hit) continue;
      }
      if (!scope.senderSubordinatesOnly && !scope.senderSuperiorOnly) {
        if (criteria) return true;
        continue; // vế rỗng hoàn toàn thì không ai là người nhận
      }
      if (!user.departmentId) continue;
      // Tìm người gửi có quan hệ cây với đơn vị người này.
      const senderClause = await this.groupClause(route.sender);
      const senderDepts = new Set<string>();
      if (route.sender.userIds.length || senderClause) {
        const senders = await this.userModel
          .find({
            isActive: true,
            $or: [
              ...(route.sender.userIds.length
                ? [{ _id: { $in: route.sender.userIds } }]
                : []),
              ...(senderClause ? [senderClause] : []),
            ],
          })
          .select('departmentId')
          .limit(2000);
        for (const s of senders) {
          if (s.departmentId) senderDepts.add(String(s.departmentId));
        }
      }
      if (scope.senderSubordinatesOnly) {
        // Người gửi ở một đơn vị tổ tiên của tôi (vế gửi rỗng = mọi người gửi
        // → chỉ cần tôi có đơn vị cha).
        const ancestors = (home?.ancestors ?? []).map(String);
        if (!route.sender.userIds.length && !senderClause) {
          if (ancestors.length) return true;
          continue;
        }
        if (ancestors.some((id) => senderDepts.has(id))) return true;
      } else {
        // Cấp trên trực thuộc: người gửi ở một đơn vị dưới tôi.
        const below = await this.departmentModel
          .find({ ancestors: user.departmentId })
          .select('_id');
        const mine = new Set(below.map((d) => String(d._id)));
        if (!route.sender.userIds.length && !senderClause) {
          if (mine.size) return true;
          continue;
        }
        if ([...senderDepts].some((id) => mine.has(id))) return true;
      }
    }
    return false;
  }

  /* ----------------------------------------------------------- nội bộ */

  /**
   * Kiểm bảng nơi nhận: rỗng thì thôi (luồng kiểu chọn người); có thì phải
   * ĐÚNG MỘT chủ trì - không ai quyết thì bản treo mãi, hai nơi cùng quyết thì
   * chấm đè lên nhau - mỗi tài khoản một dòng, và mỗi ĐƠN VỊ chỉ một dòng.
   *
   * Hai tài khoản cùng đơn vị bị chặn: hộp đến lọc theo đơn vị, hai dòng cùng
   * đơn vị mà khác vai thì không biết đơn vị đó được duyệt hay chỉ được xem.
   */
  private async normalizeUnits(
    units: { userId: string; role: TeamReportUnitRole }[],
    routeName: string,
  ): Promise<TeamReportRouteUnit[]> {
    if (!units.length) return [];
    const seen = new Set<string>();
    for (const unit of units) {
      if (seen.has(unit.userId)) {
        throw new BadRequestException(
          `Luồng "${routeName}": một tài khoản chỉ được giữ một vai.`,
        );
      }
      seen.add(unit.userId);
    }
    const leads = units.filter((unit) => unit.role === 'LEAD').length;
    if (leads !== 1) {
      throw new BadRequestException(
        `Luồng "${routeName}" phải có đúng một chủ trì (đang có ${leads}).`,
      );
    }
    const users = await this.userModel
      .find({ _id: { $in: [...seen].map((id) => new Types.ObjectId(id)) } })
      .select('fullName username departmentId');
    if (users.length !== seen.size) {
      throw new BadRequestException(
        `Luồng "${routeName}" có tài khoản không tồn tại.`,
      );
    }
    const deptOwner = new Map<string, string>();
    for (const user of users) {
      const name = user.fullName?.trim() || user.username;
      if (!user.departmentId) {
        throw new BadRequestException(
          `Luồng "${routeName}": tài khoản ${name} chưa gắn đơn vị - không có hộp đến để nhận.`,
        );
      }
      const dept = String(user.departmentId);
      const other = deptOwner.get(dept);
      if (other) {
        throw new BadRequestException(
          `Luồng "${routeName}": ${other} và ${name} cùng một đơn vị - mỗi đơn vị chỉ chọn một tài khoản.`,
        );
      }
      deptOwner.set(dept, name);
    }
    // Chủ trì đứng đầu, rồi phối hợp, rồi nhận để biết - đúng thứ tự bày ra.
    const order: Record<TeamReportUnitRole, number> = {
      LEAD: 0,
      COORDINATE: 1,
      INFORM: 2,
    };
    return [...units]
      .sort((x, y) => order[x.role] - order[y.role])
      .map((unit) => ({
        userId: new Types.ObjectId(unit.userId),
        role: unit.role,
      }));
  }

  private async routeFor(kind: TeamReportRouteKind, actorId: string) {
    const routes = await this.routeModel
      .find({ kind, isActive: true })
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
      if (!this.matches(route.sender, user, home)) continue;
      if (await this.isRouteRecipient(route, user)) continue;
      return route;
    }
    return null;
  }

  /**
   * Người gửi có nằm trong BẢNG NƠI NHẬN của luồng không - đích danh, hoặc
   * cùng đơn vị với một tài khoản trong bảng (hộp đến lọc theo đơn vị nên cả
   * đơn vị là một nơi nhận).
   *
   * Có thì luồng KHÔNG áp cho người này, xét tiếp luồng sau: nơi nhận của
   * luồng mà đi theo chính luồng đó thì chủ trì tự trình cho mình, phối hợp
   * tự góp ý cho bản mình gửi. Quản trị tạo luồng riêng cho họ; không có thì
   * về cấp trên trực tiếp có quyền duyệt.
   */
  private async isRouteRecipient(
    route: TeamReportAdjustmentRouteDocument,
    user: Person,
  ): Promise<boolean> {
    if (!route.units?.length) return false;
    const ids = route.units.map((unit) => unit.userId);
    if (ids.some((id) => String(id) === String(user._id))) return true;
    if (!user.departmentId) return false;
    return Boolean(
      await this.userModel.exists({
        _id: { $in: ids },
        departmentId: user.departmentId,
      }),
    );
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
      // Vế trống = CHƯA CHỌN AI, không phải mọi người: luồng quyết luôn ai
      // thấy menu, để trống mà mở cho tất cả là lộ bảng cho cả tỉnh.
      return false;
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
      senderSuperiorOnly: input?.senderSuperiorOnly ?? false,
      senderSubordinatesOnly: input?.senderSubordinatesOnly ?? false,
    };
  }

  private person(user: UserDocument): AdjustmentRecipient {
    const dept = user.departmentId as unknown as {
      _id?: Types.ObjectId;
      name?: string;
      parentId?: { name?: string } | null;
    } | null;
    return {
      id: String(user._id),
      fullName: user.fullName?.trim() || user.username,
      username: user.username,
      departmentId: dept?._id ? String(dept._id) : null,
      departmentName: dept?.name ?? '',
      parentDepartmentName: dept?.parentId?.name ?? '',
    };
  }

  private toClient(route: TeamReportAdjustmentRouteDocument) {
    const scope = (s: TeamReportAdjustmentScope) => ({
      roleCodes: s.roleCodes,
      levelIds: s.levelIds.map(String),
      departmentIds: s.departmentIds.map(String),
      includeDescendants: s.includeDescendants,
      userIds: s.userIds.map(String),
      senderSuperiorOnly: s.senderSuperiorOnly ?? false,
      senderSubordinatesOnly: s.senderSubordinatesOnly ?? false,
    });
    return {
      _id: String(route._id),
      kind: route.kind,
      name: route.name,
      isActive: route.isActive,
      units: (route.units ?? []).map((unit) => ({
        userId: String(unit.userId),
        role: unit.role,
      })),
      sender: scope(route.sender),
      recipients: scope(route.recipients),
      updatedByName: route.updatedByName,
      updatedAt: route.updatedAt ?? null,
    };
  }
}
