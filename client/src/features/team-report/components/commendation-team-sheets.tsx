"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Award,
  Check,
  ChevronRight,
  Plus,
  TriangleAlert,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import { Button } from "@/components/ui/button";
import {
  rowFromTeam,
  type CommendationRow,
  type CommendationTeamSheet,
} from "@/features/team-report/commendation";
import { DAY_STATUS_CLASS } from "@/features/team-report/status-styles";
import { stagedStatusLabel } from "@/features/team-report/types";
import { formatServerHm } from "@/lib/server-time";
import { cn } from "@/lib/utils";

/** "Đội X - Phòng Y" → tên đội đứng riêng, phòng làm dòng phụ. */
function splitTeamName(label: string) {
  const at = label.indexOf(" - ");
  return at < 0
    ? { team: label, parent: "" }
    : { team: label.slice(0, at), parent: label.slice(at + 3) };
}

/**
 * Ghi chú của đội thường là mức đề xuất ("+2", "-1", "đề nghị trừ 1 điểm"):
 * tô theo dấu để liếc là thấy cộng hay trừ.
 */
function NoteChip({ note }: { note: string }) {
  const text = note.trim();
  if (!text) return null;
  const tone = /^\+/.test(text)
    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
    : /^[-−]/.test(text)
      ? "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
      : "border-border bg-muted/50 text-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums",
        tone,
      )}
    >
      {text}
    </span>
  );
}

/**
 * "Đề xuất của các đội trong phòng" - trưởng phòng soi bảng các đội gửi lên
 * và LẤY DÒNG vào bảng của phòng thay vì gõ lại.
 *
 * Chỉ lấy được từ bảng ĐÃ DUYỆT: duyệt là trưởng phòng đã xem và chấp nhận đề
 * xuất của đội; bảng còn chờ thì bày để biết, kèm lối sang hộp đến duyệt.
 * Dòng đã lấy ghi nguồn (đội nào) và không lấy trùng được.
 */
export function CommendationTeamSheets({
  sheets,
  praises,
  criticisms,
  editable,
  onTake,
}: {
  sheets: CommendationTeamSheet[];
  praises: CommendationRow[];
  criticisms: CommendationRow[];
  editable: boolean;
  onTake: (next: {
    praises: CommendationRow[];
    criticisms: CommendationRow[];
  }) => void;
}) {
  const taken = new Set(
    [...praises, ...criticisms]
      .map((row) => row.sourceRowId)
      .filter((id): id is string => !!id),
  );
  const approved = sheets.filter((sheet) => sheet.status === "APPROVED");
  const pending = sheets.filter((sheet) => sheet.status === "PENDING");
  const untaken = approved.reduce(
    (sum, sheet) =>
      sum +
      [...sheet.praises, ...sheet.criticisms].filter(
        (row) => row._id && !taken.has(row._id),
      ).length,
    0,
  );
  // Mở sẵn khi còn dòng chưa lấy - đó là việc đang chờ trưởng phòng.
  const [open, setOpen] = useState(untaken > 0);
  /* Mặc định "Chưa lấy": việc trưởng phòng đang phải làm; dòng lấy xong tự
     rời khỏi danh sách nên khối co lại dần thay vì dài mãi. */
  const [filter, setFilter] = useState<RowFilter>(untaken > 0 ? "TODO" : "ALL");

  if (!sheets.length) return null;

  const all = sheets.flatMap((sheet) => [
    ...sheet.praises.map((row) => ({ row, praise: true })),
    ...sheet.criticisms.map((row) => ({ row, praise: false })),
  ]);
  const counts: Record<RowFilter, number> = {
    TODO: all.filter(({ row }) => !row._id || !taken.has(row._id)).length,
    PRAISE: all.filter(({ praise }) => praise).length,
    CRITICISM: all.filter(({ praise }) => !praise).length,
    ALL: all.length,
  };

  const take = (sheet: CommendationTeamSheet, rows?: CommendationRow[]) => {
    const pick = (list: CommendationRow[]) =>
      list
        .filter((row) => row._id && !taken.has(row._id))
        .filter((row) => !rows || rows.includes(row))
        .map((row) => rowFromTeam(row, sheet.departmentName));
    onTake({
      praises: [...praises, ...pick(sheet.praises)],
      criticisms: [...criticisms, ...pick(sheet.criticisms)],
    });
  };

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      {/* --------------------------------------------------- đầu khối */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
          <Users className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-semibold">
            Đề xuất của các đội trong phòng
          </span>
          <span className="block text-xs text-muted-foreground">
            Lấy dòng từ bảng các đội đã duyệt vào bảng của phòng - không phải gõ
            lại.
          </span>
        </span>
        <span className="hidden shrink-0 items-center gap-2 sm:flex">
          <Badge variant="secondary" className="font-normal tabular-nums">
            {sheets.length} bảng
          </Badge>
          {untaken > 0 ? (
            <Badge
              variant="secondary"
              className="border-sky-300 bg-sky-50 font-medium tabular-nums text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
            >
              {untaken} dòng chưa lấy
            </Badge>
          ) : approved.length ? (
            <Badge
              variant="secondary"
              className="gap-1 border-emerald-300 bg-emerald-50 font-medium text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <Check className="size-3" aria-hidden="true" />
              Đã lấy hết
            </Badge>
          ) : null}
        </span>
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t bg-muted/20 p-3">
          {pending.length ? (
            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <TriangleAlert
                className="mt-0.5 size-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>
                <strong className="font-semibold">{pending.length} bảng</strong>{" "}
                đang chờ bạn duyệt - duyệt ở{" "}
                <Link
                  href="/team-report/commendations/incoming"
                  className="font-medium underline underline-offset-4"
                >
                  Theo dõi biểu dương, phê bình
                </Link>{" "}
                rồi mới lấy dòng vào bảng của phòng được.
              </span>
            </p>
          ) : null}

          <SegmentedTabs
            ariaLabel="Lọc đề xuất của các đội"
            value={filter}
            onChange={setFilter}
            className="flex-wrap"
            items={(
              [
                ["TODO", "Chưa lấy"],
                ["PRAISE", "Biểu dương"],
                ["CRITICISM", "Phê bình"],
                ["ALL", "Tất cả"],
              ] as const
            ).map(([value, label]) => ({
              value,
              label: (
                <span className="tabular-nums">
                  {label}{" "}
                  <span className="text-xs text-muted-foreground">
                    {counts[value]}
                  </span>
                </span>
              ),
            }))}
          />

          {/* Khung CAO CỐ ĐỊNH, cuộn bên trong: nhiều đội nhiều dòng thì cuộn
              ở đây, bảng của phòng ngay dưới không bị đẩy tụt xuống. */}
          <div className="max-h-[30rem] space-y-3 overflow-y-auto overscroll-contain pr-1">
            {counts[filter] === 0 ? (
              <p className="rounded-md border border-dashed bg-background px-3 py-6 text-center text-sm text-muted-foreground">
                {filter === "TODO"
                  ? "Đã lấy hết đề xuất của các đội."
                  : "Không có dòng nào."}
              </p>
            ) : null}
            {sheets.map((sheet) => (
              <TeamSheetCard
                key={sheet._id}
                sheet={sheet}
                taken={taken}
                filter={filter}
                editable={editable}
                onTake={(rows) => take(sheet, rows)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

type RowFilter = "TODO" | "PRAISE" | "CRITICISM" | "ALL";

/** Bảng của MỘT đội: đầu thẻ (đội, phòng, lúc gửi, trạng thái) + các dòng. */
function TeamSheetCard({
  sheet,
  taken,
  filter,
  editable,
  onTake,
}: {
  sheet: CommendationTeamSheet;
  taken: Set<string>;
  filter: RowFilter;
  editable: boolean;
  /** Không truyền dòng = lấy tất cả dòng chưa lấy. */
  onTake: (rows?: CommendationRow[]) => void;
}) {
  const { team, parent } = splitTeamName(sheet.departmentName);
  const all = [
    ...sheet.praises.map((row) => ({ row, praise: true })),
    ...sheet.criticisms.map((row) => ({ row, praise: false })),
  ];
  const left = all.filter(({ row }) => row._id && !taken.has(row._id)).length;
  const ready = sheet.status === "APPROVED";
  const rows = all.filter(({ row, praise }) =>
    filter === "TODO"
      ? !row._id || !taken.has(row._id)
      : filter === "PRAISE"
        ? praise
        : filter === "CRITICISM"
          ? !praise
          : true,
  );
  /* Đội đã lấy hết thì gọn lại một dòng - bấm mới xổ ra xem lại. */
  const [expanded, setExpanded] = useState(!(ready && left === 0));

  // Lọc ra không còn dòng nào của đội này thì ẩn cả thẻ cho đỡ rối.
  if (!rows.length) return null;

  return (
    <article className="overflow-hidden rounded-md border bg-background shadow-xs">
      <header
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3",
          expanded && "border-b",
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "Thu gọn" : "Xem các dòng"}
          onClick={() => setExpanded((value) => !value)}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ChevronRight
            className={cn(
              "size-4 transition-transform",
              expanded && "rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Đề xuất của</p>
          <h4 className="truncate text-sm font-semibold">{team}</h4>
          <p className="text-xs text-muted-foreground tabular-nums">
            {parent ? `${parent} · ` : ""}
            {sheet.praises.length} biểu dương · {sheet.criticisms.length} phê
            bình
            {sheet.sentAt ? ` · gửi lúc ${formatServerHm(sheet.sentAt)}` : ""}
          </p>
        </div>
        <Badge
          variant="secondary"
          className={cn("font-normal", DAY_STATUS_CLASS[sheet.status])}
        >
          {stagedStatusLabel(sheet)}
        </Badge>
        {editable && ready && left > 0 ? (
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => onTake()}
          >
            <Plus className="size-3.5" aria-hidden="true" />
            Lấy tất cả ({left})
          </Button>
        ) : ready && !left ? (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="size-3.5" aria-hidden="true" />
            Đã lấy hết
          </span>
        ) : null}
      </header>

      {expanded ? (
        <ul className="divide-y">
          {rows.map(({ row, praise }) => {
            const done = !!row._id && taken.has(row._id);
            return (
              <li
                key={row._id ?? row.content}
                className={cn(
                  "grid gap-3 px-4 py-3 sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-start",
                  done && "bg-muted/30",
                )}
              >
                {/* Loại dòng - nhãn có biểu tượng, không chỉ dựa vào màu. */}
                <span
                  className={cn(
                    "inline-flex w-fit items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                    praise
                      ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                      : "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
                  )}
                >
                  {praise ? (
                    <Award className="size-3.5" aria-hidden="true" />
                  ) : (
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                  )}
                  {praise ? "Biểu dương" : "Phê bình"}
                </span>

                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold">
                      {row.departmentNames.join(", ") || "-"}
                    </span>
                    {praise && row.itemName ? (
                      <span className="rounded border bg-muted/50 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {row.itemName}
                      </span>
                    ) : null}
                  </div>
                  {/* Mỗi trường một dòng có NHÃN đúng tên cột của mẫu - chữ
                    trơn nối nhau thì không biết dòng nào là nội dung, dòng
                    nào là căn cứ. */}
                  <dl
                    className={cn(
                      "grid gap-x-3 gap-y-1 text-sm sm:grid-cols-[11rem_minmax(0,1fr)]",
                      done && "text-muted-foreground",
                    )}
                  >
                    <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">
                      {praise
                        ? "Nội dung, kết quả nổi bật"
                        : "Nội dung tồn tại, hạn chế"}
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {row.content || "-"}
                    </dd>
                    <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">
                      Căn cứ, tài liệu kiểm chứng
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {row.evidence || (
                        <span className="text-xs italic text-muted-foreground">
                          Không ghi
                        </span>
                      )}
                    </dd>
                    {row.note?.trim() ? (
                      <>
                        <dt className="text-xs font-medium text-muted-foreground sm:pt-1">
                          Ghi chú
                        </dt>
                        <dd>
                          <NoteChip note={row.note} />
                        </dd>
                      </>
                    ) : null}
                  </dl>
                </div>

                <div className="sm:justify-self-end">
                  {done ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <Check className="size-3.5" aria-hidden="true" />
                      Đã lấy vào bảng
                    </span>
                  ) : editable && ready ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 bg-background"
                      onClick={() => onTake([row])}
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Lấy vào
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}
