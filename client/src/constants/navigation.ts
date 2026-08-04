import type { LucideIcon } from "lucide-react";
import {
  ArrowDownToLine,
  BookMarked,
  ClipboardList,
  Filter,
  FormInput,
  Gauge,
  Inbox,
  KeyRound,
  Layers,
  ListTree,
  Network,
  Settings,
  Shield,
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

export const SUPER_ADMIN_ONLY = ["SUPER_ADMIN"] as const;

export const ALL_KPI_ROLES = [
  "SUPER_ADMIN",
  "UNIT_ADMIN",
  "MANAGER",
  "STAFF",
] as const;

/** Manager trở lên — giao KPI xuống. */
export const KPI_ASSIGN_ROLES = [
  "SUPER_ADMIN",
  "UNIT_ADMIN",
  "MANAGER",
] as const;

/** Chỉ Manager / Unit admin — tổng hợp & nâng cấp. */
export const KPI_PROMOTE_ROLES = ["UNIT_ADMIN", "MANAGER"] as const;

/** Unit admin / Superadmin — danh mục, quản trị. */
export const KPI_ADMIN_ROLES = ["SUPER_ADMIN", "UNIT_ADMIN"] as const;

/** @deprecated dùng KPI_ASSIGN_ROLES */
export const KPI_OPERATOR_ROLES = KPI_ASSIGN_ROLES;

export const SUPER_ADMIN_PATH_PREFIXES = [
  "/organization",
  "/settings",
  "/kpi/form-config",
] as const;

export function isSuperAdminPath(pathname: string): boolean {
  return SUPER_ADMIN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** Kiểm tra user có được vào path theo role hay không (dùng chung guard + login). */
export function pathRequiresRoles(pathname: string): readonly string[] | null {
  if (isSuperAdminPath(pathname)) return SUPER_ADMIN_ONLY;

  if (
    pathname === "/kpi/promote" ||
    pathname.startsWith("/kpi/promote/")
  ) {
    return KPI_PROMOTE_ROLES;
  }
  if (
    pathname === "/kpi/assign" ||
    pathname.startsWith("/kpi/assign/")
  ) {
    return KPI_ASSIGN_ROLES;
  }
  if (
    pathname === "/kpi/catalogs" ||
    pathname.startsWith("/kpi/catalogs/")
  ) {
    return KPI_ADMIN_ROLES;
  }

  return null;
}

/**
 * Menu theo đặc tả: KPI cá nhân / được giao (mọi role),
 * tổng hợp & giao xuống (theo cấp), thống kê, quản trị.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    title: "Thống kê",
    href: "/dashboard",
    icon: Gauge,
  },
  {
    title: "KPI cá nhân",
    href: "/kpi/personal",
    icon: ClipboardList,
  },
  {
    title: "KPI được giao",
    href: "/kpi/assigned",
    icon: Inbox,
  },
  {
    title: "Tổng hợp & nâng cấp",
    href: "/kpi/promote",
    icon: Filter,
    roles: [...KPI_PROMOTE_ROLES],
  },
  {
    title: "Giao KPI xuống",
    href: "/kpi/assign",
    icon: ArrowDownToLine,
    roles: [...KPI_ASSIGN_ROLES],
  },
  {
    title: "Danh mục",
    href: "/kpi/catalogs",
    icon: BookMarked,
    roles: [...KPI_ADMIN_ROLES],
  },
  {
    title: "Cấu hình form KPI",
    icon: FormInput,
    roles: [...SUPER_ADMIN_ONLY],
    children: [
      {
        title: "Nhóm nội dung",
        href: "/kpi/form-config/content-groups",
        icon: Layers,
      },
      {
        title: "Trục",
        href: "/kpi/form-config/axes",
        icon: Layers,
      },
      {
        title: "Nội dung công việc",
        href: "/kpi/form-config/work-contents",
        icon: ListTree,
      },
      {
        title: "Nhóm điểm",
        href: "/kpi/form-config/score-groups",
        icon: Gauge,
      },
    ],
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
