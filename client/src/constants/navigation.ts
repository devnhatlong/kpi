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
  MailOpen,
  Network,
  Settings,
  Shield,
  ShieldCheck,
  Table2,
  Users,
} from "lucide-react";

import { PERM } from "@/constants/permissions";

export type NavSubItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Nếu có: chỉ hiện khi user có ít nhất một trong các quyền này. */
  permissions?: string[];
};

export type NavItem = {
  title: string;
  href?: string;
  icon: LucideIcon;
  children?: NavSubItem[];
  /**
   * Nếu có: chỉ hiện khi user có ít nhất một trong các quyền này.
   * Nhóm menu bỏ trống thì hiện khi còn ít nhất một mục con hiện được.
   */
  permissions?: string[];
};

/**
 * Menu theo đặc tả:
 * - KPI của tôi: báo cáo bottom-up (Staff/Manager tự khai)
 * - Duyệt KPI cấp dưới: cấp trên nhận & duyệt
 * - KPI cấp trên giao: nhiệm vụ top-down giao xuống
 */
export const NAV_ITEMS: NavItem[] = [
  {
    title: "Thống kê",
    href: "/dashboard",
    icon: Gauge,
  },
  {
    title: "KPI của tôi",
    href: "/kpi/personal",
    icon: ClipboardList,
    permissions: [PERM.EVALUATION_SELF],
  },
  {
    title: "Duyệt KPI cấp dưới",
    href: "/kpi/received",
    icon: MailOpen,
    permissions: [PERM.EVALUATION_APPROVE],
  },
  {
    title: "KPI cấp trên giao",
    href: "/kpi/assigned",
    icon: Inbox,
    permissions: [PERM.TASK_VIEW],
  },
  {
    title: "Tổng hợp & nâng cấp",
    href: "/kpi/promote",
    icon: Filter,
    permissions: [PERM.EVALUATION_APPROVE],
  },
  {
    title: "Giao KPI xuống",
    href: "/kpi/assign",
    icon: ArrowDownToLine,
    permissions: [PERM.TASK_ASSIGN],
  },
  {
    title: "Danh mục",
    href: "/kpi/catalogs",
    icon: BookMarked,
    permissions: [PERM.KPI_MANAGE],
  },
  {
    title: "Cấu hình form KPI",
    icon: FormInput,
    permissions: [PERM.KPI_MANAGE],
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
      {
        title: "Mẫu bảng KPI",
        href: "/kpi/form-config/form-templates",
        icon: Table2,
      },
    ],
  },
  {
    title: "Tổ chức",
    icon: Network,
    // Không đặt quyền ở nhóm: mỗi mục con tự quyết, nhóm hiện khi còn mục nào.
    children: [
      {
        title: "Đơn vị",
        href: "/organization/units",
        icon: Network,
        permissions: [PERM.DEPARTMENT_VIEW],
      },
      {
        title: "Cấp đơn vị",
        href: "/organization/levels",
        icon: Layers,
        permissions: [PERM.DEPARTMENT_VIEW],
      },
      {
        title: "Vai trò",
        href: "/organization/roles",
        icon: Shield,
        permissions: [PERM.ROLE_ASSIGN],
      },
      {
        // Danh sách quyền đọc bằng role.assign; sửa mới cần system.config.
        // Gán theo quyền đọc để menu không hiện ra trang load lên là 403.
        title: "Quyền",
        href: "/organization/permissions",
        icon: KeyRound,
        permissions: [PERM.ROLE_ASSIGN],
      },
      {
        title: "Phân quyền giao KPI",
        href: "/organization/kpi-scope",
        icon: ShieldCheck,
        permissions: [PERM.SYSTEM_CONFIG],
      },
      {
        title: "Người dùng",
        href: "/organization/employees",
        icon: Users,
        permissions: [PERM.USER_VIEW],
      },
    ],
  },
  {
    // Hồ sơ + đổi mật khẩu của CHÍNH người dùng, không phải cấu hình hệ thống.
    // Ai đăng nhập cũng phải vào được, nên không gắn quyền.
    title: "Cài đặt",
    href: "/settings",
    icon: Settings,
  },
];

/** Đường không nằm trong menu nhưng vẫn phải chặn. */
const EXTRA_PATH_PERMISSIONS: Record<string, string[]> = {
  "/kpi/personal/inbox": [PERM.EVALUATION_APPROVE],
};

/**
 * Bảng đường dẫn → quyền, dựng thẳng từ NAV_ITEMS để menu và guard không bao
 * giờ lệch nhau. Mục con không khai quyền thì thừa hưởng của nhóm.
 */
const PATH_PERMISSIONS: Array<[string, string[]]> = (() => {
  const entries: Array<[string, string[]]> = [];

  for (const item of NAV_ITEMS) {
    if (item.href && item.permissions?.length) {
      entries.push([item.href, item.permissions]);
    }
    for (const child of item.children ?? []) {
      const permissions = child.permissions?.length
        ? child.permissions
        : item.permissions;
      if (permissions?.length) entries.push([child.href, permissions]);
    }
  }

  for (const [href, permissions] of Object.entries(EXTRA_PATH_PERMISSIONS)) {
    entries.push([href, permissions]);
  }

  // Khớp đường dài trước, để /kpi/personal/inbox không bị /kpi/personal nuốt.
  return entries.sort((a, b) => b[0].length - a[0].length);
})();

/** Quyền cần có để vào một path, null nghĩa là ai đăng nhập cũng vào được. */
export function pathRequiresPermissions(
  pathname: string,
): readonly string[] | null {
  const hit = PATH_PERMISSIONS.find(
    ([href]) => pathname === href || pathname.startsWith(`${href}/`),
  );
  return hit ? hit[1] : null;
}

export const SIDEBAR_BRAND = {
  title: "KPI Manager",
  subtitle: "Performance",
} as const;
