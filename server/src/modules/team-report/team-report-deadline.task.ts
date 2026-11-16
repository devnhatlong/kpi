import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';

import {
  Department,
  DepartmentDocument,
} from '@/modules/departments/schemas/department.schema';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  TeamReportSummary,
  TeamReportSummaryDocument,
} from './schemas/team-report-summary.schema';
import { TeamReportOverviewService } from './team-report-overview.service';
import {
  serverDateYmd,
  shiftYmd,
  TEAM_REPORT_TIMEZONE,
} from './team-report.time';

/** Nhắc trước hạn bao nhiêu ngày (ngoài lần nhắc đúng ngày hạn). */
const REMIND_BEFORE_DAYS = 2;

const dmy = (ymd: string) => ymd.split('-').reverse().join('/');

/**
 * Nhắc hạn trình BÁO CÁO THÁNG cho các đơn vị chưa trình.
 *
 * Hạn = ngày 14 (cuối kỳ) + N ngày quản trị đặt - đúng luật của tỷ lệ đúng hạn
 * ở trang Thống kê. Nhắc hai lần: trước hạn `REMIND_BEFORE_DAYS` ngày và đúng
 * ngày hạn. Người nhận = các tài khoản lập được báo cáo của đơn vị đó (cùng
 * luật "ai phải trình" với tỷ lệ đúng hạn).
 *
 * Chạy 07:30 mỗi sáng theo giờ server, và chạy thêm một lần lúc khởi động -
 * máy đặt ở đơn vị có thể tắt qua đêm, lỡ mốc 07:30 thì vẫn nhắc. Khoá chống
 * trùng (`dedupeKey`) giữ cho mỗi người chỉ nhận một lần cho mỗi mốc.
 */
@Injectable()
export class TeamReportDeadlineTask implements OnApplicationBootstrap {
  private readonly logger = new Logger(TeamReportDeadlineTask.name);
  private running = false;

  constructor(
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
    @InjectModel(TeamReportSummary.name)
    private readonly summaryModel: Model<TeamReportSummaryDocument>,
    private readonly overview: TeamReportOverviewService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    // Không chặn lúc khởi động - để server lên trước, nhắc chạy sau.
    setTimeout(() => void this.run(), 30_000);
  }

  @Cron('30 7 * * *', { timeZone: TEAM_REPORT_TIMEZONE })
  async daily() {
    await this.run();
  }

  async run(today: string = serverDateYmd()) {
    if (this.running) return;
    this.running = true;
    try {
      const grace = await this.overview.graceDays();
      // Kỳ có thể còn trong hạn: kết thúc tháng này hoặc tháng trước (N ≤ 60).
      const ends = [-2, -1, 0, 1].map((offset) => {
        const [y, m] = today.split('-').map(Number);
        const d = new Date(Date.UTC(y, m - 1 + offset, 14));
        return d.toISOString().slice(0, 10);
      });
      for (const end of ends) {
        const deadline = shiftYmd(end, grace);
        const tag =
          today === deadline
            ? 'D0'
            : today === shiftYmd(deadline, -REMIND_BEFORE_DAYS)
              ? `D-${REMIND_BEFORE_DAYS}`
              : null;
        if (!tag) continue;
        const sent = await this.remind(end, deadline, tag);
        this.logger.log(
          `Nhắc hạn báo cáo tháng kỳ kết thúc ${end} (${tag}): ${sent} tài khoản.`,
        );
      }
    } catch (error) {
      this.logger.error(`Nhắc hạn lỗi: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Gửi nhắc cho đơn vị chưa trình bản tháng nào của kỳ. Trả số người nhận. */
  private async remind(end: string, deadline: string, tag: string) {
    const [y, m] = end.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 2, 15)).toISOString().slice(0, 10);

    const departments = await this.departmentModel
      .find({ isActive: { $ne: false } })
      .select('_id isActive')
      .lean();
    const submitters = await this.overview.submitters(departments);
    if (!submitters.size) return 0;

    const done = new Set(
      (
        await this.summaryModel.distinct('departmentId', {
          period: 'MONTH',
          status: { $ne: 'DRAFT' },
          fromDate: from,
          toDate: end,
        })
      ).map(String),
    );

    const title =
      tag === 'D0'
        ? 'Hôm nay là hạn cuối trình báo cáo tháng'
        : `Còn ${REMIND_BEFORE_DAYS} ngày đến hạn trình báo cáo tháng`;
    const body = `Kỳ ${dmy(from)} - ${dmy(end)}, hạn hết ngày ${dmy(deadline)}. Đơn vị chưa trình báo cáo tháng nào.`;

    const inputs = [...submitters.entries()]
      .filter(([departmentId]) => !done.has(departmentId))
      .flatMap(([, users]) =>
        users.map((user) => ({
          userId: user.userId,
          kind: 'DEADLINE' as const,
          title,
          body,
          href: user.unitLevel
            ? '/team-report/summary/unit'
            : '/team-report/summary',
          dedupeKey: `deadline:${end}:${tag}`,
        })),
      );
    await this.notifications.notify(inputs);
    return inputs.length;
  }
}
