/**
 * Gộp ba bản của một danh sách dòng khi lưu bị 409 (người khác dùng chung tài
 * khoản vừa lưu trước):
 *
 * - `base`   bản đã đọc về lúc tôi bắt đầu sửa;
 * - `mine`   bản đang trên màn của tôi;
 * - `theirs` bản người kia vừa lưu (đọc lại từ server).
 *
 * Luật theo từng dòng: chỉ một bên sửa thì lấy bên đó; cả hai cùng sửa (và
 * ra khác nhau) thì giữ của tôi và đếm vào `conflicts` để báo người dùng xem
 * lại. Dòng chưa có khoá (vừa thêm trên màn, chưa lưu) luôn là của tôi.
 *
 * Thứ tự: theo bản người kia, dòng tôi mới thêm nối vào sau.
 */
export function mergeRows<T>(
  base: T[],
  mine: T[],
  theirs: T[],
  key: (row: T) => string | null | undefined,
  same: (a: T, b: T) => boolean,
): { rows: T[]; conflicts: number } {
  const index = (rows: T[]) => {
    const map = new Map<string, T>();
    for (const row of rows) {
      const id = key(row);
      if (id) map.set(id, row);
    }
    return map;
  };
  const baseBy = index(base);
  const mineBy = index(mine);
  const theirsBy = index(theirs);
  let conflicts = 0;

  /** Một dòng có khoá: trả dòng giữ lại, hoặc null = dòng đã bị xoá. */
  const pick = (id: string): T | null => {
    const b = baseBy.get(id);
    const m = mineBy.get(id);
    const t = theirsBy.get(id);
    if (m && t) {
      if (b && same(m, b)) return t; // chỉ người kia sửa
      if (b && same(t, b)) return m; // chỉ tôi sửa
      if (same(m, t)) return m;
      conflicts += 1;
      return m;
    }
    if (m) {
      // Người kia đã xoá dòng này.
      if (!b) return m; // tôi mới thêm
      if (same(m, b)) return null;
      conflicts += 1;
      return m;
    }
    if (t) {
      // Tôi đã xoá dòng này (hoặc người kia mới thêm).
      if (!b) return t;
      if (same(t, b)) return null;
      conflicts += 1;
      return t;
    }
    return null;
  };

  const rows: T[] = [];
  const done = new Set<string>();
  for (const row of theirs) {
    const id = key(row);
    if (!id) continue;
    done.add(id);
    const kept = pick(id);
    if (kept) rows.push(kept);
  }
  for (const row of mine) {
    const id = key(row);
    if (!id) {
      rows.push(row);
      continue;
    }
    if (done.has(id)) continue;
    done.add(id);
    const kept = pick(id);
    if (kept) rows.push(kept);
  }
  return { rows, conflicts };
}

/** So hai dòng theo đúng các trường người dùng nhập. */
export function sameFields<T>(fields: (row: T) => unknown) {
  return (a: T, b: T) =>
    JSON.stringify(fields(a)) === JSON.stringify(fields(b));
}

/** Lỗi 409 = bản trên server đã đổi kể từ lúc đọc về. */
export function isConflict(error: unknown) {
  return (
    (error as { response?: { status?: number } })?.response?.status === 409
  );
}
