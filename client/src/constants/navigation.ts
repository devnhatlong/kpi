import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardCheck,
  ContactRound,
  FileText,
  Gauge,
  KeyRound,
  Layers,
  Network,
  Settings,
  Settings2,
  Shield,
  Target,
  Trophy,
  Users,
} from "lucide-react";

export type NavSubItem = {
  title: string;
  href: string;
  icon: LucideIcon;
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
      { title: "Đơn vị", href: "/organization/units", icon: Network },
      { title: "Cấp đơn vị", href: "/organization/levels", icon: Layers },
      { title: "Vai trò", href: "/organization/roles", icon: Shield },
      { title: "Quyền", href: "/organization/permissions", icon: KeyRound },
      { title: "Người dùng", href: "/users", icon: ContactRound },
      { title: "Nhân viên", href: "/organization/employees", icon: Users },
    ],
  },
  {
    title: "Quản lý KPI",
    icon: Trophy,
    children: [
      { title: "Cấu hình & giao KPI", href: "/kpi/config", icon: Settings2 },
      { title: "Theo dõi KPI", href: "/kpi/tracking", icon: Target },
      { title: "Chấm điểm KPI", href: "/kpi/scoring", icon: ClipboardCheck },
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
  title: "KPI Manager",
  subtitle: "Performance",
} as const;
