import type { LucideIcon } from "lucide-react";
import {
  BookMarked,
  CalendarCheck,
  ClipboardPen,
  ClipboardList,
  FileSpreadsheet,
  FormInput,
  Gauge,
  Inbox,
  KeyRound,
  Layers,
  ListTree,
  Network,
  Settings,
  Shield,
  ShieldCheck,
  Stamp,
  Table2,
  Target,
  Trophy,
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
 * - nhiệm vụ cá nhân: báo cáo bottom-up (Staff/Manager tự khai)
 * - Duyệt nhiệm vụ cấp dưới: cấp trên nhận & duyệt
 * - nhiệm vụ cấp trên giao: nhiệm vụ top-down giao xuống
 */
export const NAV_ITEMS: NavItem[] = [
  {
    title: "Thống kê",
    href: "/dashboard",
    icon: Gauge,
  },
  /*
    Bản nghiệp vụ MỚI - báo cáo ngày cấp đội, chạy song song với các mục cũ.

    Dùng mã quyền riêng (TEAM_REPORT_*) nên đơn vị nào chưa chuyển sang bản mới
    thì không thấy nhóm này, và ngược lại - bật bản mới không làm mất mục cũ.
  */
  {
    title: "Báo cáo ngày của đội",
    icon: CalendarCheck,
    children: [
      {
        title: "Bảng nhiệm vụ ngày",
        href: "/team-report/sheet",
        icon: ClipboardPen,
        permissions: [PERM.TEAM_REPORT_ENTRY],
      },
      {
        title: "Phân loại & gửi",
        href: "/team-report/classify",
        icon: Table2,
        permissions: [PERM.TEAM_REPORT_ENTRY],
      },
      {
        title: "Duyệt báo cáo ngày",
        href: "/team-report/incoming",
        icon: Stamp,
        permissions: [PERM.TEAM_REPORT_REVIEW],
      },
    ],
  },
  {
    title: "Nhiệm vụ cá nhân",
    href: "/mission/personal",
    icon: ClipboardList,
    permissions: [PERM.EVALUATION_SELF],
  },
  {
    // Một mục thôi: màn này vừa theo dõi tiến độ vừa duyệt, tách hai dòng menu
    // cho cùng một việc chỉ làm người dùng phải đoán nên bấm dòng nào.
    title: "Theo dõi & duyệt nhiệm vụ",
    href: "/mission/received",
    icon: Stamp,
    permissions: [PERM.EVALUATION_APPROVE],
  },
  {
    title: "Nhiệm vụ cấp trên giao",
    href: "/mission/assigned",
    // Bia ngắm: đây là chỉ tiêu được giao xuống, không phải hộp thư đến.
    icon: Target,
    permissions: [PERM.TASK_VIEW],
  },
  {
    // Hai ngăn tách thành hai mục con: bản mình lập và bản cấp dưới trình lên
    // là hai việc khác nhau, gộp một trang rồi bắt người dùng gạt qua lại thì
    // không ai biết mình đang đứng ở đâu khi vào từ menu.
    title: "Báo cáo tổng hợp",
    icon: FileSpreadsheet,
    permissions: [PERM.EVALUATION_APPROVE],
    children: [
      {
        title: "Tạo báo cáo",
        href: "/mission/promote",
        icon: FileSpreadsheet,
      },
      {
        title: "Duyệt báo cáo",
        href: "/mission/promote/incoming",
        icon: Inbox,
      },
    ],
  },
  {
    title: "Giao nhiệm vụ xuống",
    href: "/mission/assign",
    icon: Trophy,
    permissions: [PERM.TASK_ASSIGN],
  },
  {
    title: "Danh mục",
    href: "/mission/catalogs",
    icon: BookMarked,
    permissions: [PERM.MISSION_MANAGE],
  },
  {
    title: "Cấu hình form nhiệm vụ",
    icon: FormInput,
    permissions: [PERM.MISSION_MANAGE],
    children: [
      {
        /*
          Một cửa cho cả ba việc từng nằm rời: khai trục, dựng bộ cột của trục,
          và khai tiêu chí chung. Ba thứ đó chỉ có nghĩa khi ghép lại thành mẫu
          báo cáo của năm, nên tách ba trang chỉ bắt người cấu hình đi vòng.
        */
        title: "Mẫu báo cáo nhiệm vụ",
        href: "/mission/form-config",
        icon: Table2,
      },
      {
        title: "Nội dung công việc",
        href: "/mission/form-config/work-contents",
        icon: ListTree,
      },
      {
        title: "Nhiệm vụ",
        href: "/mission/form-config/work-tasks",
        icon: ClipboardList,
      },
      {
        title: "Nhóm điểm",
        href: "/mission/form-config/score-groups",
        icon: Gauge,
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
        title: "Phân quyền giao nhiệm vụ",
        href: "/organization/mission-scope",
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
  "/mission/personal/inbox": [PERM.EVALUATION_APPROVE],
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

  // Khớp đường dài trước, để /mission/personal/inbox không bị /mission/personal nuốt.
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

/*
  Dòng trên là ĐƠN VỊ, dòng dưới là tên phần mềm - cùng thứ tự với màn đăng
  nhập. Đảo hai dòng ở hai chỗ thì cùng một hệ thống mà đọc ra hai nhận diện.
*/
export const SIDEBAR_BRAND = {
  title: "Công an tỉnh Lâm Đồng",
  subtitle: "Hệ thống quản lý và chấm điểm nhiệm vụ",
  logo: "/icons/logo_cand.png",
} as const;
