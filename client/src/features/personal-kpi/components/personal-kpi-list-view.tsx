"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus, Send, Trash2 } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  activeBadgeClass,
  inactiveBadgeClass,
} from "@/features/organization/badge-styles";
import { PersonalTaskDrawer } from "@/features/personal-kpi/components/personal-task-drawer";
import {
  PERSONAL_KPI_STATUS_LABEL,
  canDeletePersonalKpi,
  canEditPersonalKpi,
  canSendPersonalKpi,
  type PersonalKpiItem,
  type PersonalKpiStatus,
} from "@/features/personal-kpi/types";

const STATUS_TABS: Array<PersonalKpiStatus | "ALL"> = [
  "ALL",
  "DRAFT",
  "SENT",
  "REJECTED",
  "COMPLETED",
];

function statusBadgeClass(status: PersonalKpiStatus) {
  if (status === "SENT") return activeBadgeClass;
  if (status === "COMPLETED") {
    return "border-emerald-500/40 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "REJECTED") {
    return "border-amber-500/40 text-amber-600 dark:text-amber-400";
  }
  return inactiveBadgeClass;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN");
}

export function PersonalKpiListView() {
  const [items, setItems] = useState<PersonalKpiItem[]>([]);
  const [statusTab, setStatusTab] = useState<PersonalKpiStatus | "ALL">("ALL");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [edit, setEdit] = useState<PersonalKpiItem | null>(null);
  const [deleting, setDeleting] = useState<PersonalKpiItem | null>(null);

  const filtered = useMemo(() => {
    const list =
      statusTab === "ALL"
        ? items
        : items.filter((item) => item.status === statusTab);
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [items, statusTab]);

  const counts = useMemo(() => {
    return {
      ALL: items.length,
      DRAFT: items.filter((item) => item.status === "DRAFT").length,
      SENT: items.filter((item) => item.status === "SENT").length,
      REJECTED: items.filter((item) => item.status === "REJECTED").length,
      COMPLETED: items.filter((item) => item.status === "COMPLETED").length,
    };
  }, [items]);

  const openCreate = () => {
    setEdit(null);
    setDrawerOpen(true);
  };

  const openEdit = (item: PersonalKpiItem) => {
    if (!canEditPersonalKpi(item.status)) {
      toast.error(
        item.status === "SENT"
          ? "Đã gửi — không sửa trực tiếp. Chờ từ chối nếu cần chỉnh lại."
          : "Nhiệm vụ đã hoàn thành — không sửa được.",
      );
      return;
    }
    setEdit(item);
    setDrawerOpen(true);
  };

  const handleSaveFromDrawer = (saved: PersonalKpiItem[]) => {
    setItems((prev) => {
      let next = [...prev];
      for (const item of saved) {
        const index = next.findIndex((row) => row.id === item.id);
        if (index >= 0) next[index] = item;
        else next = [item, ...next];
      }
      return next;
    });
  };

  const submitItem = (item: PersonalKpiItem) => {
    if (!canSendPersonalKpi(item.status)) {
      toast.error("Chỉ gửi được khi đang Nháp hoặc Từ chối.");
      return;
    }
    if (!item.task.title.trim()) {
      toast.error("Nhiệm vụ nháp chưa có tên — hãy sửa trước khi gửi.");
      return;
    }
    setItems((prev) =>
      prev.map((row) =>
        row.id === item.id
          ? {
              ...row,
              status: "SENT",
              updatedAt: new Date().toISOString(),
              rejectReason: undefined,
            }
          : row,
      ),
    );
    toast.success("Đã gửi nhiệm vụ.");
  };

  const confirmDelete = () => {
    if (!deleting) return;
    if (!canDeletePersonalKpi(deleting.status)) {
      toast.error("Không xoá nhiệm vụ đã gửi hoặc đã hoàn thành.");
      setDeleting(null);
      return;
    }
    setItems((prev) => prev.filter((row) => row.id !== deleting.id));
    toast.success("Đã xoá nhiệm vụ.");
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            KPI cá nhân
          </h1>
          <p className="text-sm text-muted-foreground">
            Tạo nháp trước, chỉnh xong rồi mới gửi. Theo dõi theo trạng thái Nháp
            / Đã gửi / Từ chối / Hoàn thành.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Tạo nháp
        </Button>
      </div>

      <Tabs
        value={statusTab}
        onValueChange={(value) =>
          setStatusTab(value as PersonalKpiStatus | "ALL")
        }
      >
        <TabsList>
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab} value={tab}>
              {tab === "ALL" ? "Tất cả" : PERSONAL_KPI_STATUS_LABEL[tab]} (
              {counts[tab]})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">STT</TableHead>
                  <TableHead>Nhiệm vụ</TableHead>
                  <TableHead className="w-[180px]">Trục</TableHead>
                  <TableHead className="w-[220px]">Nội dung CV</TableHead>
                  <TableHead className="w-[100px]">Điểm chuẩn</TableHead>
                  <TableHead className="w-[110px]">Trạng thái</TableHead>
                  <TableHead className="w-[160px]">Cập nhật</TableHead>
                  <TableHead className="w-[130px] text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-28 text-center text-muted-foreground"
                    >
                      <div className="inline-flex flex-col items-center gap-2">
                        <ClipboardList className="h-8 w-8 opacity-40" />
                        <span>Chưa có nhiệm vụ nào. Bấm &quot;Tạo nháp&quot; để bắt đầu.</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{item.task.title}</div>
                        {item.rejectReason ? (
                          <div className="text-xs text-amber-600 dark:text-amber-400">
                            Lý do từ chối: {item.rejectReason}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.axisName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <div>{item.workContentName}</div>
                        <div className="font-mono text-xs">
                          {item.workContentCode}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {item.task.standardScore || "-"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusBadgeClass(item.status)}
                        >
                          {PERSONAL_KPI_STATUS_LABEL[item.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatUpdatedAt(item.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => openEdit(item)}
                            aria-label="Sửa"
                            disabled={!canEditPersonalKpi(item.status)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {canSendPersonalKpi(item.status) ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => submitItem(item)}
                              aria-label="Gửi"
                              title="Gửi"
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          ) : null}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setDeleting(item)}
                            aria-label="Xoá"
                            disabled={!canDeletePersonalKpi(item.status)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <PersonalTaskDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        edit={edit}
        onSave={handleSaveFromDrawer}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá nhiệm vụ nháp?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn sắp xoá{" "}
              <span className="font-medium text-foreground">
                {deleting?.task.title}
              </span>
              . Thao tác này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Xoá</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
