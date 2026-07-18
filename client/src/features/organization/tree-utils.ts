import type { Department } from "@/features/organization/types";
import { entityId, parentOf } from "@/features/organization/types";

export type UnitTreeNode = {
  id: string;
  department: Department;
  children: UnitTreeNode[];
};

export function buildUnitTree(departments: Department[]): UnitTreeNode[] {
  const map = new Map<string, UnitTreeNode>();
  for (const dept of departments) {
    const id = entityId(dept);
    map.set(id, { id, department: dept, children: [] });
  }

  const roots: UnitTreeNode[] = [];
  for (const node of map.values()) {
    const parentRef = parentOf(node.department);
    const parentId =
      parentRef?.id ??
      parentRef?._id ??
      (typeof node.department.parentId === "string"
        ? node.department.parentId
        : "");

    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: UnitTreeNode[]) => {
    nodes.sort(
      (a, b) =>
        a.department.sortOrder - b.department.sortOrder ||
        a.department.name.localeCompare(b.department.name, "vi"),
    );
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

export function filterTree(nodes: UnitTreeNode[], query: string): UnitTreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return nodes;

  const walk = (list: UnitTreeNode[]): UnitTreeNode[] =>
    list
      .map((node) => {
        const children = walk(node.children);
        const match =
          node.department.name.toLowerCase().includes(q) ||
          node.department.code.toLowerCase().includes(q);
        if (match || children.length) {
          return { ...node, children };
        }
        return null;
      })
      .filter(Boolean) as UnitTreeNode[];

  return walk(nodes);
}

export function collectIds(nodes: UnitTreeNode[]): string[] {
  const ids: string[] = [];
  const walk = (list: UnitTreeNode[]) => {
    for (const n of list) {
      ids.push(n.id);
      walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

export function breadcrumbPath(departments: Department[], selectedId: string): string {
  const byId = new Map(departments.map((d) => [entityId(d), d]));
  const chain: string[] = [];
  let cur = byId.get(selectedId);
  while (cur) {
    chain.unshift(cur.name);
    const parent = parentOf(cur);
    const parentId =
      parent?.id ??
      parent?._id ??
      (typeof cur.parentId === "string" ? cur.parentId : "");
    cur = parentId ? byId.get(parentId) : undefined;
  }
  return chain.join(" › ");
}
