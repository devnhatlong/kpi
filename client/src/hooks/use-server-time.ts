"use client";

import { useEffect, useState } from "react";

import { ensureServerTimeSynced, isServerTimeSynced } from "@/lib/server-time";

/**
 * ready = đã xong lượt sync đầu tiên.
 * Sync lỗi cũng cho ready để component không kẹt loading - lúc đó dùng giờ máy.
 */
export function useServerTime() {
  const [ready, setReady] = useState(isServerTimeSynced);

  useEffect(() => {
    if (ready) return;

    let alive = true;
    const done = () => {
      if (alive) setReady(true);
    };
    ensureServerTimeSynced().then(done, done);

    return () => {
      alive = false;
    };
  }, [ready]);

  return { ready };
}
