/**
 * Cấp bậc hàm trong Công an nhân dân.
 *
 * Xếp từ THẤP LÊN CAO theo trật tự của Luật Công an nhân dân. Bốn nhóm nối
 * liền nhau trong một mảng, không chèn tiêu đề nhóm: `SearchableSelect` chỉ
 * nhận danh sách phẳng, mà bốn nhóm này tự phân biệt bằng chữ cuối (sĩ / úy /
 * tá / tướng) nên nhìn vào là ra ngay.
 *
 * BẢN SAO của `server/src/common/enums/police-rank.enum.ts` - hai bên phải
 * giống hệt nhau. Lệch một giá trị là server trả 400 cho đúng cái cấp bậc mà
 * dropdown vừa bày ra cho người dùng chọn.
 */
export const POLICE_RANKS = [
  // Hạ sĩ quan, chiến sĩ
  "Binh nhì",
  "Binh nhất",
  "Hạ sĩ",
  "Trung sĩ",
  "Thượng sĩ",
  // Sĩ quan cấp úy
  "Thiếu úy",
  "Trung úy",
  "Thượng úy",
  "Đại úy",
  // Sĩ quan cấp tá
  "Thiếu tá",
  "Trung tá",
  "Thượng tá",
  "Đại tá",
  // Sĩ quan cấp tướng
  "Thiếu tướng",
  "Trung tướng",
  "Thượng tướng",
  "Đại tướng",
] as const;

export type PoliceRank = (typeof POLICE_RANKS)[number];

/** Giá trị của mục "chưa đặt" - Select không nhận chuỗi rỗng làm value. */
export const NO_RANK = "__none__";

export const RANK_OPTIONS = [
  { value: NO_RANK, label: "Chưa đặt cấp bậc" },
  ...POLICE_RANKS.map((rank) => ({ value: rank, label: rank })),
];
