import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/features/auth/auth-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Quản lý KPI - Công an Lâm Đồng",
    template: "%s - Quản lý KPI",
  },
  description: "Hệ thống chấm điểm và quản lý KPI",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${inter.variable} ${spaceGrotesk.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            {children}
            <Toaster richColors position="top-right" />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
