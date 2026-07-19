"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/features/auth/auth-provider";
import { DEFAULT_APP_PATH } from "@/features/auth/constants";

export default function RootPage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (status === "authenticated") {
      router.replace(DEFAULT_APP_PATH);
      return;
    }
    router.replace("/login");
  }, [status, router]);

  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div
        className="size-9 animate-spin rounded-full border-2 border-muted border-t-primary"
        aria-hidden
      />
    </div>
  );
}
