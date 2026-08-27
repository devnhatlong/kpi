import type { TemplateColumn, TemplateHeaderGroup } from "./types";

export type HeaderPreviewCell = {
  key: string;
  label: string;
  colSpan: number;
  rowSpan: number;
  minWidth?: number;
};

function resolvePathLabels(
  groups: TemplateHeaderGroup[],
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

function pathPrefixEqual(
  left: string[],
  right: string[],
  level: number,
): boolean {
  for (let index = 0; index <= level; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function buildHeaderPreviewRows(
  columns: TemplateColumn[],
  groups: TemplateHeaderGroup[],
): { rows: HeaderPreviewCell[][]; widths: number[] } | null {
  const visible = columns.filter((item) => item.visible);
  if (!visible.length) return null;

  const enriched = visible.map((item) => ({
    id: item.id,
    title: item.title.trim() || "(Chưa đặt nhãn)",
    width: item.width,
    pathLabels: resolvePathLabels(groups, item.headerPath),
  }));
  const maxDepth = Math.max(
    0,
    ...enriched.map((item) => item.pathLabels.length),
  );
  const totalRows = maxDepth + 1;
  const occupied = Array.from({ length: totalRows }, () =>
    Array.from({ length: enriched.length }, () => false),
  );
  const rows: HeaderPreviewCell[][] = Array.from(
    { length: totalRows },
    () => [],
  );

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
    });
    occupied[leafLevel]![index] = true;
  }

  return {
    rows,
    widths: enriched.map((item) => item.width),
  };
}
