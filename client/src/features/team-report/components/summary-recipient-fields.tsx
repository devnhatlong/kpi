"use client";

import { Check, TriangleAlert } from "lucide-react";

import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/common/searchable-select";
import {
  TEAM_REPORT_UNIT_ROLE_LABEL,
  recipientLabel,
  type TeamReportRecipient,
  type TeamReportRouteUnitView,
  type TeamReportUnitRole,
} from "@/features/team-report/types";
import { cn } from "@/lib/utils";

type SummaryRecipientFieldsProps = {
  /** Tiền tố id để `<Label htmlFor>` và thông báo lỗi trỏ đúng ô. */
  idPrefix: string;
  recipients: TeamReportRecipient[];
  /** Bảng đơn vị cố định của luồng; null = người trình tự chọn một người. */
  units: TeamReportRouteUnitView[] | null;
  recipientId: string;
  onRecipientChange: (id: string) => void;
  /** Câu báo khi chưa chọn nơi nhận; rỗng = không lỗi. */
  error?: string;
};

const ROLES: TeamReportUnitRole[] = ["LEAD", "COORDINATE", "INFORM"];

/** Bảng có tài khoản đã khoá / mất đơn vị - server sẽ từ chối trình. */
export function hasInactiveUnit(units: TeamReportRouteUnitView[] | null) {
  return !!units?.some((unit) => !unit.isActive);
}

/**
 * Ô "Trình lên" của báo cáo tổng hợp.
 *
 * - Luồng có BẢNG ĐƠN VỊ: bày bảng chỉ đọc - đơn vị nào giữ vai gì do quản trị
 *   đặt, người trình không đổi được.
 * - Luồng còn lại: chọn một người cấp trên như cũ.
 */
export function SummaryRecipientFields({
  idPrefix,
  recipients,
  units,
  recipientId,
  onRecipientChange,
  error,
}: SummaryRecipientFieldsProps) {
  if (units) return <RouteUnitsReadonly units={units} />;

  const errorId = `${idPrefix}-recipient-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-recipient`}>
        Trình lên <span className="text-destructive">*</span>
      </Label>
      <SearchableSelect
        id={`${idPrefix}-recipient`}
        value={recipientId}
        onValueChange={onRecipientChange}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        options={recipients.map((person) => ({
          value: person.id,
          label: recipientLabel(person),
        }))}
        placeholder={
          recipients.length
            ? "Chọn cấp trên…"
            : "Chưa tìm được cấp trên nào có quyền duyệt"
        }
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Dòng phụ dưới tên tài khoản: đơn vị và đơn vị cha. Tài khoản đội thường mang
 * luôn tên đơn vị - khi đó bỏ tên đơn vị đi, chỉ giữ đơn vị cha, không thì một
 * cái tên đọc hai lần liền nhau.
 */
function unitSubtitle(unit: TeamReportRouteUnitView) {
  const own =
    unit.departmentName && unit.departmentName !== unit.fullName
      ? unit.departmentName
      : "";
  return [own, unit.parentDepartmentName].filter(Boolean).join(" · ");
}

/**
 * Bảng "Trình lên" chỉ đọc: mỗi dòng một đơn vị, ba cột vai với dấu tick đã
 * khoá. Bày ĐỦ cả ba cột chứ không chỉ ghi tên vai, để người trình nhìn ra
 * ngay đơn vị nào được quyết, đơn vị nào chỉ góp ý hay chỉ biết.
 */
function RouteUnitsReadonly({ units }: { units: TeamReportRouteUnitView[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Trình lên</p>
      {/* `table-fixed` + ba cột vai cố định hẹp: cột tên lấy hết phần còn lại.
          Để trình duyệt tự chia thì ba cột vai ăn đều chiều ngang và tên bị
          ép còn một chữ mỗi dòng. */}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Tài khoản
              </th>
              {ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className="w-[4.5rem] px-1 py-2 text-center font-medium leading-tight sm:w-24"
                >
                  {TEAM_REPORT_UNIT_ROLE_LABEL[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {units.map((unit) => (
              <tr key={unit.userId}>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "break-words font-medium",
                      !unit.isActive && "text-destructive",
                    )}
                  >
                    {unit.fullName}
                  </span>
                  {!unit.isActive ? (
                    <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-destructive">
                      <TriangleAlert className="size-3" aria-hidden="true" />
                      đã khoá / không còn đơn vị
                    </span>
                  ) : null}
                  {unitSubtitle(unit) ? (
                    <span className="block break-words text-xs text-muted-foreground">
                      {unitSubtitle(unit)}
                    </span>
                  ) : null}
                </td>
                {ROLES.map((role) => (
                  <td key={role} className="px-1 py-2.5 text-center">
                    <span
                      role="img"
                      aria-label={
                        unit.role === role
                          ? TEAM_REPORT_UNIT_ROLE_LABEL[role]
                          : "Không"
                      }
                      className={cn(
                        "inline-flex size-4 items-center justify-center rounded-[4px] border",
                        unit.role === role
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background",
                      )}
                    >
                      {unit.role === role ? (
                        <Check className="size-3" aria-hidden="true" />
                      ) : null}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Do quản trị đặt trong luồng trình - không đổi được ở đây.{" "}
        <strong className="font-medium text-foreground">Chủ trì</strong> chấm
        lại, duyệt, trả lại;{" "}
        <strong className="font-medium text-foreground">phối hợp</strong> cho ý
        kiến; <strong className="font-medium text-foreground">nhận để biết</strong>{" "}
        chỉ xem.
      </p>
      {hasInactiveUnit(units) ? (
        <p role="alert" className="text-xs text-destructive">
          Có tài khoản đã bị khoá hoặc không còn đơn vị - báo quản trị sửa luồng
          trình trước khi trình.
        </p>
      ) : null}
    </div>
  );
}
