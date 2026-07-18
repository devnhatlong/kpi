import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  FileText,
  Gauge,
  Network,
  Settings,
  Target,
  Trophy,
} from "lucide-react";

export type NavSubItem = {
  title: string;
  href: string;
};

export type NavItem = {
  title: string;
  href?: string;
  icon: LucideIcon;
  children?: NavSubItem[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    title: "Tổng quan",
    href: "/dashboard",
    icon: Gauge,
  },
  {
    title: "KPI của tôi",
    href: "/my-kpi",
    icon: Target,
  },
  {
    title: "Tổ chức",
    icon: Network,
    children: [
      { title: "Đơn vị", href: "/organization/units" },
      { title: "Người dùng", href: "/users" },
      { title: "Nhân viên", href: "/organization/employees" },
    ],
  },
  {
    title: "Quản lý KPI",
    icon: Trophy,
    children: [
      { title: "Cấu hình & giao KPI", href: "/kpi/config" },
      { title: "Theo dõi KPI", href: "/kpi/tracking" },
      { title: "Chấm điểm KPI", href: "/kpi/scoring" },
    ],
  },
  {
    title: "Báo cáo",
    href: "/reports",
    icon: FileText,
  },
  {
    title: "Phân tích",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    title: "Cài đặt",
    href: "/settings",
    icon: Settings,
  },
];

export const SIDEBAR_BRAND = {
  title: "KPI Score",
  subtitle: "Performance",
} as const;

/** Placeholder until auth context is wired */
export const CURRENT_USER = {
  name: "Nguyễn Nhật Long",
  role: "Cán bộ",
  initials: "NA",
} as const;
