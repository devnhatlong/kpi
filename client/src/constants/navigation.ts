import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  ClipboardCheck,
  FileText,
  Gauge,
  Inbox,
  KeyRound,
  Layers,
  Network,
  Rocket,
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
  /** Nếu có: chỉ hiện khi user có ít nhất một trong các role này. */
  roles?: string[];
};

export type NavItem = {
  title: string;
  href?: string;
  icon: LucideIcon;
  children?: NavSubItem[];
  /** Nếu có: chỉ hiện khi user có ít nhất một trong các role này. */
  roles?: string[];
};

/** Chỉ SUPER_ADMIN được vào khu vực tổ chức / cài đặt hệ thống. */
export const SUPER_ADMIN_ONLY = ["SUPER_ADMIN"] as const;

/** Role được vận hành KPI (xem bảng, giao / phân rã nhiệm vụ). */
export const KPI_OPERATOR_ROLES = [
  "SUPER_ADMIN",
  "UNIT_ADMIN",
  "MANAGER",
] as const;

/** Prefix chỉ SUPER_ADMIN (chặn URL trực tiếp). */
export const SUPER_ADMIN_PATH_PREFIXES = [
  "/organization",
  "/settings",
] as const;

/** Prefix KPI — SUPER_ADMIN / UNIT_ADMIN / MANAGER. */
export const KPI_OPERATOR_PATH_PREFIXES = ["/kpi"] as const;

export function isSuperAdminPath(pathname: string): boolean {
  return SUPER_ADMIN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isKpiOperatorPath(pathname: string): boolean {
  return KPI_OPERATOR_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Kiểm tra user có được vào path theo role hay không (dùng chung guard + login). */
export function pathRequiresRoles(pathname: string): readonly string[] | null {
  if (isSuperAdminPath(pathname)) return SUPER_ADMIN_ONLY;
  if (
    pathname === "/kpi/publish" ||
    pathname.startsWith("/kpi/publish/")
  ) {
    return SUPER_ADMIN_ONLY;
  }
  if (isKpiOperatorPath(pathname)) return KPI_OPERATOR_ROLES;
  return null;
}

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
    roles: [...SUPER_ADMIN_ONLY],
    children: [
      { title: "Đơn vị", href: "/organization/units", icon: Network },
      { title: "Cấp đơn vị", href: "/organization/levels", icon: Layers },
      { title: "Vai trò", href: "/organization/roles", icon: Shield },
      { title: "Quyền", href: "/organization/permissions", icon: KeyRound },
      { title: "Người dùng", href: "/organization/employees", icon: Users },
    ],
  },
  {
    title: "Quản lý KPI",
    icon: Trophy,
    roles: [...KPI_OPERATOR_ROLES],
    children: [
      {
        title: "Phát hành KPI cấp tỉnh",
        href: "/kpi/publish",
        icon: Rocket,
        roles: [...SUPER_ADMIN_ONLY],
      },
      {
        title: "Form KPI",
        href: "/kpi/sheet",
        icon: FileText,
        roles: [...KPI_OPERATOR_ROLES],
      },
      {
        title: "Chủ trì giao ngang",
        href: "/kpi/tracking",
        icon: Target,
        roles: [...KPI_OPERATOR_ROLES],
      },
      {
        title: "Tiếp nhận nhiệm vụ",
        href: "/kpi/inbox",
        icon: Inbox,
        roles: [...KPI_OPERATOR_ROLES],
      },
      {
        title: "Cấu hình & giao KPI",
        href: "/kpi/config",
        icon: Settings2,
        roles: [...KPI_OPERATOR_ROLES],
      },
      {
        title: "Chấm điểm KPI",
        href: "/kpi/scoring",
        icon: ClipboardCheck,
        roles: [...KPI_OPERATOR_ROLES],
      },
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
    roles: [...SUPER_ADMIN_ONLY],
  },
];

export const SIDEBAR_BRAND = {
  title: "KPI Manager",
  subtitle: "Performance",
} as const;
