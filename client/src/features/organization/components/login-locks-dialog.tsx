"use client";

import { useState } from "react";
import { LockOpen, RefreshCw } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchLoginLocks,
  unlockLogin,
  type LoginLock,
} from "@/features/organization/api";
import { getApiErrorMessage } from "@/lib/api-client";

const TYPE_LABEL: Record<LoginLock["type"], string> = {
  USER_IP: "Tài khoản trên một máy",
  USER: "Cả tài khoản",
  IP: "Cả máy / IP",
};

function minutesLeft(iso: string) {
  return Math.max(1, Math.ceil((new Date(iso).getTime() - Date.now()) / 60000));
}

/**
 * Tài khoản / máy đang bị khoá đăng nhập tạm thời (gõ sai quá nhiều lần) -
 * quản trị mở khoá cho người dùng khỏi chờ 15 phút. Khoá nằm trong RAM của
 * server: khởi động lại server cũng mở hết.
 */
export function LoginLocksDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: locks = [], isLoading, mutate } = useSWR(
    open ? "login-locks" : null,
    fetchLoginLocks,
  );
  const [busy, setBusy] = useState<string | null>(null);

  const unlock = async (target: { key?: string; username?: string }, id: string) => {
    setBusy(id);
    try {
      await unlockLogin(target);
      toast.success(target.key || target.username ? "Đã mở khoá." : "Đã mở khoá tất cả.");
      await mutate();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không mở khoá được."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Khoá đăng nhập tạm thời</DialogTitle>
          <DialogDescription>
            Tài khoản hoặc máy gõ sai mật khẩu quá nhiều lần bị khoá 15 phút. Mở
            khoá ở đây để người dùng đăng nhập lại ngay.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void mutate()}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4" />
            Tải lại
          </Button>
          <Button
            size="sm"
            onClick={() => void unlock({}, "__all__")}
            disabled={!locks.length || busy !== null}
          >
            <LockOpen className="h-4 w-4" />
            Mở khoá tất cả
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Loại khoá</TableHead>
                <TableHead>Tài khoản</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">Lần sai</TableHead>
                <TableHead className="text-right">Còn</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Đang tải...
                  </TableCell>
                </TableRow>
              ) : !locks.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    Không có tài khoản hay máy nào đang bị khoá.
                  </TableCell>
                </TableRow>
              ) : (
                locks.map((lock) => (
                  <TableRow key={lock.key}>
                    <TableCell>
                      <Badge variant={lock.type === "IP" ? "destructive" : "outline"}>
                        {TYPE_LABEL[lock.type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{lock.username || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{lock.ip || "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{lock.failures}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {minutesLeft(lock.lockedUntil)} phút
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy !== null}
                        onClick={() =>
                          void unlock(
                            // Khoá theo tài khoản: mở luôn mọi khoá của tài khoản đó.
                            lock.username ? { username: lock.username } : { key: lock.key },
                            lock.key,
                          )
                        }
                      >
                        Mở khoá
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-xs text-muted-foreground">
          Khoá loại &quot;Cả máy / IP&quot; mà nhiều người cùng bị là dấu hiệu
          server đang thấy mọi người dùng chung một IP (IP của máy chủ trung
          gian) - báo cho người phụ trách kỹ thuật.
        </p>
      </DialogContent>
    </Dialog>
  );
}
