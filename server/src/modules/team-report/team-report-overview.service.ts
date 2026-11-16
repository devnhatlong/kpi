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
import { Role, RoleDocument } from '@/modules/roles/schemas/role.schema';
import { User, UserDocument } from '@/modules/users/schemas/user.schema';
import {
  SaveTeamReportOverviewSettingsDto,
  TeamReportOverviewQueryDto,
} from './dto/team-report.dto';
import {
  TEAM_REPORT_SETTING_KEY,
  TeamReportSetting,
  TeamReportSettingDocument,
} from './schemas/team-report-setting.schema';
import {
  TEAM_REPORT_PERIODS,
  TeamReportSummary,
  TeamReportSummaryDocument,
  type TeamReportPeriod,
} from './schemas/team-report-summary.schema';
import {
  TeamReportTask,
  TeamReportTaskDocument,
} from './schemas/team-report-task.schema';
import { UNIT_ENTRY_ROLES } from './team-report.entry-access';
import {
  serverDateYmd,
  shiftYmd,
  TEAM_REPORT_TIMEZONE,
} from './team-report.time';

/** Tình trạng trình báo cáo tháng của MỘT đơn vị cho MỘT kỳ. */
type MonthStatus = 'ON_TIME' | 'LATE' | 'MISSING' | 'NOT_DUE';

type DeptLite = {
  _id: Types.ObjectId;
  name: string;
  parentId?: Types.ObjectId | null;
  sortOrder?: number;
  depth?: number;
  isActive?: boolean;
};

/** Bỏ dấu, chữ thường - để gõ "doi cong nghe" vẫn tìm ra "Đội Công nghệ". */
function foldVi(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** YYYY-MM-DD của ngày 14 trong tháng `ym` (YYYY-MM). */
const day14 = (ym: string) => `${ym}-14`;

/** Tháng liền trước của YYYY-MM. */
function prevMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 2, 1));
  return date.toISOString().slice(0, 7);
}

function nextMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const date = new Date(Date.UTC(y, m, 1));
  return date.toISOString().slice(0, 7);
}

/** Kỳ tháng 15 → 14 đang chạy tại ngày `ymd`. */
function monthPeriodOf(ymd: string) {
  const ym = ymd.slice(0, 7);
  const day = Number(ymd.slice(8, 10));
  return day >= 15
    ? { fromDate: `${ym}-15`, toDate: day14(nextMonth(ym)) }
    : { fromDate: `${prevMonth(ym)}-15`, toDate: day14(ym) };
}

/**
 * Các kỳ tháng (15 → 14) có NGÀY CUỐI KỲ nằm trong [from, to] - một kỳ thuộc
 * về khoảng đang xem khi nó kết thúc trong khoảng đó.
 */
function monthPeriodsEndingIn(from: string, to: string) {
  const periods: Array<{ fromDate: string; toDate: string }> = [];
  for (let ym = from.slice(0, 7); ym <= to.slice(0, 7); ym = nextMonth(ym)) {
    const end = day14(ym);
    if (end < from || end > to) continue;
    periods.push({ fromDate: `${prevMonth(ym)}-15`, toDate: end });
  }
  return periods;
}

/**
 * Số liệu tổng hợp cho văn bản báo cáo ("Hệ thống ghi nhận [x] nhiệm vụ…,
 * [y] báo cáo tự đánh giá… Tỷ lệ đơn vị gửi đúng hạn đạt [z]%").
 *
 * Phạm vi: quản trị hệ thống thấy toàn bộ và lọc được đơn vị bất kỳ; tài khoản
 * khác chỉ thấy đơn vị mình + cấp dưới, lọc được trong nhánh đó.
 *
 * Đúng hạn chỉ xét BÁO CÁO THÁNG (kỳ 15 → 14): hạn = ngày 14 + N ngày quản trị
 * đặt; mốc là lần trình đầu (`firstSentAt`), không phải lần trình lại sau khi
 * bị trả.
 */
@Injectable()
export class TeamReportOverviewService {
  constructor(
    @InjectModel(TeamReportTask.name)
    private readonly taskModel: Model<TeamReportTaskDocument>,
    @InjectModel(TeamReportSummary.name)
    private readonly summaryModel: Model<TeamReportSummaryDocument>,
    @InjectModel(TeamReportSetting.name)
    private readonly settingModel: Model<TeamReportSettingDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(Role.name)
    private readonly roleModel: Model<RoleDocument>,
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
  ) {}

  // ---------------------------------------------------------------- cài đặt

  async settings() {
    const doc = await this.settingModel
      .findOne({ key: TEAM_REPORT_SETTING_KEY })
      .lean();
    return {
      message: 'OK',
      data: {
        monthSubmitGraceDays: doc?.monthSubmitGraceDays ?? 0,
        updatedByName: doc?.updatedByName ?? '',
        updatedAt: doc?.updatedAt ?? null,
      },
    };
  }

  async saveSettings(userId: string, dto: SaveTeamReportOverviewSettingsDto) {
    const user = await this.userModel
      .findById(userId)
      .select('fullName username');
    const doc = await this.settingModel.findOneAndUpdate(
      { key: TEAM_REPORT_SETTING_KEY },
      {
        $set: {
          monthSubmitGraceDays: dto.monthSubmitGraceDays,
          updatedByName: user?.fullName?.trim() || user?.username || '',
        },
      },
      { upsert: true, new: true },
    );
    return {
      message: 'Đã lưu hạn trình báo cáo tháng.',
      data: {
        monthSubmitGraceDays: doc.monthSubmitGraceDays,
        updatedByName: doc.updatedByName,
        updatedAt: doc.updatedAt ?? null,
      },
    };
  }

  // --------------------------------------------------------------- số liệu

  async overview(userId: string, query: TeamReportOverviewQueryDto) {
    const user = await this.userModel
      .findById(userId)
      .select('departmentId roleAssignments');
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    const isAdmin = (user.roleAssignments ?? []).some(
      (a) => a.roleCode === String(RoleCode.SUPER_ADMIN),
    );
    if (!isAdmin && !user.departmentId) {
      throw new BadRequestException(
        'Tài khoản chưa gắn đơn vị nên chưa xem được số liệu.',
      );
    }

    /* ------------------------------------------------- khoảng ngày */
    const today = serverDateYmd();
    const current = monthPeriodOf(today);
    const fromDate = query.fromDate ?? current.fromDate;
    const toDate = query.toDate ?? current.toDate;
    if (fromDate > toDate) {
      throw new BadRequestException('Từ ngày phải trước đến ngày.');
    }

    const periods: TeamReportPeriod[] = (query.periods ?? 'MONTH')
      .split(',')
      .map((p) => p.trim().toUpperCase())
      .filter((p): p is TeamReportPeriod =>
        (TEAM_REPORT_PERIODS as readonly string[]).includes(p),
      );
    if (!periods.length) {
      throw new BadRequestException('Chọn ít nhất một loại báo cáo.');
    }

    /* ----------------------------------------------------- phạm vi */
    const allDepartments = (await this.departmentModel
      .find({})
      .select('name parentId sortOrder depth isActive ancestors')
      .lean()) as unknown as Array<DeptLite & { ancestors: Types.ObjectId[] }>;
    const subtreeOf = (rootId: string) =>
      allDepartments.filter(
        (d) =>
          String(d._id) === rootId ||
          (d.ancestors ?? []).some((a) => String(a) === rootId),
      );

    // Nhánh người này được xem (null = toàn hệ thống).
    const rootId = isAdmin ? null : String(user.departmentId);
    const allowed = rootId ? subtreeOf(rootId) : allDepartments;
    const allowedIds = new Set(allowed.map((d) => String(d._id)));

    let selected: typeof allowed = allowed;
    let selectedName = isAdmin ? 'Toàn bộ đơn vị' : '';
    if (query.departmentId) {
      if (!allowedIds.has(query.departmentId)) {
        throw new ForbiddenException('Đơn vị này nằm ngoài phạm vi bạn xem.');
      }
      selected = subtreeOf(query.departmentId);
      selectedName =
        allDepartments.find((d) => String(d._id) === query.departmentId)
          ?.name ?? '';
    } else if (rootId) {
      selectedName =
        allDepartments.find((d) => String(d._id) === rootId)?.name ?? '';
    }
    const scopeIds = selected.map((d) => d._id);
    // Admin xem toàn bộ: bỏ hẳn điều kiện đơn vị để không lọt việc của đơn vị
    // đã xoá khỏi cây.
    const deptFilter =
      isAdmin && !query.departmentId ? {} : { departmentId: { $in: scopeIds } };

    /* ----------------------------------- nhiệm vụ khai trong kỳ */
    const taskGroups = await this.taskModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      {
        $match: {
          ...deptFilter,
          createdDate: { $gte: fromDate, $lte: toDate },
        },
      },
      { $group: { _id: '$departmentId', count: { $sum: 1 } } },
    ]);
    const tasksByDept = new Map(
      taskGroups.map((g) => [String(g._id), g.count]),
    );
    const taskTotal = taskGroups.reduce((sum, g) => sum + g.count, 0);

    /* ------------------- báo cáo đã trình, kỳ kết thúc trong khoảng */
    const sentSummaries = await this.summaryModel
      .find({
        ...deptFilter,
        status: { $ne: 'DRAFT' },
        period: { $in: periods },
        toDate: { $gte: fromDate, $lte: toDate },
      })
      .select('departmentId period status')
      .lean();
    const summaryByPeriod: Record<string, number> = {};
    const summaryByStatus = { PENDING: 0, APPROVED: 0, RETURNED: 0 };
    const summariesByDept = new Map<string, number>();
    for (const s of sentSummaries) {
      summaryByPeriod[s.period] = (summaryByPeriod[s.period] ?? 0) + 1;
      if (s.status in summaryByStatus) {
        summaryByStatus[s.status as keyof typeof summaryByStatus] += 1;
      }
      const key = String(s.departmentId);
      summariesByDept.set(key, (summariesByDept.get(key) ?? 0) + 1);
    }

    /* ------------------------------- đúng hạn - chỉ báo cáo tháng */
    const grace =
      (
        await this.settingModel
          .findOne({ key: TEAM_REPORT_SETTING_KEY })
          .select('monthSubmitGraceDays')
          .lean()
      )?.monthSubmitGraceDays ?? 0;
    const monthPeriods = monthPeriodsEndingIn(fromDate, toDate);
    const expected = await this.expectedUnits(selected);

    const monthSent = monthPeriods.length
      ? await this.summaryModel
          .find({
            departmentId: { $in: expected.map((d) => d._id) },
            period: 'MONTH',
            status: { $ne: 'DRAFT' },
            $or: monthPeriods.map((p) => ({
              fromDate: p.fromDate,
              toDate: p.toDate,
            })),
          })
          .select('departmentId fromDate toDate sentAt firstSentAt')
          .lean()
      : [];
    // Lần trình sớm nhất của từng (đơn vị, kỳ).
    const firstSent = new Map<string, Date>();
    for (const s of monthSent) {
      const at = s.firstSentAt ?? s.sentAt;
      if (!at) continue;
      const key = `${String(s.departmentId)}|${s.toDate}`;
      const prev = firstSent.get(key);
      if (!prev || at < prev) firstSent.set(key, at);
    }

    const counts = { ON_TIME: 0, LATE: 0, MISSING: 0, NOT_DUE: 0 };
    const monthByDept = new Map<
      string,
      Array<{
        fromDate: string;
        toDate: string;
        deadline: string;
        status: MonthStatus;
        submittedDate: string | null;
      }>
    >();
    for (const unit of expected) {
      const list: NonNullable<ReturnType<typeof monthByDept.get>> = [];
      for (const p of monthPeriods) {
        const deadline = shiftYmd(p.toDate, grace);
        const at = firstSent.get(`${String(unit._id)}|${p.toDate}`);
        const submittedDate = at
          ? serverDateYmd(at, TEAM_REPORT_TIMEZONE)
          : null;
        let status: MonthStatus;
        if (submittedDate) {
          status = submittedDate <= deadline ? 'ON_TIME' : 'LATE';
        } else {
          status = today > deadline ? 'MISSING' : 'NOT_DUE';
        }
        counts[status] += 1;
        list.push({ ...p, deadline, status, submittedDate });
      }
      monthByDept.set(String(unit._id), list);
    }
    const due = counts.ON_TIME + counts.LATE + counts.MISSING;
    const onTimeRate = due
      ? Math.round((counts.ON_TIME / due) * 1000) / 10
      : null;

    /* -------------------------------------------- bảng từng đơn vị */
    const expectedIds = new Set(expected.map((d) => String(d._id)));
    const ordered = this.treeOrder(selected);
    const units = ordered
      .filter((d) => {
        const id = String(d._id);
        return (
          expectedIds.has(id) || tasksByDept.has(id) || summariesByDept.has(id)
        );
      })
      .map((d) => {
        const id = String(d._id);
        return {
          departmentId: id,
          name: d.name,
          depth: d.depth ?? 0,
          mustSubmit: expectedIds.has(id),
          tasks: tasksByDept.get(id) ?? 0,
          summaries: summariesByDept.get(id) ?? 0,
          months: monthByDept.get(id) ?? [],
        };
      });

    /* Số đơn vị theo từng tình trạng - đếm TRƯỚC khi lọc, để các nút lọc
       trên màn luôn bày đủ số dù đang chọn nút nào. Một đơn vị nhiều kỳ có
       thể rơi vào nhiều nhóm. */
    const unitStatusCounts = {
      ON_TIME: 0,
      LATE: 0,
      MISSING: 0,
      NOT_DUE: 0,
      NOT_REQUIRED: 0,
    };
    for (const u of units) {
      if (!u.mustSubmit) {
        unitStatusCounts.NOT_REQUIRED += 1;
        continue;
      }
      for (const s of new Set(u.months.map((m) => m.status))) {
        unitStatusCounts[s] += 1;
      }
    }

    const needle = foldVi(query.q ?? '');
    const filtered = units.filter((u) => {
      if (needle && !foldVi(u.name).includes(needle)) return false;
      if (!query.status) return true;
      if (query.status === 'NOT_REQUIRED') return !u.mustSubmit;
      return u.mustSubmit && u.months.some((m) => m.status === query.status);
    });
    const limit = query.limit ?? 10;
    const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
    const page = Math.min(query.page ?? 1, totalPages);
    const pagedUnits = filtered.slice((page - 1) * limit, page * limit);

    /* ---------------------------------- ô chọn đơn vị trên màn */
    const options = this.treeOrder(
      allowed.filter((d) => d.isActive !== false),
    ).map((d) => ({
      id: String(d._id),
      name: d.name,
      depth: d.depth ?? 0,
    }));
    const minDepth = options.reduce(
      (min, o) => Math.min(min, o.depth),
      Number.POSITIVE_INFINITY,
    );

    return {
      message: 'OK',
      data: {
        isAdmin,
        scopeName: selectedName,
        departmentId: query.departmentId ?? null,
        fromDate,
        toDate,
        today,
        periods,
        tasks: { total: taskTotal },
        summaries: {
          total: sentSummaries.length,
          byPeriod: summaryByPeriod,
          byStatus: summaryByStatus,
        },
        onTime: {
          graceDays: grace,
          periods: monthPeriods.map((p) => ({
            ...p,
            deadline: shiftYmd(p.toDate, grace),
          })),
          expectedUnits: expected.length,
          ...counts,
          due,
          rate: onTimeRate,
        },
        units: pagedUnits,
        unitsMeta: { total: filtered.length, page, limit, totalPages },
        unitStatusCounts,
        unitsInScope: units.length,
        departmentOptions: options.map((o) => ({
          ...o,
          depth: Number.isFinite(minDepth) ? o.depth - minDepth : o.depth,
        })),
      },
    };
  }

  /**
   * Đơn vị PHẢI trình báo cáo tháng: còn hoạt động và có ít nhất một tài khoản
   * đang bật lập được báo cáo tổng hợp - quyền nhập (đội / tổ), hoặc quyền
   * duyệt kèm vai trưởng / phó đơn vị (phòng / xã). Tỉnh, tài khoản chỉ duyệt
   * và quản trị không trình gì nên không vào mẫu số.
   */
  private async expectedUnits(departments: DeptLite[]) {
    const active = departments.filter((d) => d.isActive !== false);
    const submitters = await this.submitters(active);
    return active.filter((d) => submitters.has(String(d._id)));
  }

  /**
   * Tài khoản lập được báo cáo tổng hợp, theo đơn vị (chỉ đơn vị có ít nhất
   * một tài khoản). `unitLevel` = trưởng / phó phòng, xã (lập ở màn "báo cáo
   * của đơn vị"); còn lại là đội / tổ. Dùng chung cho tỷ lệ đúng hạn và nhắc
   * hạn - hai chỗ phải cùng một luật "ai phải trình".
   */
  async submitters(
    departments: Array<{ _id: Types.ObjectId; isActive?: boolean }>,
  ): Promise<
    Map<string, Array<{ userId: Types.ObjectId; unitLevel: boolean }>>
  > {
    const out = new Map<
      string,
      Array<{ userId: Types.ObjectId; unitLevel: boolean }>
    >();
    const active = departments.filter((d) => d.isActive !== false);
    if (!active.length) return out;
    const roles = await this.roleModel
      .find({ isActive: true })
      .select('code permissions')
      .lean();
    const entry = new Set(
      roles
        .filter((r) => r.permissions.includes(Permission.TEAM_REPORT_ENTRY))
        .map((r) => r.code),
    );
    const review = new Set(
      roles
        .filter((r) => r.permissions.includes(Permission.TEAM_REPORT_REVIEW))
        .map((r) => r.code),
    );
    const users = await this.userModel
      .find({
        isActive: true,
        departmentId: { $in: active.map((d) => d._id) },
      })
      .select('departmentId roleAssignments')
      .lean();
    for (const u of users) {
      const codes = (u.roleAssignments ?? []).map((a) => a.roleCode);
      if (codes.includes(RoleCode.SUPER_ADMIN)) continue;
      if (codes.includes(RoleCode.REPORT_REVIEWER)) continue;
      const asTeam = codes.some((c) => entry.has(c));
      const asUnit =
        codes.some((c) => review.has(c)) &&
        codes.some((c) => UNIT_ENTRY_ROLES.includes(c));
      if (!asTeam && !asUnit) continue;
      const key = String(u.departmentId);
      const list = out.get(key) ?? [];
      list.push({ userId: u._id, unitLevel: !asTeam && asUnit });
      out.set(key, list);
    }
    return out;
  }

  /** Số ngày sau ngày 14 vẫn tính đúng hạn - quản trị đặt, mặc định 0. */
  async graceDays(): Promise<number> {
    const doc = await this.settingModel
      .findOne({ key: TEAM_REPORT_SETTING_KEY })
      .select('monthSubmitGraceDays')
      .lean();
    return doc?.monthSubmitGraceDays ?? 0;
  }

  /** Xếp đơn vị theo đúng thứ tự cây (cha trước, con theo sortOrder, tên). */
  private treeOrder<T extends DeptLite>(departments: T[]): T[] {
    const ids = new Set(departments.map((d) => String(d._id)));
    const children = new Map<string, T[]>();
    const roots: T[] = [];
    for (const d of departments) {
      const parent = d.parentId ? String(d.parentId) : '';
      if (parent && ids.has(parent)) {
        const list = children.get(parent) ?? [];
        list.push(d);
        children.set(parent, list);
      } else {
        roots.push(d);
      }
    }
    const sort = (list: T[]) =>
      list.sort(
        (a, b) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
          a.name.localeCompare(b.name, 'vi'),
      );
    const out: T[] = [];
    const walk = (list: T[]) => {
      for (const d of sort(list)) {
        out.push(d);
        walk(children.get(String(d._id)) ?? []);
      }
    };
    walk(roots);
    return out;
  }
}
