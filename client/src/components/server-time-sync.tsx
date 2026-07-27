"use client";

import { useServerTime } from "@/hooks/use-server-time";

/** Đồng bộ giờ server khi vào dashboard. */
export function ServerTimeSync() {
  useServerTime();
  return null;
}
