"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LayoutGrid, Loader2, Save, Scale } from "lucide-react";
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
  adjustmentKeys,
  createFormTemplate,
  fetchAdjustmentSummary,
  fetchFormTemplatesAll,
  formTemplateKeys,
  updateFormTemplate,
} from "@/features/mission-form-config/api";
import { EntryPreviewTable } from "@/features/mission-form-config/components/report-builder/entry-preview-table";
import { FieldDesigner } from "@/features/mission-form-config/components/report-builder/field-designer";
import {
  draftFingerprint,
  draftFromTemplate,
  sanitizeDraft,
  type FormDraft,
} from "@/features/mission-form-config/components/report-builder/form-draft";
import { AdjustmentAccessCard } from "@/features/mission-form-config/components/report-builder/adjustment-access-card";
import { HeaderStructureDialog } from "@/features/mission-form-config/components/report-builder/header-structure-dialog";
import {
  ADJUSTMENT_SECTION_META,
  ADJUSTMENT_SECTIONS,
  createDefaultAdjustmentDraft,
  entityId,
  type AdjustmentSection,
  type FormTemplate,
  type FormTemplateInput,
} from "@/features/mission-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const LIST_HREF = "/mission/form-config";

/** Nạp lại mọi cache đang đọc mẫu của bảng này - màn nhập của đội cache theo phần. */
async function refreshDownstreamCaches() {
  await globalMutate(
    (key) => Array.isArray(key) && key[0] === "form-template-for-adjustment",
  );
}

/**
 * Trình dựng form cho "Bảng đề xuất điểm cộng, điểm trừ và điều chỉnh,
 * khống chế mức xếp loại" - một mẫu báo cáo riêng, không dính gì tới mẫu KPI
 * (khối A/B) của năm.
 *
 * Ba phần I / II / III là ba form, mỗi form một mẫu bảng gắn `forAdjustment`.
 * Canvas thiết kế dùng chung với mẫu KPI (cùng bộ trường, cùng nhóm tiêu đề);
 * chỉ khác ở chỗ không có trục, không có phạm vi theo năm và không có công thức
 * quy điểm - bảng này cộng thẳng điểm đề xuất.
 */
export function AdjustmentBuilderView() {
  const templatesSwr = useSWR(formTemplateKeys.all, fetchFormTemplatesAll);
  const summarySwr = useSWR(adjustmentKeys.summary, fetchAdjustmentSummary);
  const templates = useMemo(() => templatesSwr.data ?? [], [templatesSwr.data]);

  const bySection = useMemo(() => {
    const out = {} as Record<AdjustmentSection, FormTemplate | null>;
    for (const section of ADJUSTMENT_SECTIONS) {
      out[section] =
        templates.find((template) => template.forAdjustment === section) ??
        null;
    }
    return out;
  }, [templates]);

  const [section, setSection] = useState<AdjustmentSection>("BONUS");
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [draftSavedFp, setDraftSavedFp] = useState("");
  const [loadedSection, setLoadedSection] = useState<AdjustmentSection | null>(
    null,
  );
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [structureOpen, setStructureOpen] = useState(false);
  const [pendingSection, setPendingSection] =
    useState<AdjustmentSection | null>(null);
  const [saving, setSaving] = useState(false);

  /*
    Nạp bộ cột khi ĐỔI phần, ngay trong render - không qua effect để khỏi chớp
    một nhịp canvas rỗng. Bám `loadedSection` chứ không bám mỗi lượt cache làm
    mới, nếu không thay đổi đang gõ dở bị xoá.
  */
  if (!templatesSwr.isLoading && loadedSection !== section) {
    const meta = ADJUSTMENT_SECTION_META[section];
    const current = bySection[section];
    let next = draftFromTemplate(current, `${meta.title} (${meta.numeral})`);
    // Chưa có mẫu thì bày sẵn bộ cột theo mẫu giấy, quản trị chỉnh rồi lưu.
    if (!current) next = { ...next, ...createDefaultAdjustmentDraft(section) };
    setLoadedSection(section);
    setDraft(next);
    setDraftSavedFp(draftFingerprint(next));
    setSelectedFieldId(next.columns[0]?.id ?? null);
  }

  const meta = ADJUSTMENT_SECTION_META[section];
  const dirty = !!draft && draftFingerprint(draft) !== draftSavedFp;

  const requestSection = (next: AdjustmentSection) => {
    if (next === section) return;
    if (dirty) setPendingSection(next);
    else setSection(next);
  };

  const save = async () => {
    if (!draft) return;
    const clean = sanitizeDraft(draft);
    if (!clean.columns.length) {
      toast.error(`${meta.title}: form phải có ít nhất một trường.`);
      return;
    }
    if (clean.columns.some((column) => !column.title)) {
      toast.error(`${meta.title}: còn trường chưa đặt nhãn hiển thị.`);
      return;
    }
    const payload: FormTemplateInput = {
      name: clean.name.trim() || `${meta.title} (${meta.numeral})`,
      columns: clean.columns,
      headerGroups: clean.headerGroups,
      footer: clean.footer,
      axisIds: [],
      forCriteria: false,
      forAdjustment: section,
    };

    setSaving(true);
    try {
      const saved = clean.templateId
        ? await updateFormTemplate(clean.templateId, payload)
        : await createFormTemplate(payload);
      const next: FormDraft = { ...clean, templateId: entityId(saved) };
      setDraft(next);
      setDraftSavedFp(draftFingerprint(next));
      await templatesSwr.mutate();
      await refreshDownstreamCaches();
      toast.success(`Đã lưu form phần ${meta.numeral}.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được form."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Về danh sách">
            <Link href={LIST_HREF}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-400">
            <Scale className="size-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold tracking-tight">
              Bảng đề xuất điểm cộng, điểm trừ &amp; xếp loại
            </h1>
            <p className="text-sm text-muted-foreground">
              Mẫu báo cáo riêng, không thuộc mẫu KPI theo năm. Ba phần I / II /
              III là ba form; đội nhập mỗi tháng một bản theo đúng bộ cột ở đây.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={save}
          disabled={saving || !dirty || !draft}
        >
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {dirty ? "Lưu form này" : "Đã lưu"}
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        {/* Thư viện: đúng ba phần, không trục, không ô tích ghép mẫu. */}
        <aside className="min-w-0 space-y-3 rounded-xl border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
          <div className="space-y-1">
            <h2 className="font-display text-base font-semibold">Ba phần</h2>
            <p className="text-xs text-muted-foreground">
              Chọn phần để dựng form. Nửa trái chép từ danh mục Điểm cộng, trừ
              &amp; xếp loại; nửa phải là ô đội điền.
            </p>
          </div>
          <div className="space-y-0.5">
            {ADJUSTMENT_SECTIONS.map((value) => {
              const item = ADJUSTMENT_SECTION_META[value];
              const template = bySection[value];
              const active = value === section;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => requestSection(value)}
                  className={cn(
                    "flex w-full min-w-0 items-start gap-2 rounded-lg border-l-2 px-2 py-2.5 text-left transition-colors",
                    active
                      ? "border-l-amber-500 bg-amber-500/5"
                      : "border-l-transparent hover:bg-accent/50",
                  )}
                >
                  <span className="w-6 shrink-0 text-center text-xs font-bold text-amber-700 dark:text-amber-400">
                    {item.numeral}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {summarySwr.data?.counts[value] ?? 0} mục ·{" "}
                      {template
                        ? `${template.columns?.length ?? 0} trường · bản ${template.version}`
                        : "Chưa dựng form"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Danh mục các mục (nội dung, điều kiện, tối đa) khai ở{" "}
            <Link
              href="/mission/form-config/adjustments"
              className="font-medium text-primary underline underline-offset-2"
            >
              Điểm cộng, trừ &amp; xếp loại
            </Link>
            .
          </p>
        </aside>

        {draft ? (
          <section className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate font-display text-base font-semibold">
                  {meta.numeral}. {meta.title}
                </h2>
                <Badge variant="outline" className="shrink-0 font-normal">
                  {section === "BONUS"
                    ? "trần theo từng mục"
                    : section === "PENALTY"
                      ? "điểm trừ theo lần"
                      : "không có điểm"}
                </Badge>
                <Badge variant="outline" className="shrink-0 font-normal">
                  {draft.columns.length} trường
                </Badge>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setStructureOpen(true)}
              >
                <LayoutGrid className="size-4" />
                Xem cấu trúc trường
              </Button>
            </div>

            <div className="space-y-4 rounded-xl border bg-card p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">
                  Thiết kế trường dữ liệu · {meta.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Ba trường ánh xạ &quot;Nội dung&quot;, &quot;Điều kiện, mức
                  điểm&quot;, &quot;Tối đa&quot; lấy chữ từ danh mục, đội chỉ
                  đọc. Cột điểm cộng khai dải theo &quot;Tối đa&quot; để hệ
                  thống chặn vượt trần theo mục.
                </p>
              </div>
              <FieldDesigner
                blockLabel={meta.title}
                columns={draft.columns}
                headerGroups={draft.headerGroups}
                selectedId={selectedFieldId}
                onSelect={setSelectedFieldId}
                onColumnsChange={(columns) =>
                  setDraft((prev) => (prev ? { ...prev, columns } : prev))
                }
                onFillDefault={() => {
                  const seed = createDefaultAdjustmentDraft(section);
                  setDraft((prev) => (prev ? { ...prev, ...seed } : prev));
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

            {/* Quyền nhập là của CẢ bảng, không theo phần - nên đứng dưới cùng,
                ngoài vùng đổi theo phần I / II / III. */}
            <AdjustmentAccessCard />
          </section>
        ) : (
          <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Đang tải...
          </div>
        )}
      </div>

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

      <AlertDialog
        open={!!pendingSection}
        onOpenChange={(open) => !open && setPendingSection(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bỏ thay đổi chưa lưu?</AlertDialogTitle>
            <AlertDialogDescription>
              Form phần {meta.numeral} còn thay đổi chưa lưu. Chuyển phần khác
              là mất phần vừa sửa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ở lại</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSection) setSection(pendingSection);
                setPendingSection(null);
              }}
            >
              Bỏ và chuyển
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
