"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import useSWR from "swr";

import {
  fetchFormTemplateForCriteria,
  formTemplateKeys,
} from "@/features/kpi-form-config/api";
import {
  CriteriaTable,
  type CriteriaRow,
  type CriteriaRowPatch,
} from "@/features/personal-kpi/components/criteria-table";
import {
  fetchPersonalCriteriaSheet,
  personalCriteriaKeys,
  savePersonalCriteriaSheet,
} from "@/features/personal-kpi/api";
import { getApiErrorMessage } from "@/lib/api-client";

/**
 * Vân tay của bảng - chỉ gồm phần người dùng gõ được.
 *
 * Không stringify cả dòng: `criterionName` / `maxScore` là ảnh chụp từ danh
 * mục, admin sửa danh mục là vân tay đổi mà người chấm chưa hề đụng vào ô nào.
 */
function fingerprint(rows: CriteriaRow[]): string {
  return JSON.stringify(
    rows.map((row) => [row.criterionId, row.fieldValues, row.catalogValues]),
  );
}

type PersonalCriteriaPanelProps = {
  /** Ngày báo cáo YYYY-MM-DD; bỏ trống = hôm nay theo giờ server. */
  reportDate?: string;
  /** Tắt khi tab chưa mở - khỏi gọi API cho một bảng không ai nhìn. */
  enabled: boolean;
  disabled?: boolean;
  /**
   * Đăng ký hàm lưu để nút "Lưu nháp" của drawer lưu luôn bảng này - khối A đi
   * cùng nhịp với các trục, không bắt cán bộ bấm lưu hai lần.
   */
  onRegisterSave: (fn: (() => Promise<void>) | null) => void;
};

/**
 * Khối A trong báo cáo cá nhân: cán bộ tự chấm các tiêu chí chung của NGÀY đó.
 *
 * Bảng dựng hoàn toàn theo mẫu `forCriteria` - cột nào, thứ tự nào, kiểu gì đều
 * do màn Cấu hình biểu mẫu quyết định. Mỗi ngày một bản; báo cáo tổng hợp nạp
 * bản mới nhất trong kỳ làm điểm tự chấm, chỉ huy sửa đè được.
 */
export function PersonalCriteriaPanel({
  reportDate,
  enabled,
  disabled = false,
  onRegisterSave,
}: PersonalCriteriaPanelProps) {
  const key = reportDate ?? "today";
  const sheet = useSWR(
    enabled ? personalCriteriaKeys.sheet(key) : null,
    () => fetchPersonalCriteriaSheet(reportDate),
    { revalidateOnFocus: false },
  );
  const template = useSWR(
    enabled ? formTemplateKeys.forCriteria : null,
    fetchFormTemplateForCriteria,
    { revalidateOnFocus: false },
  );

  const [rows, setRows] = useState<CriteriaRow[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  /**
   * Vân tay của bảng lúc nạp xong. Panel luôn nằm trong cây (chỉ ẩn bằng CSS)
   * nên hàm lưu luôn được đăng ký - so vân tay để "Lưu nháp" không ghi đè một
   * bảng chưa ai đụng vào, mỗi lần lưu nhiệm vụ lại đẻ thêm một bản rỗng.
   */
  const [savedFp, setSavedFp] = useState("");

  /*
    Nạp bảng đã chấm ngay trong render lúc dữ liệu về, không qua effect - effect
    chạy sau khi vẽ nên bảng sẽ chớp một nhịp ở trạng thái trống.
  */
  const stamp = sheet.data ? `${key}:${sheet.data.reportDate}` : null;
  if (stamp && loadedKey !== stamp) {
    const next = sheet.data!.rows.map((row) => ({ ...row }));
    setLoadedKey(stamp);
    setRows(next);
    setSavedFp(fingerprint(next));
  }

  const patch = (criterionId: string, part: CriteriaRowPatch) =>
    setRows((prev) =>
      prev.map((row) =>
        row.criterionId === criterionId ? { ...row, ...part } : row,
      ),
    );

  /*
    Đăng ký lại mỗi lượt render để hàm lưu luôn nhìn thấy `rows` mới nhất - giữ
    closure cũ thì bấm Lưu nháp sẽ ghi lại bảng của lần gõ trước.
  */
  useEffect(() => {
    if (!enabled || disabled) {
      onRegisterSave(null);
      return;
    }
    onRegisterSave(async () => {
      const current = fingerprint(rows);
      // Chưa đụng gì thì thôi - đừng đẻ ra một bản rỗng mỗi lần lưu nhiệm vụ.
      if (current === savedFp) return;
      await savePersonalCriteriaSheet({
        reportDate,
        rows: rows.map((row) => ({
          criterionId: row.criterionId,
          fieldValues: row.fieldValues,
          catalogValues: row.catalogValues,
        })),
      });
      setSavedFp(current);
    });
    return () => onRegisterSave(null);
  });

  if (sheet.isLoading || template.isLoading) {
    return (
      <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Đang tải bảng tiêu chí chung...
      </p>
    );
  }

  /*
    Tải hỏng KHÁC HẲN danh mục rỗng. Gộp hai thứ vào một câu "chưa có dòng nào"
    thì lỗi gọi API bị đọc thành lỗi cấu hình, và người dùng đi khai lại danh
    mục đã có sẵn.
  */
  const error = sheet.error ?? template.error;
  if (error) {
    return (
      <p className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-8 text-center text-sm text-muted-foreground">
        {getApiErrorMessage(error, "Không tải được bảng tiêu chí chung.")}
      </p>
    );
  }

  if (!rows.length) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Danh mục tiêu chí chung chưa có dòng nào - quản trị khai ở mục Mẫu báo
        cáo KPI trước.
      </p>
    );
  }

  if (!template.data) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Khối A chưa được gán mẫu bảng nên chưa biết bày cột nào - cấu hình ở mục
        Mẫu báo cáo KPI.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Điểm bạn tự chấm cho ngày này. Chỉ huy đối chiếu và chốt lại khi lập báo
        cáo tổng hợp.
      </p>
      <CriteriaTable
        columns={template.data.columns ?? []}
        headerGroups={template.data.headerGroups ?? []}
        rows={rows}
        disabled={disabled}
        onChange={patch}
      />
    </div>
  );
}
