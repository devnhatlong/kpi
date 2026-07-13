"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, Lock, User } from "lucide-react";

export function LoginForm() {
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 1200);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl bg-card p-7 border border-border"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="space-y-5">
        <div>
          <label htmlFor="username" className="text-sm font-medium text-foreground">
            Tên đăng nhập
          </label>
          <div className="mt-2 relative">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="username"
              type="text"
              required
              placeholder="Nhập tên đăng nhập"
              className="w-full h-11 pl-10 pr-4 rounded-lg bg-input/40 border border-border text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Mật khẩu
          </label>
          <div className="mt-2 relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="password"
              type={showPwd ? "text" : "password"}
              required
              placeholder="••••••••"
              className="w-full h-11 pl-10 pr-11 rounded-lg bg-input/40 border border-border text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-ring focus:ring-2 focus:ring-ring/20 transition"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
              aria-label={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground select-none">
          <input type="checkbox" className="h-4 w-4 rounded border-border accent-[color:var(--primary)]" />
          Ghi nhớ đăng nhập trong 30 ngày
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-lg font-medium text-primary-foreground transition-transform active:scale-[0.99] disabled:opacity-70"
          style={{ background: "var(--gradient-hero)", boxShadow: "var(--shadow-elegant)" }}
        >
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>

        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-xs text-muted-foreground">hoặc tiếp tục với</span>
          </div>
        </div>

        <button
          type="button"
          className="w-full h-11 rounded-lg border border-border bg-background hover:bg-secondary text-sm font-medium text-foreground transition inline-flex items-center justify-center gap-2"
        >
          <KeyRound className="h-4 w-4" />
          Đăng nhập bằng SSO
        </button>
      </div>
    </form>
  );
}
