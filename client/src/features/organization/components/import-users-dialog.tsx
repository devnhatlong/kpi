"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { importUsers } from "@/features/organization/api";
import {
  downloadUsersImportTemplate,
  parseUsersExcel,
} from "@/features/organization/excel";
import type {
  ImportUserRow,
  ImportUsersResult,
} from "@/features/organization/types";
import { getApiErrorMessage } from "@/lib/api-client";

type ImportUsersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export function ImportUsersDialog({
  open,
  onOpenChange,
  onSuccess,
}: ImportUsersDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportUserRow[]>([]);
  const [result, setResult] = useState<ImportUsersResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setRows([]);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    setParsing(true);
    setResult(null);
    try {
      const parsed = await parseUsersExcel(file);
      setRows(parsed);
      toast.success(`Đã đọc ${parsed.length} dòng từ file.`);
    } catch (error) {
      setRows([]);
      toast.error(getApiErrorMessage(error, "Không đọc được file Excel."));
    } finally {
      setParsing(false);
    }
  };

  const runImport = async () => {
    if (!rows.length) return;
    setImporting(true);
    try {
      const data = await importUsers(rows);
      setResult(data);
      toast.success(
        data.summary.created > 0
          ? "Import hoàn tất."
          : "Không có người dùng mới.",
      );
      if (data.summary.created > 0) onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Import thất bại."));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import người dùng từ Excel</DialogTitle>
          <DialogDescription>
            Cột bắt buộc: <code>username</code>. Tuỳ chọn: <code>fullName</code>
            , <code>email</code>, <code>phone</code>, <code>position</code>,{" "}
            <code>departmentCode</code>, <code>roleCodes</code> (cách nhau bởi
            dấu phẩy), <code>isActive</code>.
            <br />
            <code>departmentCode</code> điền mã{" "}
            <strong>đơn vị trực tiếp</strong>: ai thuộc đội thì điền mã đội,
            phòng cấp trên hệ thống tự suy ra theo cây đơn vị.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadUsersImportTemplate()}
          >
            <Download />
            Tải mẫu Excel
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={parsing}
            onClick={() => inputRef.current?.click()}
          >
            <Upload />
            {parsing ? "Đang đọc..." : "Chọn file .xlsx"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </div>

        {rows.length > 0 && (
          <ScrollArea className="h-56 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Chức vụ</TableHead>
                  <TableHead>Đơn vị</TableHead>
                  <TableHead>Vai trò</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 50).map((row, i) => (
                  <TableRow key={`${row.username}-${i}`}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-medium">
                      {row.username}
                    </TableCell>
                    <TableCell>{row.fullName || "-"}</TableCell>
                    <TableCell>{row.position || "-"}</TableCell>
                    <TableCell>{row.departmentCode || "-"}</TableCell>
                    <TableCell>{row.roleCodes || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 50 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Hiển thị 50/{rows.length} dòng xem trước.
              </p>
            )}
          </ScrollArea>
        )}

        {result && (
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge>Tạo mới: {result.summary.created}</Badge>
              <Badge variant="secondary">
                Bỏ qua: {result.summary.skipped}
              </Badge>
              <Badge variant="destructive">Lỗi: {result.summary.errors}</Badge>
            </div>
            {result.results.filter((r) => r.status === "error").length > 0 && (
              <ScrollArea className="h-28">
                <ul className="space-y-1 text-xs text-destructive">
                  {result.results
                    .filter((r) => r.status === "error")
                    .map((r) => (
                      <li key={`${r.row}-${r.code}`}>
                        Dòng {r.row} ({r.code}): {r.message}
                      </li>
                    ))}
                </ul>
              </ScrollArea>
            )}
          </div>
        )}

        {!rows.length && !result && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-muted-foreground">
            <FileSpreadsheet className="h-8 w-8 opacity-50" />
            <p className="text-sm">Chọn file Excel để xem trước và import.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button onClick={runImport} disabled={!rows.length || importing}>
            {importing
              ? "Đang import..."
              : `Import ${rows.length || ""} người dùng`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
