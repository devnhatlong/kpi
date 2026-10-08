"use client";

import { useMemo } from "react";
import { Info, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/common/searchable-select";
import type { UserAccount } from "@/features/organization/types";
import {
  TEAM_REPORT_UNIT_ROLE_LABEL,
  type TeamReportUnitRole,
} from "@/features/team-report/types";
import { cn } from "@/lib/utils";

export type RouteUnitDraft = {
  userId: string;
  role: TeamReportUnitRole;
};

const ROLES: TeamReportUnitRole[] = ["LEAD", "COORDINATE", "INFORM"];

const accountId = (account: UserAccount) => account._id ?? account.id;

/**
 * Đơn vị của tài khoản. Danh sách tài khoản trả `departmentId` dạng id (không
 * populate) - tên tra từ danh mục đơn vị. Thiếu TÊN không có nghĩa là chưa gắn
 * đơn vị; chỉ thiếu ID mới là chưa gắn.
 */
const departmentOf = (
  account: UserAccount | undefined,
  names?: Map<string, string>,
) => {
  const raw = account?.departmentId;
  const id =
    raw && typeof raw === "object" ? (raw._id ?? raw.id ?? "") : (raw ?? "");
  const name =
    (raw && typeof raw === "object" ? raw.name : undefined) ??
    names?.get(id) ??
    "";
  return { id, name };
};

/** Câu báo lỗi của bảng, null = hợp lệ. Server kiểm y hệt. */
export function routeUnitsError(
  units: RouteUnitDraft[],
  userById?: Map<string, UserAccount>,
): string | null {
  if (!units.length) return "chưa thêm tài khoản nào";
  const leads = units.filter((unit) => unit.role === "LEAD").length;
  if (leads !== 1) return `phải có đúng một chủ trì (đang có ${leads})`;
  if (userById) {
    const seen = new Set<string>();
    for (const unit of units) {
      const dept = departmentOf(userById.get(unit.userId)).id;
      if (!dept) continue;
      if (seen.has(dept)) {
        return "có hai tài khoản cùng một đơn vị - mỗi đơn vị chỉ chọn một tài khoản";
      }
      seen.add(dept);
    }
  }
  return null;
}

/**
 * Bảng NƠI NHẬN của một luồng: mỗi dòng một tài khoản, chọn đúng một vai.
 * Chọn tài khoản như ở chế độ "Người trình tự chọn"; đơn vị của tài khoản
 * quyết định hộp đến nào nhận bản.
 *
 * Vai bày thành ba cột radio chứ không phải ô tích - một nơi không thể vừa chủ
 * trì vừa phối hợp. Chọn "Chủ trì" ở một dòng thì dòng đang chủ trì trước đó
 * tự lùi về "Phối hợp": mỗi luồng đúng một nơi quyết, để hai nơi rồi bắt quản
 * trị tự gỡ là bắt họ đi tìm lỗi mình vừa gây ra.
 */
export function RouteUnitsEditor({
  units,
  onChange,
  accounts,
  departmentNames,
}: {
  units: RouteUnitDraft[];
  onChange: (next: RouteUnitDraft[]) => void;
  accounts: UserAccount[];
  /** id đơn vị → tên, để bày "tài khoản · đơn vị". */
  departmentNames: Map<string, string>;
}) {
  const userById = useMemo(
    () => new Map(accounts.map((account) => [accountId(account), account])),
    [accounts],
  );

  /* Bỏ tài khoản đã có dòng, và tài khoản CÙNG ĐƠN VỊ với một dòng đã có -
     hộp đến lọc theo đơn vị, hai dòng cùng đơn vị khác vai thì không biết
     đơn vị đó được duyệt hay chỉ được xem. */
  const options = useMemo(() => {
    const takenUsers = new Set(units.map((unit) => unit.userId));
    const takenDepts = new Set(
      units
        .map((unit) => departmentOf(userById.get(unit.userId)).id)
        .filter(Boolean),
    );
    return accounts
      .filter((account) => {
        const dept = departmentOf(account);
        return (
          account.isActive &&
          !!dept.id &&
          !takenUsers.has(accountId(account)) &&
          !takenDepts.has(dept.id)
        );
      })
      .map((account) => {
        const dept = departmentOf(account, departmentNames);
        return {
          value: accountId(account),
          label: `${account.fullName?.trim() || account.username} · ${account.username}${dept.name ? ` · ${dept.name}` : ""}`,
        };
      });
  }, [accounts, units, userById, departmentNames]);

  const setRole = (index: number, role: TeamReportUnitRole) =>
    onChange(
      units.map((unit, i) => {
        if (i === index) return { ...unit, role };
        // Chỉ một chủ trì: dòng đang chủ trì lùi về phối hợp.
        if (role === "LEAD" && unit.role === "LEAD") {
          return { ...unit, role: "COORDINATE" };
        }
        return unit;
      }),
    );

  const error = routeUnitsError(units, userById);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Tài khoản
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="w-28 px-2 py-2 text-center font-medium"
                >
                  {TEAM_REPORT_UNIT_ROLE_LABEL[role]}
                </th>
              ))}
              <th scope="col" className="w-10">
                <span className="sr-only">Bỏ</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {units.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  Chưa có tài khoản nào - thêm ở ô bên dưới.
                </td>
              </tr>
            ) : null}
            {units.map((unit, index) => {
              const account = userById.get(unit.userId);
              const name = account
                ? account.fullName?.trim() || account.username
                : "(tài khoản đã xoá)";
              const dept = departmentOf(account, departmentNames);
              return (
                <tr key={unit.userId}>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        (!account || !account.isActive) && "text-destructive",
                      )}
                    >
                      {name}
                    </span>
                    {account && !account.isActive ? (
                      <span className="ml-1.5 text-xs text-destructive">
                        (đã khoá)
                      </span>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      {account?.username}
                      {dept.name
                        ? ` · ${dept.name}`
                        : dept.id
                          ? ""
                          : " · chưa gắn đơn vị"}
                    </span>
                  </td>
                  {ROLES.map((role) => (
                    <td key={role} className="px-2 py-2 text-center">
                      <input
                        type="radio"
                        name={`unit-role-${unit.userId}`}
                        aria-label={`${name} - ${TEAM_REPORT_UNIT_ROLE_LABEL[role]}`}
                        className="size-4 cursor-pointer accent-primary"
                        checked={unit.role === role}
                        onChange={() => setRole(index, role)}
                      />
                    </td>
                  ))}
                  <td className="pr-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Bỏ ${name}`}
                      onClick={() =>
                        onChange(units.filter((_, i) => i !== index))
                      }
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <SearchableSelect
        value=""
        onValueChange={(userId) => {
          if (!userId) return;
          // Dòng đầu tiên mặc định chủ trì, các dòng sau mặc định phối hợp.
          const hasLead = units.some((unit) => unit.role === "LEAD");
          onChange([
            ...units,
            { userId, role: hasLead ? "COORDINATE" : "LEAD" },
          ]);
        }}
        options={options}
        placeholder="Thêm tài khoản…"
        searchPlaceholder="Tìm theo tên, tài khoản, đơn vị…"
        triggerClassName="bg-background"
      />

      {error ? (
        <p className="text-xs text-destructive">Bảng nơi nhận {error}.</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">Chủ trì</strong>: chấm
          lại, duyệt, trả lại.{" "}
          <strong className="font-medium text-foreground">Phối hợp</strong>: xem
          và gửi ý kiến cho chủ trì.{" "}
          <strong className="font-medium text-foreground">Nhận để biết</strong>:
          chỉ xem. Ai cùng đơn vị với tài khoản đã chọn cũng mở được bản trong
          hộp đến.
        </p>
      )}

      {/* Luật khớp luồng phía server: nơi nhận không đi theo chính luồng của
          mình - nói rõ ngay tại bảng để quản trị biết phải tạo luồng riêng. */}
      {units.length ? (
        <p className="flex items-start gap-1.5 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Các tài khoản trong bảng này (và người cùng đơn vị với họ){" "}
            <strong className="font-medium text-foreground">
              không đi theo luồng này
            </strong>{" "}
            khi chính họ trình, kể cả khi thuộc vế &quot;Ai gửi&quot;. Tạo một
            luồng riêng cho họ - VD &quot;Đội TMTH → Đội CNTT chủ trì&quot;;
            không có luồng nào khớp thì bản về cấp trên trực tiếp có quyền
            duyệt.
          </span>
        </p>
      ) : null}
    </div>
  );
}
