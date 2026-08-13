"use client";

import { FileBadge, Usb } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Chứng thư số của cán bộ, đọc từ USB Token.
 *
 * Mới dựng khung: bảng và hai nút đã đúng vị trí nhưng chưa nối phần đọc token.
 * Đọc được USB Token cần một cầu nối chạy dưới máy trạm (plugin ký số của Ban
 * Cơ yếu) vì trình duyệt không tự truy cập được thiết bị - đó là phần việc
 * riêng, làm sau.
 *
 * Bảng để trống chứ không điền số liệu mẫu: một chứng thư giả nhìn y như thật
 * sẽ khiến người dùng tưởng đã khai báo xong.
 */
const COLUMNS = [
  "Subject",
  "Issuer",
  "Hiệu lực từ",
  "Hiệu lực đến",
  "Serial Number",
  "Version",
  "Loại chứng thư",
] as const;

export function UsbTokenSettings() {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold tracking-tight">
          USB Token
        </h2>
        <p className="text-sm text-muted-foreground">
          Chứng thư số dùng để ký báo cáo KPI.
        </p>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={COLUMNS.length}
                className="h-32 text-center text-muted-foreground"
              >
                <div className="inline-flex flex-col items-center gap-2">
                  <Usb className="size-8 opacity-40" />
                  <span className="text-sm">
                    Chưa khai báo chứng thư số.
                  </span>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Vô hiệu hoá cho tới khi có phần đọc token - để nút bấm được mà
            không làm gì thì người dùng tưởng hỏng. */}
        <Button variant="outline" className="bg-background" disabled>
          <Usb className="size-4" />
          Cập nhật thông tin từ USB Token
        </Button>
        <Button variant="outline" className="bg-background" disabled>
          <FileBadge className="size-4" />
          Cập nhật từ file certificate
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Chức năng đang xây dựng. Đọc USB Token cần cài phần mềm ký số trên máy
        trạm; sẽ mở khi phần đó hoàn thiện.
      </p>
    </div>
  );
}
