"use client";

import { useMemo } from "react";
import { CornerDownRight, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  addHeaderGroupToTree,
  buildHeaderRows,
  flattenHeaderGroups,
  removeHeaderGroupFromTree,
  updateHeaderGroupTree,
} from "@/features/kpi-form-config/form-template-utils";
import {
  localId,
  type FormHeaderGroup,
  type FormTemplateColumn,
} from "@/features/kpi-form-config/types";

type HeaderStructureDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: FormTemplateColumn[];
  headerGroups: FormHeaderGroup[];
  onChange: (groups: FormHeaderGroup[]) => void;
};

/**
 * Cấu trúc header của bảng: cây nhóm gộp ô + hình bảng sau khi gộp.
 *
 * Tách khỏi canvas kéo thả vì hai việc khác nhau - canvas quyết định THỨ TỰ
 * cột, còn ở đây quyết định các cột đó gom vào tiêu đề chung nào. Cột được gán
 * vào nhóm ở bảng thuộc tính của từng trường.
 */
export function HeaderStructureDialog({
  open,
  onOpenChange,
  columns,
  headerGroups,
  onChange,
}: HeaderStructureDialogProps) {
  const flatGroups = useMemo(
    () => flattenHeaderGroups(headerGroups),
    [headerGroups],
  );
  const preview = useMemo(
    () => buildHeaderRows(columns, headerGroups),
    [columns, headerGroups],
  );

  const addGroup = (parentId: string | null) => {
    const node: FormHeaderGroup = {
      id: localId("grp"),
      name: "Nhóm mới",
      children: [],
    };
    onChange(addHeaderGroupToTree(headerGroups, parentId, node));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Cấu trúc trường của bảng</DialogTitle>
          <DialogDescription>
            Tạo nhóm để gộp nhiều cột chung một tiêu đề, lồng được nhiều tầng.
            Gán cột vào nhóm ở bảng thuộc tính của từng trường.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Nhóm header (gộp ô)</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => addGroup(null)}
              >
                <Plus className="size-4" />
                Thêm nhóm
              </Button>
            </div>

            {flatGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có nhóm nào - mọi cột đứng riêng một tầng header.
              </p>
            ) : (
              <div className="space-y-2">
                {flatGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-2"
                    style={{ paddingLeft: group.depth * 24 }}
                  >
                    {group.depth > 0 ? (
                      <CornerDownRight className="size-4 shrink-0 text-muted-foreground" />
                    ) : null}
                    <Input
                      value={group.name}
                      onChange={(e) =>
                        onChange(
                          updateHeaderGroupTree(headerGroups, group.id, {
                            name: e.target.value,
                          }),
                        )
                      }
                      className="h-8 max-w-sm"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => addGroup(group.id)}
                    >
                      <Plus className="size-4" />
                      Nhóm con
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        onChange(removeHeaderGroupFromTree(headerGroups, group.id))
                      }
                      aria-label="Xoá nhóm"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Header sau khi gộp</h3>
            {preview ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    {preview.rows.map((row, rowIdx) => (
                      <tr key={`row-${rowIdx}`}>
                        {row.map((cell) => (
                          <th
                            key={cell.key}
                            colSpan={cell.colSpan}
                            rowSpan={cell.rowSpan}
                            style={{ minWidth: cell.minWidth }}
                            className="border bg-muted/50 px-2 py-1.5 text-center align-middle text-xs font-medium"
                          >
                            {cell.label}
                            {cell.required ? (
                              <span className="text-destructive"> *</span>
                            ) : null}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Chưa có trường nào đang hiển thị.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
