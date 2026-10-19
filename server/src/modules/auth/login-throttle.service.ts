import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

type Bucket = { failures: number; firstAt: number; lockedUntil: number };

type Rule = { prefix: string; maxFailures: number };

/** Cửa sổ đếm lần sai, cũng là thời gian khoá khi vượt ngưỡng. */
const WINDOW_MS = 15 * 60 * 1000;

/*
  Ba tầng, từ hẹp tới rộng:

  - tài khoản + IP: một máy gõ sai một tài khoản. Hẹp nhất nên ngưỡng thấp.
  - tài khoản: tài khoản đội dùng chung cho ~30 người ở nhiều máy, nên ngưỡng
    phải rộng - không thì một người gõ sai vài lần là cả đội bị khoá.
  - IP: một máy dò nhiều tài khoản (vd dò mật khẩu thứ 2 trên tên bất kỳ).
*/
const RULES: Rule[] = [
  { prefix: 'user-ip', maxFailures: 5 },
  { prefix: 'user', maxFailures: 20 },
  { prefix: 'ip', maxFailures: 30 },
];

/**
 * Giới hạn số lần đăng nhập sai, giữ trong RAM của tiến trình.
 *
 * Tự viết chứ không dùng @nestjs/throttler: máy đích không có internet, thêm
 * gói là thêm việc mang node_modules sang; mà ở đây chỉ cần đếm lần sai của
 * đúng một route. Khởi động lại server thì bộ đếm về 0 - chấp nhận được.
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);
  private readonly buckets = new Map<string, Bucket>();

  /** Gọi TRƯỚC khi kiểm mật khẩu - đang bị khoá thì không kiểm luôn. */
  assertAllowed(username: string, ip: string) {
    const now = Date.now();
    for (const key of this.keysOf(username, ip)) {
      const bucket = this.buckets.get(key);
      if (bucket && bucket.lockedUntil > now) {
        const minutes = Math.ceil((bucket.lockedUntil - now) / 60000);
        throw new HttpException(
          `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${minutes} phút.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  recordFailure(username: string, ip: string) {
    const now = Date.now();
    this.keysOf(username, ip).forEach((key, index) => {
      let bucket = this.buckets.get(key);
      if (!bucket || now - bucket.firstAt > WINDOW_MS) {
        bucket = { failures: 0, firstAt: now, lockedUntil: 0 };
        this.buckets.set(key, bucket);
      }
      bucket.failures += 1;
      if (bucket.failures >= RULES[index].maxFailures && !bucket.lockedUntil) {
        bucket.lockedUntil = now + WINDOW_MS;
        this.logger.warn(
          `Khoá đăng nhập tạm thời: ${key} (${bucket.failures} lần sai).`,
        );
      }
    });
    this.sweep(now);
  }

  /** Đăng nhập đúng thì xoá bộ đếm của chính máy đó với tài khoản đó. */
  recordSuccess(username: string, ip: string) {
    this.buckets.delete(this.keysOf(username, ip)[0]);
  }

  private keysOf(username: string, ip: string): string[] {
    const name = username.trim().toLowerCase();
    return [`user-ip:${name}|${ip}`, `user:${name}`, `ip:${ip}`];
  }

  /** Dọn bộ đếm đã hết hạn để Map không phình mãi. */
  private sweep(now: number) {
    if (this.buckets.size < 1000) return;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.firstAt > WINDOW_MS && bucket.lockedUntil <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
