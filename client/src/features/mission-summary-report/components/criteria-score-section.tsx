"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ClipboardCheck, Loader2, Save } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  criterionKeys,
  fetchCriteriaAll,
  fetchFormTemplateForCriteria,
  formTemplateKeys,
} from "@/features/mission-form-config/api";
import {
  entityId,
  REPORT_SECTION_A_TITLE,
} from "@/features/mission-form-config/types";
import {
  saveSummaryCriteriaScores,
  type SummaryCriterionScoreInput,
} from "@/features/mission-summary-report/api";
import { missionTone } from "@/features/personal-mission/status-styles";
import type {
  CriterionSubjectType,
  SummaryReport,
  SummaryReportDetail,
} from "@/features/mission-summary-report/types";
import {
  CriteriaTable,
  type CriteriaRow,
  type CriteriaRowPatch,
} from "@/features/personal-mission/components/criteria-table";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Đối tượng được chấm: đơn vị của báo cáo, hoặc một cán bộ trong báo cáo. */
type Subject = {
  type: CriterionSubjectType;
  id: string | null;
  name: string;
};

function subjectKey(subject: Subject) {
  return `${subject.type}:${subject.id ?? ""}`;
}

type CriteriaScoreSectionProps = {
  report: SummaryReport;
  /** Cán bộ có nhiệm vụ trong báo cáo - lấy từ chính các dòng đang bày. */
  people: Array<{ id: string; name: string }>;
  /** Điểm cán bộ TỰ CHẤM ở báo cáo cá nhân - nạp sẵn khi chỉ huy chưa sửa. */
  selfScores: SummaryReportDetail["selfCriteriaScores"];
  /** Trung bình đầu người của các bảng thành viên - nạp sẵn cho bảng đơn vị. */
  averageScores: SummaryReportDetail["criteriaAverage"];
  averageBasis: SummaryReportDetail["criteriaAverageBasis"];
  /** Báo cáo còn sửa được không; đã trình hoặc đã duyệt thì chỉ đọc. */
  editable: boolean;
  onSaved: () => void | Promise<void>;
};

/**
 * Khối A của báo cáo tổng hợp, dựng theo đúng mẫu `forCriteria` như bên báo cáo
 * cá nhân - chung một component bảng, nên hai nơi không bao giờ lệch bố cục.
 *
 * Hai mức đối tượng: bảng của ĐƠN VỊ là điểm của báo cáo, còn bảng của từng cán
 * bộ là đánh giá cá nhân, để riêng và mặc định gấp lại - mỗi cán bộ một bảng,
 * mở hết ra thì không đọc nổi.
 */
export function CriteriaScoreSection({
  report,
  people,
  selfScores,
  averageScores,
  averageBasis,
  editable,
  onSaved,
}: CriteriaScoreSectionProps) {
  const criteria = useSWR(criterionKeys.all, fetchCriteriaAll);
  const template = useSWR(
    formTemplateKeys.forCriteria,
    fetchFormTemplateForCriteria,
    { revalidateOnFocus: false },
  );

  const unitSubject: Subject = {
    type: "DEPARTMENT",
    id: null,
    name: report.scopeName || "Đơn vị của báo cáo",
  };

  /** Bảng trắng của một đối tượng - đúng danh mục tiêu chí đang hoạt động. */
  const blankRows = useMemo<CriteriaRow[]>(
    () =>
      (criteria.data ?? []).map((item) => ({
        criterionId: entityId(item),
        criterionName: item.name,
        criterionNote: item.note ?? "",
        maxScore: item.maxScore ?? 0,
        fieldValues: {},
        catalogValues: {},
      })),
    [criteria.data],
  );

  const [tables, setTables] = useState<Map<string, CriteriaRow[]>>(new Map());
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openPeople, setOpenPeople] = useState<Set<string>>(new Set());

  /*
    Nạp bảng chấm ngay trong render lúc báo cáo hoặc danh mục đổi, không qua
    effect - effect chạy sau khi vẽ nên bảng sẽ chớp một nhịp ở trạng thái trống.
  */
  const stamp = blankRows.length ? `${report._id}:${blankRows.length}` : null;
  if (stamp && loadedId !== stamp) {
    setLoadedId(stamp);

    const next = new Map<string, CriteriaRow[]>();
    const rowsFor = (subject: Subject) => {
      const key = subjectKey(subject);
      if (!next.has(key))
        next.set(
          key,
          blankRows.map((row) => ({ ...row })),
        );
      return next.get(key)!;
    };
    const apply = (
      rows: CriteriaRow[],
      criterionId: string,
      values: Pick<CriteriaRow, "fieldValues" | "catalogValues">,
    ) => {
      const row = rows.find((item) => item.criterionId === criterionId);
      if (!row) return;
      row.fieldValues = { ...values.fieldValues };
      row.catalogValues = { ...values.catalogValues };
    };

    rowsFor(unitSubject);
    for (const person of people) {
      rowsFor({ type: "USER", id: person.id, name: person.name });
    }

    /*
      Bảng của ĐƠN VỊ nạp sẵn trung bình đầu người của các bảng thành viên -
      cấp chỉ huy không chấm lại sáu tiêu chí từ con số không. Vẫn sửa đè được,
      và điểm chỉ huy đã lưu (vòng dưới) luôn thắng con số gợi ý này.
    */
    for (const row of averageScores) {
      apply(rowsFor(unitSubject), row.criterionId, {
        fieldValues: row.fieldValues,
        catalogValues: {},
      });
    }

    /*
      Nạp điểm cán bộ TỰ CHẤM trước, rồi mới đè bằng điểm chỉ huy đã lưu. Nhờ
      vậy mở lên là thấy sẵn số cán bộ khai, sửa chỗ nào thì chỗ đó thắng.
    */
    for (const row of selfScores) {
      const person = people.find((item) => item.id === row.subjectId);
      if (!person) continue;
      apply(
        rowsFor({ type: "USER", id: person.id, name: person.name }),
        row.criterionId,
        row,
      );
    }
    for (const row of report.criteriaScores ?? []) {
      apply(
        rowsFor({
          type: row.subjectType,
          id: row.subjectId,
          name: row.subjectName,
        }),
        row.criterionId,
        row,
      );
    }

    setTables(next);
    setOpenPeople(new Set());
  }

  const patch = (
    subject: Subject,
    criterionId: string,
    part: CriteriaRowPatch,
  ) =>
    setTables((prev) => {
      const key = subjectKey(subject);
      const rows = prev.get(key) ?? blankRows;
      const next = new Map(prev);
      next.set(
        key,
        rows.map((row) =>
          row.criterionId === criterionId ? { ...row, ...part } : row,
        ),
      );
      return next;
    });

  const save = async () => {
    const scores: SummaryCriterionScoreInput[] = [];
    const collect = (subject: Subject) => {
      for (const row of tables.get(subjectKey(subject)) ?? []) {
        const hasValue =
          Object.values(row.fieldValues).some(
            (value) => value !== "" && value !== false && value !== null,
          ) || Object.keys(row.catalogValues).length > 0;
        // Dòng trắng trơn thì không gửi - "chưa chấm" không cần một bản ghi.
        if (!hasValue) continue;
        scores.push({
          subjectType: subject.type,
          subjectId: subject.id,
          criterionId: row.criterionId,
          fieldValues: row.fieldValues,
          catalogValues: row.catalogValues,
        });
      }
    };

    setSaving(true);
    try {
      collect(unitSubject);
      for (const person of people) {
        collect({ type: "USER", id: person.id, name: person.name });
      }
      await saveSummaryCriteriaScores(report._id, scores);
      toast.success("Đã lưu bảng tiêu chí chung.");
      await onSaved();
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Không lưu được bảng tiêu chí chung."),
      );
    } finally {
      setSaving(false);
    }
  };

  const renderTable = (subject: Subject) => (
    <CriteriaTable
      columns={template.data?.columns ?? []}
      headerGroups={template.data?.headerGroups ?? []}
      rows={tables.get(subjectKey(subject)) ?? blankRows}
      disabled={!editable}
      onChange={(criterionId, part) => patch(subject, criterionId, part)}
    />
  );

  if (criteria.isLoading || template.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Đang tải bảng tiêu chí chung...
        </CardContent>
      </Card>
    );
  }

  if (!blankRows.length || !template.data) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          {blankRows.length
            ? "Khối A chưa được gán mẫu bảng nên chưa biết bày cột nào - cấu hình ở mục Mẫu báo cáo nhiệm vụ."
            : "Danh mục tiêu chí chung chưa có dòng nào - khai ở mục Mẫu báo cáo nhiệm vụ trước khi chấm khối A."}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-emerald-500/15 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              A
            </span>
            <div className="space-y-0.5">
              <h3 className="font-display text-base font-semibold">
                {REPORT_SECTION_A_TITLE}
              </h3>
              <p className="text-xs text-muted-foreground">
                Chấm một lần cho cả kỳ. Bảng của đơn vị là điểm của báo cáo;
                bảng từng cán bộ nạp sẵn số họ tự chấm, sửa đè được.
              </p>
            </div>
          </div>
          {editable ? (
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Lưu bảng tiêu chí
            </Button>
          ) : (
            <Badge variant="outline" className="font-normal">
              Chỉ đọc
            </Badge>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ClipboardCheck className="size-4 text-muted-foreground" />
            {unitSubject.name}
            <Badge variant="secondary" className="font-normal">
              Điểm của báo cáo
            </Badge>
          </div>
          {/*
            Nói rõ con số ở đây từ đâu ra và mẫu số là bao nhiêu. Không nói thì
            chỉ huy thấy một bảng tự có số mà không biết nó tính trên mấy người,
            và không biết mình được phép sửa.
          */}
          <p className="text-xs text-muted-foreground">
            {averageBasis.peopleWithSheet > 0 ? (
              <>
                Nạp sẵn theo trung bình đầu người của{" "}
                <span className="font-medium">
                  {averageBasis.peopleWithSheet}
                </span>
                {averageBasis.peopleTotal > averageBasis.peopleWithSheet ? (
                  <>
                    /{averageBasis.peopleTotal} cán bộ{" "}
                    <span className={missionTone.warning.text}>
                      ({averageBasis.peopleTotal - averageBasis.peopleWithSheet}{" "}
                      người chưa có bảng khối A nên không vào mẫu số)
                    </span>
                  </>
                ) : (
                  " cán bộ"
                )}
                . Sửa đè được, số bạn nhập mới là số chốt.
              </>
            ) : (
              "Chưa cán bộ nào trong báo cáo có bảng khối A - bảng này đang trống, bạn tự chấm."
            )}
          </p>
          {renderTable(unitSubject)}
        </div>

        {people.length ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Chấm theo cán bộ ({people.length})
            </p>
            {people.map((person) => {
              const subject: Subject = {
                type: "USER",
                id: person.id,
                name: person.name,
              };
              const open = openPeople.has(person.id);
              return (
                <div key={person.id} className="rounded-lg border">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenPeople((prev) => {
                        const next = new Set(prev);
                        if (next.has(person.id)) next.delete(person.id);
                        else next.add(person.id);
                        return next;
                      })
                    }
                    aria-expanded={open}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/40"
                  >
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-transform",
                        open ? "" : "-rotate-90",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {person.name}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t p-2">{renderTable(subject)}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
