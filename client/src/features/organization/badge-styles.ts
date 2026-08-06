/** Tag màu dùng chung - solid + white text đọc được cả light/dark. Không dùng tím. */

const CODE_PALETTE = [
  "bg-blue-600 text-white border-transparent dark:bg-blue-500",
  "bg-cyan-700 text-white border-transparent dark:bg-cyan-600",
  "bg-sky-600 text-white border-transparent dark:bg-sky-500",
  "bg-emerald-600 text-white border-transparent dark:bg-emerald-500",
  "bg-teal-600 text-white border-transparent dark:bg-teal-500",
  "bg-amber-600 text-white border-transparent dark:bg-amber-500",
  "bg-orange-600 text-white border-transparent dark:bg-orange-500",
  "bg-[#0f4c9c] text-white border-transparent dark:bg-blue-700",
] as const;

const MODULE_PALETTE = [
  "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  "border-transparent bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200",
  "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  "border-transparent bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  "border-transparent bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200",
  "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
] as const;

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Cấp gom nhóm (Khối) - xám để tách khỏi đơn vị thật trong cây. */
export const groupLevelBadgeClass =
  "border-transparent bg-slate-500 text-white dark:bg-slate-600";

/** Màu badge theo cấp đơn vị (rank). */
export function levelBadgeClass(rank?: number) {
  if (rank == null) return CODE_PALETTE[2];
  switch (rank) {
    case 1:
      return CODE_PALETTE[7]; // CAT
    case 2:
      return groupLevelBadgeClass; // KHOI - gom nhóm
    case 3:
      return CODE_PALETTE[0]; // PHONG
    case 4:
      return CODE_PALETTE[1]; // DOI
    case 5:
      return CODE_PALETTE[2]; // TO
    case 6:
      return CODE_PALETTE[3]; // XA
    case 7:
      return CODE_PALETTE[4]; // PHUONG
    case 8:
      return CODE_PALETTE[5]; // DON
    case 9:
      return CODE_PALETTE[6]; // DK
    default:
      return CODE_PALETTE[hashSeed(String(rank)) % CODE_PALETTE.length];
  }
}

/** Màu badge mã (vai trò / quyền / mã bất kỳ) - ổn định theo chuỗi. */
export function codeBadgeClass(code: string) {
  return CODE_PALETTE[hashSeed(code.toUpperCase()) % CODE_PALETTE.length];
}

/** Màu badge module quyền - nền nhạt, có dark mode. */
export function moduleBadgeClass(module: string) {
  return MODULE_PALETTE[hashSeed(module.toLowerCase()) % MODULE_PALETTE.length];
}

/** Trạng thái hoạt động - nền nhạt + chữ đậm (light), nền tối + chữ sáng (dark). */
export const activeBadgeClass =
  "border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";

/** Trạng thái ngừng - neutral, tương phản ổn định cả hai mode. */
export const inactiveBadgeClass =
  "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400";

export const systemBadgeClass =
  "border-transparent bg-blue-700 text-white dark:bg-blue-600";
