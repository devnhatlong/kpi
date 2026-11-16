import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Notification,
  NotificationDocument,
  NotificationKind,
} from './schemas/notification.schema';

export type NotifyInput = {
  userId: Types.ObjectId | string | null | undefined;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  dedupeKey?: string;
};

/** Khung xổ xuống trên chuông chỉ bày chừng này - xem thêm thì sang trang. */
export const NOTIFICATION_DROPDOWN_LIMIT = 20;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly model: Model<NotificationDocument>,
  ) {}

  /**
   * Tạo thông báo. KHÔNG BAO GIỜ ném lỗi ra ngoài: thông báo là việc phụ, gửi
   * hỏng thì ghi log chứ không được làm hỏng lượt trình / duyệt vừa lưu xong.
   *
   * Bỏ dòng thiếu người nhận và gộp trùng (cùng người, cùng khoá) trong một lượt.
   */
  async notify(
    inputs: NotifyInput | NotifyInput[],
    options: { skipUserId?: Types.ObjectId | string | null } = {},
  ): Promise<void> {
    const skip = options.skipUserId ? String(options.skipUserId) : '';
    const seen = new Set<string>();
    const docs = (Array.isArray(inputs) ? inputs : [inputs])
      .filter((input) => {
        if (!input.userId || !Types.ObjectId.isValid(String(input.userId))) {
          return false;
        }
        const user = String(input.userId);
        // Người tự bấm thì không tự báo cho mình.
        if (user === skip) return false;
        const key = `${user}|${input.dedupeKey ?? input.title}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((input) => ({
        userId: new Types.ObjectId(String(input.userId)),
        kind: input.kind,
        title: input.title,
        body: input.body ?? '',
        href: input.href ?? '',
        ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      }));
    if (!docs.length) return;
    try {
      // ordered: false - một dòng trùng khoá không chặn các dòng còn lại.
      await this.model.insertMany(docs, { ordered: false });
    } catch (error) {
      const code = (error as { code?: number }).code;
      const dupOnly =
        code === 11000 ||
        (
          (error as { writeErrors?: Array<{ code?: number }> }).writeErrors ??
          []
        ).every((e) => e.code === 11000);
      if (!dupOnly) {
        this.logger.error(
          `Không tạo được thông báo: ${(error as Error).message}`,
        );
      }
    }
  }

  async list(
    userId: string,
    query: { page?: number; limit?: number; unread?: boolean },
  ) {
    const owner = new Types.ObjectId(userId);
    const limit = Math.min(
      100,
      Math.max(1, query.limit ?? NOTIFICATION_DROPDOWN_LIMIT),
    );
    const filter: Record<string, unknown> = { userId: owner };
    if (query.unread) filter.readAt = null;
    const [total, unreadCount] = await Promise.all([
      this.model.countDocuments(filter),
      this.model.countDocuments({ userId: owner, readAt: null }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, query.page ?? 1), totalPages);
    const items = await this.model
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('kind title body href readAt createdAt')
      .lean();
    return {
      message: 'OK',
      data: items.map((item) => ({
        id: String(item._id),
        kind: item.kind,
        title: item.title,
        body: item.body,
        href: item.href,
        read: Boolean(item.readAt),
        createdAt: item.createdAt,
      })),
      meta: { total, page, limit, totalPages, unreadCount },
    };
  }

  async unreadCount(userId: string) {
    const count = await this.model.countDocuments({
      userId: new Types.ObjectId(userId),
      readAt: null,
    });
    return { message: 'OK', data: { unreadCount: count } };
  }

  async markRead(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }
    const mine = { _id: id, userId: new Types.ObjectId(userId) };
    // Chỉ ghi khi còn chưa đọc - giữ đúng thời điểm đọc lần đầu.
    const result = await this.model.updateOne(
      { ...mine, readAt: null },
      { $set: { readAt: new Date() } },
    );
    if (!result.matchedCount && !(await this.model.exists(mine))) {
      throw new NotFoundException('Không tìm thấy thông báo.');
    }
    return { message: 'Đã đánh dấu đã đọc.' };
  }

  async markAllRead(userId: string) {
    const result = await this.model.updateMany(
      { userId: new Types.ObjectId(userId), readAt: null },
      { $set: { readAt: new Date() } },
    );
    return {
      message: 'Đã đánh dấu đã đọc hết.',
      data: { updated: result.modifiedCount },
    };
  }
}
