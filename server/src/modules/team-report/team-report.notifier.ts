import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';

import { NotificationsService } from '@/modules/notifications/notifications.service';

/** Bốn loại bản đi theo luật duyệt 2 cấp chung (`team-report.stages`). */
export type NotifyFlow =
  'SUMMARY' | 'ADJUSTMENT' | 'APPRAISAL' | 'COMMENDATION';

/** Màn mở ra khi bấm thông báo: hộp duyệt của người nhận / màn lập của đơn vị. */
const HREF: Record<NotifyFlow, { inbox: string; own: string }> = {
  SUMMARY: {
    inbox: '/team-report/summary/incoming',
    own: '/team-report/summary',
  },
  ADJUSTMENT: {
    inbox: '/team-report/adjustments/incoming',
    own: '/team-report/adjustments',
  },
  APPRAISAL: {
    inbox: '/team-report/appraisals/incoming',
    own: '/team-report/appraisals',
  },
  COMMENDATION: {
    inbox: '/team-report/commendations/incoming',
    own: '/team-report/commendations',
  },
};

type Id = Types.ObjectId | string | null | undefined;

/** Đủ thông tin để báo cho mọi bên của một bản. */
export type NotifySubject = {
  flow: NotifyFlow;
  /** Tên bản viết thường, VD "báo cáo tháng 11/2026". */
  label: string;
  /** Đơn vị lập bản. */
  fromName: string;
  /** Màn lập của đơn vị (bỏ trống = màn mặc định của loại bản). */
  ownHref?: string;
};

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "2026-11" → "11/2026". */
export function monthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split('-');
  return m && y ? `${m}/${y}` : periodMonth;
}

/**
 * Phát thông báo cho các bước trình / duyệt / trả lại / góp ý.
 *
 * Người nhận lấy đúng từ các trường đã lưu trên bản (tài khoản được gán trong
 * luồng) - không gửi cho cả đơn vị. Gọi SAU khi bản đã lưu; lỗi gửi không làm
 * hỏng thao tác (`NotificationsService.notify` tự nuốt lỗi).
 */
@Injectable()
export class TeamReportNotifier {
  constructor(private readonly notifications: NotificationsService) {}

  /** Đơn vị vừa trình: báo người cầm bản (cấp 1) + các đơn vị phối hợp / để biết. */
  async sent(
    subject: NotifySubject,
    target: {
      handlerId: Id;
      participants?: Array<{ userId: Id; role: 'COORDINATE' | 'INFORM' }>;
      /** Câu thêm cho người duyệt, VD "24 nhiệm vụ · tự chấm 86,5/100". */
      detail?: string;
    },
    actorId: Id,
  ) {
    const href = HREF[subject.flow].inbox;
    const title = `${subject.fromName} trình ${subject.label}`;
    await this.notifications.notify(
      [
        {
          userId: target.handlerId,
          kind: 'INCOMING',
          title,
          body: [target.detail, 'Chờ bạn duyệt.'].filter(Boolean).join(' · '),
          href,
        },
        ...(target.participants ?? []).map((p) => ({
          userId: p.userId,
          kind: 'INFORM' as const,
          title,
          body:
            p.role === 'COORDINATE'
              ? 'Đơn vị bạn được mời phối hợp - gửi ý kiến cho đơn vị chủ trì.'
              : 'Gửi đơn vị bạn để biết.',
          href,
        })),
      ],
      { skipUserId: actorId },
    );
  }

  /**
   * Người duyệt vừa quyết. `outcome` đúng như các hàm `decide` trả:
   * - FORWARDED: cấp 1 duyệt → báo người duyệt cuối.
   * - APPROVED: chốt → báo người đã trình.
   * - RETURNED: trả về đơn vị lập → báo người đã trình.
   * - RETURNED_TO_PREVIOUS: duyệt cuối trả về cấp 1 → báo người duyệt cấp 1.
   */
  async decided(
    subject: NotifySubject,
    doc: {
      sentById: Id;
      recipientId: Id;
      finalRecipientId?: Id;
    },
    outcome: 'FORWARDED' | 'APPROVED' | 'RETURNED' | 'RETURNED_TO_PREVIOUS',
    actor: { id: Id; name: string },
    reason = '',
  ) {
    const { inbox } = HREF[subject.flow];
    const own = subject.ownHref ?? HREF[subject.flow].own;
    const label = subject.label;
    /* Tên người quyết đứng riêng sau nhãn "Người duyệt:" - tên tài khoản
       thường đã có đuôi (VD "Đội CNTT - Duyệt"), ghép thẳng với động từ thành
       "… - Duyệt đã duyệt" rất khó đọc. */
    // Mỗi ý một dòng (client tách theo "\n"): lý do dài thì cắt "…" ở khung
    // chuông mà dòng người trả vẫn đọc được.
    const returnBody = (who: string) =>
      reason ? `Lý do: ${reason}\nNgười trả: ${who}` : `Người trả: ${who}`;
    const input =
      outcome === 'FORWARDED'
        ? {
            userId: doc.finalRecipientId,
            kind: 'INCOMING' as const,
            title: `${cap(label)} của ${subject.fromName} chờ duyệt cuối`,
            body: `Đã duyệt cấp 1: ${actor.name}\nChờ bạn duyệt cuối.`,
            href: inbox,
          }
        : outcome === 'APPROVED'
          ? {
              userId: doc.sentById,
              kind: 'APPROVED' as const,
              title: `${cap(label)} đã được duyệt`,
              body: `Người duyệt: ${actor.name}`,
              href: own,
            }
          : outcome === 'RETURNED'
            ? {
                userId: doc.sentById,
                kind: 'RETURNED' as const,
                title: `${cap(label)} bị trả lại`,
                body: returnBody(actor.name),
                href: own,
              }
            : {
                userId: doc.recipientId,
                kind: 'RETURNED' as const,
                title: `${cap(label)} của ${subject.fromName} bị trả về bạn`,
                body: returnBody(actor.name),
                href: inbox,
              };
    await this.notifications.notify(input, { skipUserId: actor.id });
  }

  /** Đơn vị phối hợp gửi ý kiến → báo người đang cầm bản. */
  async commented(
    subject: NotifySubject,
    handlerId: Id,
    from: { departmentName: string; comment: string },
    actorId: Id,
  ) {
    if (!from.comment.trim()) return; // Xoá ý kiến thì không báo.
    await this.notifications.notify(
      {
        userId: handlerId,
        kind: 'COMMENT',
        title: `${from.departmentName} gửi ý kiến phối hợp`,
        body: `Về ${label(subject)}: "${from.comment.trim()}"`,
        href: HREF[subject.flow].inbox,
      },
      { skipUserId: actorId },
    );
  }
}

const label = (subject: NotifySubject) =>
  `${subject.label} của ${subject.fromName}`;
