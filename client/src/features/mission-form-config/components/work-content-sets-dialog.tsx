"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
  createWorkContentSet,
  deleteWorkContentSet,
  fetchWorkContentSetsAll,
  updateWorkContentSet,
  workContentSetKeys,
} from "@/features/mission-form-config/api";
import type { WorkContentSet } from "@/features/mission-form-config/types";
import { entityId } from "@/features/mission-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";

type WorkContentSetsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gọi sau mỗi lần thêm / sửa / xoá để trang ngoài tải lại cột "Phụ lục". */
  onChanged: () => void;
};

/**
 * Danh mục bộ nội dung (phụ lục). Chỉ vài dòng nên sửa ngay tại chỗ, không mở
 * thêm hộp thoại con.
 */
export function WorkContentSetsDialog({
  open,
  onOpenChange,
  onChanged,
}: WorkContentSetsDialogProps) {
  const { data: sets = [], mutate } = useSWR(
    open ? workContentSetKeys.list({ all: true }) : null,
    fetchWorkContentSetsAll,
  );
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<WorkContentSet | null>(null);

  const refresh = async () => {
    await mutate();
    onChanged();
  };

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await createWorkContentSet({
        name: newName.trim(),
        sortOrder: sets.length + 1,
      });
      setNewName("");
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không thêm được bộ nội dung."));
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (item: WorkContentSet) => {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await updateWorkContentSet(entityId(item), { name: editName.trim() });
      setEditingId(null);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được bộ nội dung."));
    } finally {
      setBusy(false);
    }
  };

  const confirmRemove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await deleteWorkContentSet(entityId(deleting));
      setDeleting(null);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không xoá được bộ nội dung."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bộ nội dung (phụ lục)</DialogTitle>
          <DialogDescription>
            Mỗi bộ là danh sách nội dung công việc của một phụ lục. Mẫu báo cáo
            chọn bộ nào thì đơn vị dùng mẫu đó chỉ thấy nội dung của bộ đó.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y rounded-md border">
          {sets.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              Chưa có bộ nào.
            </p>
          ) : (
            sets.map((item) => {
              const id = entityId(item);
              const editing = editingId === id;
              return (
                <div key={id} className="flex items-center gap-2 px-3 py-2">
                  <Badge variant="outline" className="shrink-0 font-mono">
                    {item.code}
                  </Badge>
                  {editing ? (
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void saveEdit(item);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="h-8"
                      autoFocus
                    />
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {item.name}
                    </span>
                  )}
                  <div className="ml-auto inline-flex shrink-0 gap-1">
                    {editing ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => saveEdit(item)}
                          aria-label="Lưu"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          aria-label="Huỷ"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setEditingId(id);
                            setEditName(item.name);
                          }}
                          aria-label="Đổi tên"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setDeleting(item)}
                          aria-label="Xoá"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
            placeholder="VD: Phụ lục 2 - Khối An ninh"
          />
          <Button onClick={add} disabled={busy || !newName.trim()}>
            <Plus className="h-4 w-4" />
            Thêm
          </Button>
        </div>
      </DialogContent>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(next) => !next && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá bộ nội dung?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá{" "}
              <span className="font-medium text-foreground">
                {deleting?.code} - {deleting?.name}
              </span>
              . Các nội dung đang gắn bộ này chỉ được gỡ khỏi bộ, không bị xoá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemove} disabled={busy}>
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
