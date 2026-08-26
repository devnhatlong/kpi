"use client";

import { useEffect, useState } from "react";
import { History, Loader2, Lock, Send } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  criteriaPeriodOf,
  fetchPersonalCriteriaSheet,
  formatCriteriaPeriod,
  personalCriteriaKeys,
  savePersonalCriteriaSheet,
  updatePersonalCriteriaSheet,
  type PersonalCriterionRow,
} from "@/features/personal-kpi/api";
import {
  PERSONAL_KPI_STATUS_LABEL,
  type PersonalKpiProgressLog,
} from "@/features/personal-kpi/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHms, formatYmd } from "@/lib/server-time";

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

/** Bỏ phần chụp từ danh mục, chỉ giữ thứ server nhận. */
function toPayloadRows(rows: CriteriaRow[]) {
  return rows.map((row) => ({
    criterionId: row.criterionId,
    fieldValues: row.fieldValues,
    catalogValues: row.catalogValues,
  }));
}

type PanelRow = CriteriaRow & Pick<
  PersonalCriterionRow,
  "reviewValues" | "reviewCatalogValues"
>;

type PersonalCriteriaPanelProps = {
  /**
   * Kỳ tháng YYYY-MM; bỏ trống = tháng này theo giờ server.
   * Nhận cả YYYY-MM-DD cho tiện - màn nhập luôn đứng ở một ngày cụ thể.
   */
  period?: string;
  /** Tắt khi tab chưa mở - khỏi gọi API cho một bảng không ai nhìn. */
  enabled: boolean;
  disabled?: boolean;
  /**
   * Đăng ký hàm lưu để nút "Lưu nháp" của drawer lưu luôn bảng này - khối A đi
   * cùng nhịp với các trục, không bắt cán bộ bấm lưu hai lần.
   *
   * Chỉ đăng ký khi bảng còn nháp. Bảng đã gửi thì "Lưu nháp" không được đụng
   * tới nữa - sửa lúc đó phải đi đường "Cập nhật" để có lưu vết.
   *
   * Hàm trả về `true` khi thật sự có ghi. Drawer cần biết để phân biệt "lưu
   * xong bảng A" với "chẳng có gì để lưu" - hai thứ đó mà báo giống nhau thì
   * bấm Lưu nháp trên một phiếu trống vẫn hiện thông báo thành công.
   */
  onRegisterSave: (fn: (() => Promise<boolean>) | null) => void;
};

/**
 * Khối A trong báo cáo cá nhân: bảng chốt kết quả các tiêu chí chung của THÁNG.
 *
 * Bảng dựng hoàn toàn theo mẫu `forCriteria` - cột nào, thứ tự nào, kiểu gì đều
 * do màn Cấu hình biểu mẫu quyết định.
 *
 * Một tháng một bảng, cán bộ cập nhật ngày nào cũng được hoặc không đụng tới
 * ngày nào cũng được. Gửi kèm báo cáo của một ngày bất kỳ trong tháng; sửa sau
 * khi gửi thì mọi ô đổi giá trị vào nhật ký; chỉ huy chấm lại rồi chốt thì khoá.
 */
export function PersonalCriteriaPanel({
  period,
  enabled,
  disabled = false,
  onRegisterSave,
}: PersonalCriteriaPanelProps) {
  // Khoá SWR theo THÁNG: mọi ngày trong tháng phải trỏ vào cùng một bản, không
  // thì mỗi ngày lại nạp và ghi đè một bảng tưởng là của riêng ngày đó.
  const key = period ? criteriaPeriodOf(period) : "current";
  const sheet = useSWR(
    enabled ? personalCriteriaKeys.sheet(key) : null,
    () => fetchPersonalCriteriaSheet(period),
    { revalidateOnFocus: false },
  );
  const template = useSWR(
    enabled ? formTemplateKeys.forCriteria : null,
    fetchFormTemplateForCriteria,
    { revalidateOnFocus: false },
  );

  const [rows, setRows] = useState<PanelRow[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  /**
   * Vân tay của bảng lúc nạp xong. Panel luôn nằm trong cây (chỉ ẩn bằng CSS)
   * nên hàm lưu luôn được đăng ký - so vân tay để "Lưu nháp" không ghi đè một
   * bảng chưa ai đụng vào, mỗi lần lưu nhiệm vụ lại đẻ thêm một bản rỗng.
   */
  const [savedFp, setSavedFp] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const state = sheet.data;
  const status = state?.reviewStatus ?? "DRAFT";
  const canEdit = state?.canEdit ?? true;
  const completed = status === "COMPLETED";
  const locked = completed || disabled;

  /*
    Nạp bảng đã chấm ngay trong render lúc dữ liệu về, không qua effect - effect
    chạy sau khi vẽ nên bảng sẽ chớp một nhịp ở trạng thái trống.
  */
  const stamp = state ? `${key}:${state.period}:${state.reviewStatus}` : null;
  if (stamp && loadedKey !== stamp) {
    const next = state!.rows.map((row) => ({ ...row }));
    setLoadedKey(stamp);
    setRows(next);
    setSavedFp(fingerprint(next));
    setNote("");
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
    if (!enabled || disabled || !canEdit) {
      onRegisterSave(null);
      return;
    }
    onRegisterSave(async () => {
      const current = fingerprint(rows);
      // Chưa đụng gì thì thôi - đừng đẻ ra một bản rỗng mỗi lần lưu nhiệm vụ.
      if (current === savedFp) return false;
      await savePersonalCriteriaSheet({
        period,
        rows: toPayloadRows(rows),
      });
      setSavedFp(current);
      /*
        Nạp lại bản ghi: màn ngày dùng CHUNG khoá SWR này để biết bảng đã chấm
        chưa mà bật nút gửi. Không nạp lại thì lưu xong bảng vẫn không gửi được
        cho tới khi tải lại trang.
      */
      await sheet.mutate();
      return true;
    });
    return () => onRegisterSave(null);
  });

  const dirty = fingerprint(rows) !== savedFp;

  const submitUpdate = async () => {
    setSaving(true);
    try {
      const next = await updatePersonalCriteriaSheet({
        period,
        rows: toPayloadRows(rows),
        note: note.trim() || undefined,
      });
      await sheet.mutate(next, { revalidate: false });
      setNote("");
      toast.success("Đã cập nhật bảng tiêu chí chung.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không cập nhật được bảng."));
    } finally {
      setSaving(false);
    }
  };

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

  /*
    Bộ cột lấy từ chính bản ghi: bảng đã gửi mang mẫu đã khoá lúc gửi, bảng chưa
    gửi mang mẫu đang bật. Mẫu live chỉ còn là đường lui khi chưa lưu bản nào.
  */
  const columnsSource = state?.template ?? template.data;
  if (!columnsSource) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        Khối A chưa được gán mẫu bảng nên chưa biết bày cột nào - cấu hình ở mục
        Mẫu báo cáo KPI.
      </p>
    );
  }

  /*
    Bảng đã chốt thì bày SỐ CHỐT của chỉ huy, số tự chấm lùi xuống dòng nhắc
    dưới ô. Bày số tự chấm ở ô chính thì cán bộ mở lại vẫn thấy điểm mình khai
    và tưởng đó là điểm được duyệt.
  */
  const display: CriteriaRow[] = completed
    ? rows.map((row) => ({
        ...row,
        fieldValues: { ...row.fieldValues, ...row.reviewValues },
        catalogValues: { ...row.catalogValues, ...row.reviewCatalogValues },
      }))
    : rows;
  const selfValues = completed
    ? Object.fromEntries(rows.map((row) => [row.criterionId, row.fieldValues]))
    : undefined;

  return (
    <div className="space-y-2">
      <CriteriaStatusNote
        status={status}
        period={state?.period ?? criteriaPeriodOf(period ?? "")}
        returnReason={state?.returnReason ?? ""}
        reviewNote={state?.reviewNote ?? ""}
        reviewScoredByName={state?.reviewScoredByName ?? ""}
      />

      <CriteriaTable
        columns={columnsSource.columns ?? []}
        headerGroups={columnsSource.headerGroups ?? []}
        rows={display}
        disabled={locked}
        selfValues={selfValues}
        onChange={patch}
      />

      <CriteriaLog logs={state?.progressLogs ?? []} />

      {/*
        Bảng đã gửi mà chưa chốt: sửa vẫn được nhưng phải đi qua nút này, để
        server ghi lại từng ô đã đổi. Nút chỉ sáng khi thật sự có thay đổi -
        bấm "Cập nhật" trên một bảng y nguyên chỉ đẻ ra một mốc nhật ký rỗng.
      */}
      {!canEdit && !completed && !disabled ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <Textarea
            value={note}
            rows={2}
            placeholder="Lý do sửa (không bắt buộc) - hiện trong nhật ký của bảng"
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              <History className="mr-1 inline size-3" />
              Mọi ô đổi giá trị đều được ghi vào nhật ký của bảng.
            </p>
            <Button size="sm" disabled={!dirty || saving} onClick={submitUpdate}>
              {saving ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : null}
              Cập nhật
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const LOG_TITLE: Record<PersonalKpiProgressLog["type"], string> = {
  PROGRESS: "Sửa lại bảng",
  SUBMIT: "Gửi lên",
  RETURN: "Bị trả lại",
  COMPLETE: "Chỉ huy chốt",
  EDIT: "Cấp trên sửa",
};

/**
 * Nhật ký của bảng - mới nhất đứng đầu.
 *
 * Có mặt ở đây chứ không chỉ nằm trong DB: cả luật "sửa sau khi gửi thì để lại
 * vết" chỉ có nghĩa khi người sửa nhìn thấy vết mình vừa để lại.
 */
function CriteriaLog({ logs }: { logs: PersonalKpiProgressLog[] }) {
  const [open, setOpen] = useState(false);
  if (!logs.length) return null;

  const ordered = [...logs].reverse();
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium hover:bg-muted/40"
        onClick={() => setOpen((prev) => !prev)}
      >
        <History className="size-3.5" />
        Nhật ký bảng ({logs.length})
      </button>
      {open ? (
        <ol className="space-y-2 border-t px-3 py-2">
          {ordered.map((log) => (
            <li key={log.at} className="text-xs">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{LOG_TITLE[log.type]}</span>
                <span className="text-muted-foreground">
                  {formatServerHms(log.at)} · {formatYmd(log.onDate)}
                </span>
                <span className="text-muted-foreground">
                  {log.byName}
                  {log.toName ? ` → ${log.toName}` : ""}
                </span>
              </p>
              {log.note ? (
                <p className="mt-0.5 text-muted-foreground">{log.note}</p>
              ) : null}
              {log.changes.length ? (
                <ul className="mt-0.5 space-y-0.5 rounded-md bg-muted/50 px-2 py-1">
                  {log.changes.map((change) => (
                    <li key={`${change.detail}-${change.to}`}>
                      <span className="text-muted-foreground">
                        {change.detail}:{" "}
                      </span>
                      <span className="line-through">
                        {logCellText(change.from)}
                      </span>
                      <span className="mx-1">→</span>
                      <span>{logCellText(change.to)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/** Ô tích lưu "1"; ô trống hiện dấu gạch cho khỏi đọc thành mất chữ. */
function logCellText(raw: string): string {
  if (!raw.trim()) return "-";
  return raw === "1" ? "Có" : raw;
}

/** Một câu nói rõ bảng đang ở đâu trong chuỗi duyệt và làm gì được tiếp. */
function CriteriaStatusNote({
  status,
  period,
  returnReason,
  reviewNote,
  reviewScoredByName,
}: {
  status: keyof typeof PERSONAL_KPI_STATUS_LABEL;
  period: string;
  returnReason: string;
  reviewNote: string;
  reviewScoredByName: string;
}) {
  if (status === "RETURNED") {
    return (
      <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
        <span className="font-medium">Bảng bị trả lại.</span>{" "}
        {returnReason || "Không ghi lý do."} Sửa xong gửi lại cùng báo cáo ngày.
      </p>
    );
  }

  if (status === "COMPLETED") {
    return (
      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
        <Lock className="mr-1 inline size-3" />
        <span className="font-medium">Đã chốt</span>
        {reviewScoredByName ? ` bởi ${reviewScoredByName}` : ""}. Bảng hiện điểm
        chỉ huy đã chấm; điểm bạn tự chấm nằm ngay dưới ô nếu có chênh.
        {reviewNote ? ` Nhận xét: ${reviewNote}` : ""}
      </p>
    );
  }

  if (status === "PENDING" || status === "APPROVED") {
    return (
      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs">
        <Send className="mr-1 inline size-3" />
        Bảng đã gửi lên trên ({PERSONAL_KPI_STATUS_LABEL[status]}). Vẫn sửa được
        cho tới khi chỉ huy chốt, nhưng mỗi lần sửa đều để lại vết.
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">
      Bảng chốt kết quả {formatCriteriaPeriod(period)} - cả tháng một bản, sửa
      lại ngày nào cũng được. Gửi kèm báo cáo ngày để chỉ huy đối chiếu và chốt.
    </p>
  );
}
