import { Model, Types } from 'mongoose';

type IdLike = Types.ObjectId | string | null | undefined;

/** Cấp có tên đơn vị trùng nhau giữa các nơi ("Tổng hợp", "Tham mưu"…). */
const PREFIX_BY_LEVEL: Record<string, string> = { DOI: 'Đội', TO: 'Tổ' };

/**
 * Tên đơn vị đọc được ngay ở hộp đến: "Tổ Tổng hợp - Công an phường Hàm Thắng".
 *
 * Hàng trăm tổ / đội mang cùng tên trơn "Tổng hợp", "Tham mưu" - chỉ ghi tên là
 * người duyệt không biết bản của tổ nào. Tổ / đội thì thêm tiền tố cấp (nếu tên
 * chưa có sẵn) và tên đơn vị cha; cấp khác giữ nguyên tên.
 */
export async function departmentLabels(
  departmentModel: Model<any>,
  ids: IdLike[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean).map((id) => String(id)))];
  if (!unique.length) return new Map();
  const rows = await departmentModel.aggregate<{
    _id: Types.ObjectId;
    name: string;
    level?: { code?: string };
    parent?: { name?: string };
  }>([
    { $match: { _id: { $in: unique.map((id) => new Types.ObjectId(id)) } } },
    {
      $lookup: {
        from: 'departmentlevels',
        localField: 'levelId',
        foreignField: '_id',
        as: 'level',
      },
    },
    {
      $lookup: {
        from: 'departments',
        localField: 'parentId',
        foreignField: '_id',
        as: 'parent',
      },
    },
    {
      $project: {
        name: 1,
        level: { $first: '$level' },
        parent: { $first: '$parent' },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), labelOf(row)]));
}

/**
 * Thay tên đơn vị đã populate ở `departmentId` của từng dòng bằng nhãn đầy đủ.
 * Chỉ sửa bản trả về client - không ai `save()` các dòng danh sách này.
 */
export async function relabelPopulated(
  departmentModel: Model<any>,
  rows: Array<{ departmentId?: unknown }>,
) {
  const populated = rows
    .map((row) => row.departmentId as { _id?: IdLike; name?: string } | null)
    .filter((dept): dept is { _id: IdLike; name?: string } => !!dept?._id);
  const labels = await departmentLabels(
    departmentModel,
    populated.map((dept) => dept._id),
  );
  for (const dept of populated) {
    const label = labels.get(String(dept._id));
    if (label) dept.name = label;
  }
}

function labelOf(row: {
  name: string;
  level?: { code?: string };
  parent?: { name?: string };
}) {
  const name = row.name ?? '';
  const prefix = PREFIX_BY_LEVEL[row.level?.code ?? ''];
  if (!prefix) return name;
  // So cả CHỮ, không so tiền tố: "Tổng hợp" bắt đầu bằng "Tổ" nhưng chưa có "Tổ".
  const firstWord = name.trim().split(/\s+/)[0]?.toLowerCase();
  const own = firstWord === prefix.toLowerCase() ? name : `${prefix} ${name}`;
  return row.parent?.name ? `${own} - ${row.parent.name}` : own;
}
