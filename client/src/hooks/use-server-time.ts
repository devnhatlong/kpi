"use client";

import { useEffect, useState } from "react";

import { syncServerTime } from "@/lib/server-time";

export function useServerTime() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    syncServerTime()
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  return { ready };
}
