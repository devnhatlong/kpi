import type { NextConfig } from "next";

/*
  Header bảo mật cho mọi trang. CSP chỉ khoá những thứ không làm gãy gì:
  không cho trang bị nhúng vào site khác (chống clickjacking), không plugin,
  không đổi <base>. Chưa siết script-src - Next chèn script inline và editor
  OnlyOffice nạp từ Document Server, siết phải đi kèm nonce.
*/
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
