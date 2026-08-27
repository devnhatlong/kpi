/**
 * Cấp bậc hàm trong Công an nhân dân.
 *
 * Xếp từ CAO XUỐNG THẤP - đây là thứ tự bày ra trong dropdown. Bốn nhóm nối
 * liền nhau trong một mảng, không chèn tiêu đề nhóm: `SearchableSelect` chỉ
 * nhận danh sách phẳng, mà bốn nhóm này tự phân biệt bằng chữ cuối (sĩ / úy /
 * tá / tướng) nên nhìn vào là ra ngay.
 *
 * Cùng BỘ GIÁ TRỊ với `server/src/common/enums/police-rank.enum.ts`, nhưng thứ
 * tự hai bên không cần trùng: bên server danh sách chỉ dùng để kiểm tra giá trị
 * gửi lên có nằm trong danh mục hay không, thứ tự không ảnh hưởng gì. Thêm hay
 * bớt một cấp bậc thì phải sửa CẢ HAI - lệch bộ giá trị là server trả 400 cho
 * đúng cái cấp bậc mà dropdown vừa bày ra cho người dùng chọn.
 */
export const POLICE_RANKS = [
  // Sĩ quan cấp tướng
  "Đại tướng",
  "Thượng tướng",
  "Trung tướng",
  "Thiếu tướng",

  // Sĩ quan cấp tá
  "Đại tá",
  "Thượng tá",
  "Trung tá",
  "Thiếu tá",

  // Sĩ quan cấp úy
  "Đại úy",
  "Thượng úy",
  "Trung úy",
  "Thiếu úy",

  // Hạ sĩ quan, chiến sĩ
  "Thượng sĩ",
  "Trung sĩ",
  "Hạ sĩ",
  "Binh nhất",
  "Binh nhì",
] as const;

export type PoliceRank = (typeof POLICE_RANKS)[number];

/** Giá trị của mục "chưa đặt" - Select không nhận chuỗi rỗng làm value. */
export const NO_RANK = "__none__";

export const RANK_OPTIONS = [
  { value: NO_RANK, label: "Chưa đặt cấp bậc" },
  ...POLICE_RANKS.map((rank) => ({ value: rank, label: rank })),
];
