import type {
  FormColumnSemantic,
  FormHeaderGroup,
  FormTemplate,
  FormTemplateColumn,
} from "./types";

export type HeaderCell = {
  key: string;
  label: string;
  colSpan: number;
  rowSpan: number;
  minWidth?: number;
  /** Cột bắt buộc nhập - header gắn dấu * để người nhập biết trước. */
  required?: boolean;
};

export type ResolvedTemplate = {
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  code: string;
  name: string;
};

/**
 * Mẫu đang áp dụng cho trục.
 * Trục chưa gán mẫu trả về null - KHÔNG rơi về bảng mặc định, để không nhầm
 * trục đã cấu hình với trục chưa cấu hình.
 */
export function resolveTemplate(
  template: FormTemplate | null | undefined,
): ResolvedTemplate | null {
  if (!template?.columns?.length) return null;
  return {
    columns: template.columns,
    headerGroups: template.headerGroups ?? [],
    code: template.code,
    name: template.name,
  };
}

export function visibleColumns(
  columns: FormTemplateColumn[],
): FormTemplateColumn[] {
  return columns.filter((item) => item.visible);
}

export function findSemanticColumn(
  columns: FormTemplateColumn[],
  semantic: FormColumnSemantic,
): FormTemplateColumn | undefined {
  return columns.find((item) => item.semanticKey === semantic);
}

export function hasSemantic(
  columns: FormTemplateColumn[],
  semantic: FormColumnSemantic,
): boolean {
  return columns.some((item) => item.visible && item.semanticKey === semantic);
}

function resolvePathLabels(
  groups: FormHeaderGroup[],
  path: string[],
): string[] {
  const names: string[] = [];
  let current = groups;
  for (const id of path) {
    const node = current.find((group) => group.id === id);
    if (!node) break;
    names.push(node.name);
    current = node.children;
  }
  return names;
}

function pathPrefixEqual(left: string[], right: string[], level: number) {
  for (let index = 0; index <= level; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/**
 * Dựng các dòng header có gộp ô (colSpan/rowSpan) từ cột + cây nhóm header.
 * Cột cùng một nhóm phải đứng liền nhau; nếu tách rời thì nhóm sẽ hiện thành
 * nhiều cụm - đúng như thứ tự cột đang cấu hình.
 */
export function buildHeaderRows(
  columns: FormTemplateColumn[],
  groups: FormHeaderGroup[],
): { rows: HeaderCell[][]; widths: number[] } | null {
  const visible = visibleColumns(columns);
  if (!visible.length) return null;

  const enriched = visible.map((item) => ({
    id: item.id,
    title: item.title.trim() || "(Chưa đặt nhãn)",
    width: item.width,
    required: item.required,
    pathLabels: resolvePathLabels(groups, item.headerPath ?? []),
  }));

  const maxDepth = Math.max(0, ...enriched.map((item) => item.pathLabels.length));
  const totalRows = maxDepth + 1;
  const occupied = Array.from({ length: totalRows }, () =>
    Array.from({ length: enriched.length }, () => false),
  );
  const rows: HeaderCell[][] = Array.from({ length: totalRows }, () => []);

  for (let level = 0; level < maxDepth; level += 1) {
    let index = 0;
    while (index < enriched.length) {
      if (occupied[level]![index]) {
        index += 1;
        continue;
      }

      const column = enriched[index]!;
      if (column.pathLabels.length <= level) {
        const rowSpan = totalRows - level;
        rows[level]!.push({
          key: `title-${column.id}-${level}`,
          label: column.title,
          colSpan: 1,
          rowSpan,
          minWidth: column.width,
          required: column.required,
        });
        for (let row = level; row < totalRows; row += 1) {
          occupied[row]![index] = true;
        }
        index += 1;
        continue;
      }

      let end = index + 1;
      while (
        end < enriched.length &&
        !occupied[level]![end] &&
        enriched[end]!.pathLabels.length > level &&
        pathPrefixEqual(column.pathLabels, enriched[end]!.pathLabels, level)
      ) {
        end += 1;
      }

      const run = enriched.slice(index, end);
      rows[level]!.push({
        key: `group-${level}-${index}-${column.pathLabels[level]}`,
        label: column.pathLabels[level]!,
        colSpan: run.length,
        rowSpan: 1,
        minWidth: run.reduce((sum, item) => sum + item.width, 0),
      });
      for (let cursor = index; cursor < end; cursor += 1) {
        occupied[level]![cursor] = true;
      }
      index = end;
    }
  }

  const leafLevel = maxDepth;
  for (let index = 0; index < enriched.length; index += 1) {
    if (occupied[leafLevel]![index]) continue;
    const column = enriched[index]!;
    rows[leafLevel]!.push({
      key: `leaf-${column.id}`,
      label: column.title,
      colSpan: 1,
      rowSpan: 1,
      minWidth: column.width,
      required: column.required,
    });
    occupied[leafLevel]![index] = true;
  }

  return { rows, widths: enriched.map((item) => item.width) };
}

export type FlatHeaderGroup = {
  id: string;
  name: string;
  depth: number;
  path: string[];
};

/** Duyệt cây nhóm header thành danh sách phẳng để chọn trong dropdown. */
export function flattenHeaderGroups(
  groups: FormHeaderGroup[],
  parentPath: string[] = [],
  depth = 0,
): FlatHeaderGroup[] {
  const result: FlatHeaderGroup[] = [];
  for (const group of groups) {
    const path = [...parentPath, group.id];
    result.push({ id: group.id, name: group.name, depth, path });
    result.push(...flattenHeaderGroups(group.children ?? [], path, depth + 1));
  }
  return result;
}

export function updateHeaderGroupTree(
  groups: FormHeaderGroup[],
  id: string,
  patch: Partial<Pick<FormHeaderGroup, "name">>,
): FormHeaderGroup[] {
  return groups.map((group) =>
    group.id === id
      ? { ...group, ...patch }
      : { ...group, children: updateHeaderGroupTree(group.children ?? [], id, patch) },
  );
}

export function removeHeaderGroupFromTree(
  groups: FormHeaderGroup[],
  id: string,
): FormHeaderGroup[] {
  return groups
    .filter((group) => group.id !== id)
    .map((group) => ({
      ...group,
      children: removeHeaderGroupFromTree(group.children ?? [], id),
    }));
}

export function addHeaderGroupToTree(
  groups: FormHeaderGroup[],
  parentId: string | null,
  node: FormHeaderGroup,
): FormHeaderGroup[] {
  if (!parentId) return [...groups, node];
  return groups.map((group) =>
    group.id === parentId
      ? { ...group, children: [...(group.children ?? []), node] }
      : {
          ...group,
          children: addHeaderGroupToTree(group.children ?? [], parentId, node),
        },
  );
}

/** Id của mọi nhóm còn tồn tại - dùng để dọn headerPath treo sau khi xoá nhóm. */
export function collectGroupIds(groups: FormHeaderGroup[]): Set<string> {
  const ids = new Set<string>();
  for (const group of flattenHeaderGroups(groups)) ids.add(group.id);
  return ids;
}

export function pruneColumnHeaderPaths(
  columns: FormTemplateColumn[],
  groups: FormHeaderGroup[],
): FormTemplateColumn[] {
  const valid = collectGroupIds(groups);
  return columns.map((column) => {
    const path = column.headerPath ?? [];
    const kept: string[] = [];
    for (const id of path) {
      if (!valid.has(id)) break;
      kept.push(id);
    }
    return kept.length === path.length ? column : { ...column, headerPath: kept };
  });
}
