import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = {
  title: "Đăng nhập - Hệ thống chấm điểm nhiệm vụ Công an tỉnh Lâm Đồng",
  description:
    "Đăng nhập vào hệ thống chấm điểm và quản lý nhiệm vụ cán bộ, chiến sĩ Công an tỉnh Lâm Đồng.",
  openGraph: {
    title: "Đăng nhập - nhiệm vụ Công an tỉnh Lâm Đồng",
    description:
      "Hệ thống chấm điểm nhiệm vụ dành cho lực lượng Công an tỉnh Lâm Đồng.",
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
        <div className="relative flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0">
            <Image
              src="/icons/logo_cand.png"
              alt="Logo Công an"
              fill
              sizes="80px"
              className="object-contain"
            />
          </div>
          <div>
            <div className="font-display text-3xl font-bold leading-tight">
              Công an tỉnh Lâm Đồng
            </div>
            <div className="text-base text-white/80">
              Hệ thống quản lý và chấm điểm nhiệm vụ
            </div>
          </div>
        </div>

        <div className="relative space-y-8">
          <div>
            <h1 className="font-display text-5xl font-bold leading-[1.05]">
              Đánh giá hiệu suất
              <br />
              <span className="text-white/80">
                công tác <span className="text-yellow-100">minh bạch.</span>
              </span>
            </h1>
            <p className="mt-5 text-white/80 max-w-xl">
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
          {/* Bản cho màn hẹp: cùng cỡ chữ với cột trái, khỏi lệch nhận diện. */}
          <div className="lg:hidden flex items-center gap-4 mb-8">
            <div className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden ring-1 ring-primary/20">
              <Image
                src="/icons/logo_cand.png"
                alt="Logo Công an"
                fill
                sizes="80px"
                className="object-contain"
              />
            </div>
            <div>
              <div className="font-display text-2xl font-bold leading-tight">
                Công an tỉnh Lâm Đồng
              </div>
              <div className="text-sm text-muted-foreground">
                Hệ thống quản lý và chấm điểm nhiệm vụ
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
