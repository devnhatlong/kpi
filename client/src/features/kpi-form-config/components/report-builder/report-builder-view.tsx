"use client";

import { useMemo, useState } from "react";
import {
  Eye,
  LayoutGrid,
  ListChecks,
  Loader2,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import useSWR, { mutate as globalMutate } from "swr";
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
  applyReportTemplate,
  axisKeys,
  createFormTemplate,
  createReportTemplate,
  criterionKeys,
  fetchAxesAll,
  fetchCriteriaSummary,
  fetchCurrentReportContext,
  fetchFormTemplatesAll,
  formTemplateKeys,
  reportTemplateKeys,
  updateFormTemplate,
  updateReportTemplate,
} from "@/features/kpi-form-config/api";
import { AxisFormDialog } from "@/features/kpi-form-config/components/axis-form-dialog";
import { CriteriaCatalogDialog } from "@/features/kpi-form-config/components/report-builder/criteria-catalog-dialog";
import { EntryPreviewTable } from "@/features/kpi-form-config/components/report-builder/entry-preview-table";
import { FieldDesigner } from "@/features/kpi-form-config/components/report-builder/field-designer";
import {
  draftFingerprint,
  draftFromTemplate,
  sameTarget,
  sanitizeDraft,
  targetKey,
  type DesignerTarget,
  type FormDraft,
} from "@/features/kpi-form-config/components/report-builder/form-draft";
import { HeaderStructureDialog } from "@/features/kpi-form-config/components/report-builder/header-structure-dialog";
import {
  LibraryRail,
  scoringLabel,
} from "@/features/kpi-form-config/components/report-builder/library-rail";
import { ReportPreviewDialog } from "@/features/kpi-form-config/components/report-builder/report-preview-dialog";
import { ScoringRulesDialog } from "@/features/kpi-form-config/components/report-builder/scoring-rules-dialog";
import { TemplateComposer } from "@/features/kpi-form-config/components/report-builder/template-composer";
import {
  createDefaultTemplateDraft,
  entityId,
  type Axis,
  type FormTemplate,
  type FormTemplateInput,
  type ReportTemplateStatus,
} from "@/features/kpi-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";

/** Bản mẫu báo cáo đang sửa trên màn - phần khác với bản đã lưu là `savedFp`. */
type ReportDraft = {
  id: string | null;
  name: string;
  status: ReportTemplateStatus;
  includeCriteria: boolean;
  /**
   * Trục được ghép vào mẫu. Thứ tự ở đây KHÔNG có nghĩa - thứ tự khối B.1, B.2…
   * luôn suy từ thứ tự trục trong thư viện, nên so sánh thì sắp lại cho ổn định.
   */
  picked: string[];
  savedFp: string;
};

function reportFingerprint(
  name: string,
  includeCriteria: boolean,
  picked: string[],
): string {
  return JSON.stringify([name.trim(), includeCriteria, [...picked].sort()]);
}

/** Nạp lại mọi cache đang đọc bộ cột - form nhập nhiệm vụ cache theo trục. */
async function refreshTemplateCaches() {
  await globalMutate(
    (key) =>
      Array.isArray(key) &&
      (key[0] === "form-template-by-axis" ||
        key[0] === "form-template-for-criteria"),
  );
}

export function ReportBuilderView() {
  const axesSwr = useSWR(axisKeys.all, fetchAxesAll);
  const templatesSwr = useSWR(formTemplateKeys.all, fetchFormTemplatesAll);
  const criteriaSwr = useSWR(criterionKeys.summary, fetchCriteriaSummary);
  const contextSwr = useSWR(reportTemplateKeys.current(), () =>
    fetchCurrentReportContext(),
  );

  const axes = useMemo(() => axesSwr.data ?? [], [axesSwr.data]);
  const templates = useMemo(() => templatesSwr.data ?? [], [templatesSwr.data]);

  const templateByAxis = useMemo(() => {
    const map = new Map<string, FormTemplate>();
    for (const template of templates) {
      for (const axis of template.axisIds ?? []) {
        map.set(entityId(axis), template);
      }
    }
    return map;
  }, [templates]);

  const criteriaTemplate = useMemo(
    () => templates.find((template) => template.forCriteria) ?? null,
    [templates],
  );

  const criteriaCount = criteriaSwr.data?.activeCount ?? 0;
  const criteriaMaxScore = criteriaSwr.data?.totalMaxScore ?? 0;

  const [report, setReport] = useState<ReportDraft | null>(null);
  const [target, setTarget] = useState<DesignerTarget | null>(null);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [draftSavedFp, setDraftSavedFp] = useState("");
  const [loadedTarget, setLoadedTarget] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const [axisDialogOpen, setAxisDialogOpen] = useState(false);
  const [axisEdit, setAxisEdit] = useState<Axis | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [structureOpen, setStructureOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingTarget, setPendingTarget] = useState<DesignerTarget | null>(
    null,
  );
  const [saving, setSaving] = useState(false);

  const context = contextSwr.data;

  /*
    Nạp bản nháp ngay trong lượt render đầu có đủ dữ liệu, không qua effect:
    effect chạy sau khi đã vẽ xong, nên màn sẽ chớp một nhịp với mẫu rỗng rồi
    mới nhảy sang mẫu thật.
  */
  if (!report && context && !axesSwr.isLoading) {
    const template = context.template;
    const name = template?.name ?? `Mẫu báo cáo KPI năm ${context.year}`;
    const includeCriteria = template?.includeCriteria ?? true;
    const picked = (template?.axisIds ?? []).map(entityId);

    setReport({
      id: template ? entityId(template) : null,
      name,
      status: template?.status ?? "draft",
      includeCriteria,
      picked,
      savedFp: reportFingerprint(name, includeCriteria, picked),
    });

    // Mở sẵn khối đầu tiên - vào trang là thấy ngay một form thật.
    const axisIds = axes.map(entityId);
    const firstAxis = axisIds.find((id) => picked.includes(id)) ?? axisIds[0];
    setTarget(
      includeCriteria || !firstAxis
        ? { kind: "criteria" }
        : { kind: "axis", axisId: firstAxis },
    );
  }

  /*
    Nạp bộ cột khi ĐỔI khối. Bám theo `loadedTarget` chứ không phải mỗi lần
    danh sách mẫu revalidate - nếu không thì mỗi lượt cache làm mới là xoá sạch
    thay đổi đang gõ dở trên canvas.
  */
  if (target && !templatesSwr.isLoading && targetKey(target) !== loadedTarget) {
    const currentTemplate =
      target.kind === "criteria"
        ? criteriaTemplate
        : (templateByAxis.get(target.axisId) ?? null);
    const axisName =
      target.kind === "axis"
        ? (axes.find((axis) => entityId(axis) === target.axisId)?.name ?? "trục")
        : "";
    const next = draftFromTemplate(
      currentTemplate,
      target.kind === "criteria"
        ? "Form bảng tiêu chí chung"
        : `Form ${axisName}`,
    );

    setLoadedTarget(targetKey(target));
    setDraft(next);
    setDraftSavedFp(draftFingerprint(next));
    setSelectedFieldId(next.columns[0]?.id ?? null);
  }

  if (!report || !context) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Đang tải cấu hình biểu mẫu...
      </div>
    );
  }

  const year = context.year;
  const axisIds = axes.map(entityId);
  const pickedSet = new Set(report.picked);
  /** Thứ tự khối B.1, B.2… bám theo thứ tự trục trong thư viện. */
  const orderedPicked = axisIds.filter((id) => pickedSet.has(id));
  const pickedAxes = axes.filter((axis) => pickedSet.has(entityId(axis)));

  const reportDirty =
    reportFingerprint(report.name, report.includeCriteria, report.picked) !==
    report.savedFp;
  const draftDirty = !!draft && draftFingerprint(draft) !== draftSavedFp;
  const dirty = reportDirty || draftDirty;

  const currentTemplate = target
    ? target.kind === "criteria"
      ? criteriaTemplate
      : (templateByAxis.get(target.axisId) ?? null)
    : null;

  const targetAxisIndex =
    target?.kind === "axis"
      ? axes.findIndex((axis) => entityId(axis) === target.axisId)
      : -1;
  const targetAxis = targetAxisIndex >= 0 ? axes[targetAxisIndex]! : null;
  const blockLabel = !target
    ? ""
    : target.kind === "criteria"
      ? "Danh mục điểm tiêu chí chung"
      : targetAxis
        ? `Trục ${targetAxisIndex + 1} · ${targetAxis.name}`
        : "Trục đã xoá";

  const patchReport = (patch: Partial<ReportDraft>) =>
    setReport((prev) => (prev ? { ...prev, ...patch } : prev));

  /** Lưu bộ cột của khối đang mở; ném lỗi kèm câu nhắc nếu chưa hợp lệ. */
  const saveDraft = async (): Promise<FormTemplate> => {
    if (!target || !draft) throw new Error("Chưa chọn khối nào để lưu.");

    const clean = sanitizeDraft(draft);
    if (!clean.columns.length) {
      throw new Error(`${blockLabel}: form phải có ít nhất một trường.`);
    }
    if (clean.columns.some((column) => !column.title)) {
      throw new Error(`${blockLabel}: còn trường chưa đặt nhãn hiển thị.`);
    }

    const payload: FormTemplateInput = {
      name: clean.name.trim() || blockLabel,
      columns: clean.columns,
      headerGroups: clean.headerGroups,
      footer: clean.footer,
      axisIds: target.kind === "axis" ? [target.axisId] : [],
      forCriteria: target.kind === "criteria",
    };

    const saved = clean.templateId
      ? await updateFormTemplate(clean.templateId, payload)
      : await createFormTemplate(payload);

    // Tạo mới thì bản nháp phải nhớ id vừa sinh, không thì lần lưu sau lại tạo
    // thêm một mẫu nữa và trục bị gán hai mẫu.
    const next: FormDraft = { ...clean, templateId: entityId(saved) };
    setDraft(next);
    setDraftSavedFp(draftFingerprint(next));
    return saved;
  };

  const saveDraftOnly = async () => {
    setSaving(true);
    try {
      await saveDraft();
      await templatesSwr.mutate();
      await refreshTemplateCaches();
      toast.success(`Đã lưu form · ${blockLabel}.`);
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Không lưu được form của khối này."),
      );
    } finally {
      setSaving(false);
    }
  };

  /** Lưu form đang sửa (nếu có), lưu mẫu báo cáo rồi chốt áp dụng cho năm. */
  const saveAndApply = async () => {
    if (!report.name.trim()) {
      toast.error("Vui lòng nhập tên mẫu báo cáo.");
      return;
    }
    if (!orderedPicked.length && !report.includeCriteria) {
      toast.error(
        "Mẫu chưa có khối nội dung nào - chọn ít nhất một trục hoặc bật bảng tiêu chí chung.",
      );
      return;
    }

    setSaving(true);
    try {
      if (draftDirty) await saveDraft();

      const payload = {
        name: report.name.trim(),
        year,
        includeCriteria: report.includeCriteria,
        axisIds: orderedPicked,
      };
      const saved = report.id
        ? await updateReportTemplate(report.id, payload)
        : await createReportTemplate(payload);
      const applied = await applyReportTemplate(entityId(saved));

      patchReport({
        id: entityId(applied),
        status: applied.status,
        savedFp: reportFingerprint(
          report.name,
          report.includeCriteria,
          report.picked,
        ),
      });

      await Promise.all([templatesSwr.mutate(), contextSwr.mutate()]);
      await refreshTemplateCaches();
      toast.success(`Đã lưu và áp dụng mẫu báo cáo cho năm ${year}.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được mẫu báo cáo."));
    } finally {
      setSaving(false);
    }
  };

  /** Đổi khối đang mở - còn thay đổi chưa lưu thì hỏi trước khi bỏ. */
  const requestTarget = (next: DesignerTarget) => {
    if (sameTarget(next, target)) return;
    if (draftDirty) {
      setPendingTarget(next);
      return;
    }
    setTarget(next);
  };

  const saveAndSwitch = async () => {
    if (!pendingTarget) return;
    setSaving(true);
    try {
      await saveDraft();
      await templatesSwr.mutate();
      await refreshTemplateCaches();
      setTarget(pendingTarget);
      setPendingTarget(null);
      toast.success("Đã lưu form trước khi chuyển khối.");
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Không lưu được form của khối này."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <LayoutGrid className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Quản lý KPI · Quản trị biểu mẫu
            </p>
            <h1 className="font-display text-2xl font-semibold tracking-tight">
              Cấu hình biểu mẫu báo cáo
            </h1>
            <p className="text-sm text-muted-foreground">
              Tạo form tiêu chí chung và từng trục riêng biệt, sau đó ghép các
              trục thành mẫu báo cáo sử dụng thực tế.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="size-4" />
            Xem trước
          </Button>
          <Button type="button" onClick={saveAndApply} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Lưu &amp; áp dụng mẫu
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-l-4 border-l-primary bg-primary/5 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <SlidersHorizontal className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="space-y-0.5 text-sm">
            <p className="font-medium">
              Luồng cấu hình: tạo thành phần trước, ghép thành báo cáo sau.
            </p>
            <p className="text-xs text-muted-foreground">
              Tiêu chí chung luôn đứng ở khối A; chỉ các trục được chọn mới xuất
              hiện trong khối B. Lưu cấu hình để áp dụng cho mẫu báo cáo năm{" "}
              {year}.
            </p>
          </div>
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          {axes.length === 0 ? "Bước 1 · Tạo trục" : "Bước 2 · Ghép trục"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <LibraryRail
          axes={axes}
          templateByAxis={templateByAxis}
          criteriaTemplate={criteriaTemplate}
          criteriaCount={criteriaCount}
          criteriaMaxScore={criteriaMaxScore}
          target={target}
          pickedAxisIds={orderedPicked}
          onSelect={requestTarget}
          onCreateAxis={() => {
            setAxisEdit(null);
            setAxisDialogOpen(true);
          }}
          onEditAxis={(axis) => {
            setAxisEdit(axis);
            setAxisDialogOpen(true);
          }}
        />

        <TemplateComposer
          name={report.name}
          onNameChange={(name) => patchReport({ name })}
          year={year}
          status={report.status}
          dirty={dirty}
          axes={axes}
          templateByAxis={templateByAxis}
          criteriaTemplate={criteriaTemplate}
          criteriaCount={criteriaCount}
          criteriaMaxScore={criteriaMaxScore}
          includeCriteria={report.includeCriteria}
          onToggleCriteria={(includeCriteria) => patchReport({ includeCriteria })}
          pickedAxisIds={orderedPicked}
          onToggleAxis={(axisId, checked) =>
            patchReport({
              picked: checked
                ? [...new Set([...report.picked, axisId])]
                : report.picked.filter((id) => id !== axisId),
            })
          }
          target={target}
          onConfigure={requestTarget}
        />
      </div>

      {target && draft ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              Form {blockLabel}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {target.kind === "criteria" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setCriteriaOpen(true)}
                >
                  <ListChecks className="size-4" />
                  Danh mục tiêu chí
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setStructureOpen(true)}
              >
                <LayoutGrid className="size-4" />
                Xem cấu trúc trường
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={saveDraftOnly}
                disabled={saving || !draftDirty}
              >
                <Save className="size-4" />
                {draftDirty ? "Lưu form này" : "Đã lưu"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-l-4 border-l-primary/60 bg-muted/40 px-4 py-2.5 text-sm">
            <p>
              <span className="font-medium">{scoringLabel(currentTemplate)}</span>
              {" · tối đa "}
              {target.kind === "axis"
                ? (targetAxis?.maxScore ?? 0)
                : criteriaMaxScore}{" "}
              điểm. Thiết kế trường ở dưới chỉ áp dụng cho khối này, không ảnh
              hưởng các khối khác.
            </p>
            <Badge variant="outline" className="font-normal">
              {draft.columns.length} trường đang dùng
            </Badge>
          </div>

          <div className="space-y-4 rounded-xl border bg-card p-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold">
                Thiết kế trường dữ liệu · {blockLabel}
              </h3>
              <p className="text-xs text-muted-foreground">
                Kéo thả trường trên canvas để đổi thứ tự cột của form.
              </p>
            </div>

            <FieldDesigner
              blockLabel={blockLabel}
              columns={draft.columns}
              headerGroups={draft.headerGroups}
              selectedId={selectedFieldId}
              onSelect={setSelectedFieldId}
              onColumnsChange={(columns) =>
                setDraft((prev) => (prev ? { ...prev, columns } : prev))
              }
              onOpenRules={() => setRulesOpen(true)}
              onFillDefault={() => {
                const seed = createDefaultTemplateDraft();
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        columns: seed.columns,
                        headerGroups: seed.headerGroups,
                        footer: seed.footer,
                      }
                    : prev,
                );
                setSelectedFieldId(seed.columns[0]?.id ?? null);
              }}
            />
          </div>

          <div className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold">
                Xem trước bảng nhập liệu
              </h3>
              <span className="text-xs text-muted-foreground">
                Tự cập nhật theo thứ tự kéo thả
              </span>
            </div>
            <EntryPreviewTable
              columns={draft.columns}
              headerGroups={draft.headerGroups}
            />
          </div>
        </section>
      ) : null}

      <AxisFormDialog
        open={axisDialogOpen}
        onOpenChange={setAxisDialogOpen}
        edit={axisEdit}
        onSuccess={() => void axesSwr.mutate()}
      />

      <CriteriaCatalogDialog open={criteriaOpen} onOpenChange={setCriteriaOpen} />

      {draft ? (
        <HeaderStructureDialog
          open={structureOpen}
          onOpenChange={setStructureOpen}
          columns={draft.columns}
          headerGroups={draft.headerGroups}
          onChange={(headerGroups) =>
            setDraft((prev) => (prev ? { ...prev, headerGroups } : prev))
          }
        />
      ) : null}

      {draft ? (
        <ScoringRulesDialog
          open={rulesOpen}
          onOpenChange={setRulesOpen}
          blockLabel={blockLabel}
          columns={draft.columns}
          footer={draft.footer}
          onChange={(footer) =>
            setDraft((prev) => (prev ? { ...prev, footer } : prev))
          }
        />
      ) : null}

      <ReportPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        name={report.name}
        year={year}
        includeCriteria={report.includeCriteria}
        criteriaTemplate={criteriaTemplate}
        criteriaMaxScore={criteriaMaxScore}
        pickedAxes={pickedAxes}
        templateByAxis={templateByAxis}
      />

      <AlertDialog
        open={!!pendingTarget}
        onOpenChange={(open) => !open && setPendingTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Form đang sửa dở chưa lưu</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có thay đổi chưa lưu ở form <strong>{blockLabel}</strong>.
              Chuyển sang khối khác sẽ mất các thay đổi đó.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ở lại</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTarget(pendingTarget);
                setPendingTarget(null);
              }}
              disabled={saving}
            >
              Bỏ thay đổi
            </Button>
            {/* Chặn Radix tự đóng: lưu hỏng mà hộp thoại đã đóng thì người dùng
                tưởng đã chuyển khối xong, trong khi bản nháp vẫn còn nguyên. */}
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void saveAndSwitch();
              }}
              disabled={saving}
            >
              Lưu rồi chuyển
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
