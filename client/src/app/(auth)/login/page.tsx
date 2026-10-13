import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = {
  // Khuôn ở layout gốc tự nối " - Hệ thống KPI Công an Lâm Đồng".
  title: "Đăng nhập",
  description: "Đăng nhập vào Hệ thống KPI Công an Lâm Đồng.",
  openGraph: {
    title: "Đăng nhập - Hệ thống KPI Công an Lâm Đồng",
    description: "Hệ thống KPI Công an Lâm Đồng.",
  },
};

const stats = [
  {
    title: "VẬN HÀNH",
    label: "Số liệu chấm điểm theo đúng quy định, quy trình của ngành.",
    value: "CHÍNH XÁC",
  },
  {
    title: "CÁCH ĐÁNH GIÁ",
    label: "Mỗi cán bộ, chiến sĩ đều thấy rõ căn cứ chấm điểm của mình.",
    value: "MINH BẠCH",
  },
  {
    title: "TỐC ĐỘ CẬP NHẬT",
    label: "Tiến độ nhiệm vụ được ghi nhận theo thời gian thực.",
    value: "KỊP THỜI",
  },
];

export default function LoginPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <aside
        className="relative hidden lg:flex flex-col justify-between p-12 text-primary-foreground overflow-hidden"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div
          className="absolute inset-0 opacity-70 mix-blend-overlay pointer-events-none"
          style={{ background: "var(--gradient-mesh)" }}
        />
        {/* Đơn vị chủ quản: dòng nhỏ cạnh logo - nhường chỗ to nhất cho tên
            phần mềm ở dưới. */}
        <div className="relative flex items-center gap-3">
          <div className="relative h-14 w-14 shrink-0">
            <Image
              src="/icons/logo_cand.png"
              alt="Logo Công an"
              fill
              sizes="56px"
              className="object-contain"
            />
          </div>
          <div className="text-sm font-semibold uppercase tracking-[0.25em] text-yellow-300">
            Công an tỉnh Lâm Đồng
          </div>
        </div>

        <div className="relative space-y-10">
          <div>
            {/* TÊN PHẦN MỀM - tiêu đề chính của trang. */}
            {/* Hai dòng CÙNG CỠ - đọc liền một tên, chỉ khác màu. */}
            <h1 className="font-display text-6xl font-bold leading-[1.05] tracking-tight xl:text-7xl">
              <span className="block">Hệ thống KPI</span>
              <span className="block text-yellow-100">Công an Lâm Đồng</span>
            </h1>
            <p className="mt-6 font-display text-2xl font-semibold text-white/90">
              Đánh giá hiệu suất công tác minh bạch.
            </p>
            <p className="mt-3 max-w-xl text-white/75">
              Nền tảng chấm điểm nhiệm vụ giúp cán bộ, chiến sĩ Công an tỉnh Lâm
              Đồng theo dõi tiến độ nhiệm vụ và nâng cao hiệu quả công tác theo
              thời gian thực.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 max-w-5xl">
            {stats.map(({ title, label, value }) => (
              <div
                key={title}
                className="rounded-3xl bg-white/10 backdrop-blur-md p-7 ring-1 ring-white/15 min-h-[220px] flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.35em] text-white/70 mb-4">
                    {title}
                  </div>
                  <div className="font-display text-4xl font-bold leading-tight">
                    {value}
                  </div>
                </div>
                <div className="text-sm text-white/70 mt-4">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative text-sm text-white/70">
          © {new Date().getFullYear()} Công an tỉnh Lâm Đồng.
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-md">
          {/* Bản cho màn hẹp (không có cột trái): tên phần mềm vẫn là chữ to
              nhất, đơn vị chủ quản là dòng nhỏ phía trên. */}
          <div className="lg:hidden mb-10 flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0">
              <Image
                src="/icons/logo_cand.png"
                alt="Logo Công an"
                fill
                sizes="64px"
                className="object-contain"
              />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Công an tỉnh Lâm Đồng
              </div>
              <div className="font-display text-2xl font-bold leading-tight text-primary">
                Hệ thống KPI
                <br />
                Công an Lâm Đồng
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold text-foreground">
              Chào mừng trở lại
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Đăng nhập để chấm điểm và quản lý nhiệm vụ cán bộ, chiến sĩ.
            </p>
          </div>

          <LoginForm />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Chưa có tài khoản?{" "}
            <a href="#" className="font-medium text-primary hover:underline">
              Liên hệ quản trị viên
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
