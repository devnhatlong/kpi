"use client";

import { useMemo } from "react";
import { Building2, Plus, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MultiSelect } from "@/components/common/multi-select";
import {
  blankCommendationRow,
  type CommendationDepartmentChoice,
  type CommendationRow,
} from "@/features/team-report/commendation";
import { cn } from "@/lib/utils";

/** Giá trị giả trong ô chọn đơn vị = "Không có đơn vị". */
const NO_UNIT = "__no_unit__";

/* Ô chữ tự giãn theo nội dung, trống thì cao đúng một dòng. */
const TEXT_CELL =
  "min-h-9 resize-none py-[7px] leading-5 [field-sizing:content] bg-background";

const TH =
  "border bg-muted/50 px-2 py-2 text-left align-middle text-xs font-semibold";
const TD = "border px-2 py-1.5 align-top";

/**
 * Hai bảng của mẫu "Bảng tổng hợp nội dung biểu dương, phê bình, chấn chỉnh" -
 * dựng đúng cột như bản Word. Dùng chung cho phòng lập (sửa được) và các đội
 * nhận (chỉ đọc).
 *
 * Bảng biểu dương gom theo NHÓM NỘI DUNG như mẫu: mỗi nhóm một khối, thêm dòng
 * ngay dưới nhóm - không bắt người nhập chọn lại nhóm cho từng dòng.
 */
export function CommendationTables({
  praises,
  criticisms,
  criteria,
  departmentChoices = [],
  editable,
  onChange,
  sourceTags = false,
  ownerName = "",
}: {
  /** Đơn vị lập bảng (phòng) - nhãn nguồn của dòng phòng tự nhập. */
  ownerName?: string;
  praises: CommendationRow[];
  criticisms: CommendationRow[];
  criteria: Array<{ id: string; name: string }>;
  departmentChoices?: CommendationDepartmentChoice[];
  editable: boolean;
  /**
   * Bày nhãn nguồn ở mọi dòng ("Đội X đề xuất" / "Phòng nhập") - bảng của
   * phòng có lấy dòng từ các đội. Không truyền thì tự bật khi có dòng lấy từ
   * đội (màn nhận đọc bảng của phòng).
   */
  sourceTags?: boolean;
  onChange?: (next: {
    praises: CommendationRow[];
    criticisms: CommendationRow[];
  }) => void;
}) {
  const showSource =
    sourceTags || [...praises, ...criticisms].some((row) => !!row.sourceName);
  const options = useMemo(
    () => [
      // Chọn tường minh khi dòng không nêu đơn vị nào (VD tháng này không có).
      {
        value: NO_UNIT,
        label: "Không có đơn vị",
        hint: "Không nêu đơn vị nào",
        keywords: "khong co don vi",
      },
      ...departmentChoices.map((choice) => ({
        value: choice.id,
        label: choice.name,
        hint: choice.group,
        keywords: choice.code,
      })),
    ],
    [departmentChoices],
  );

  // Nhóm theo danh mục, cộng nhóm cũ chỉ còn trong bản đã lưu.
  const groups = useMemo(() => {
    const list = criteria.map((item) => ({ ...item }));
    for (const row of praises) {
      if (row.itemId && !list.some((item) => item.id === row.itemId)) {
        list.push({ id: row.itemId, name: row.itemName });
      }
    }
    return list;
  }, [criteria, praises]);

  const setPraises = (next: CommendationRow[]) =>
    onChange?.({ praises: next, criticisms });
  const setCriticisms = (next: CommendationRow[]) =>
    onChange?.({ praises, criticisms: next });

  /** Ô đơn vị: chọn nhiều khi sửa, chữ nối khi đọc. */
  const unitsCell = (
    row: CommendationRow,
    patch: (next: Partial<CommendationRow>) => void,
    label: string,
  ) => (
    <>
      {unitsInput(row, patch, label)}
      {/* Nguồn của dòng: đội nào đề xuất (trưởng phòng lấy từ bảng đội) hay
          phòng tự nhập. Chỉ bày ở bảng có trộn hai nguồn - bảng của đội thì
          mọi dòng đều của đội, ghi ra là thừa. */}
      {showSource ? (
        <SourceTag name={row.sourceName} ownerName={ownerName} />
      ) : null}
    </>
  );

  const unitsInput = (
    row: CommendationRow,
    patch: (next: Partial<CommendationRow>) => void,
    label: string,
  ) =>
    editable ? (
      <MultiSelect
        value={row.noUnit ? [NO_UNIT] : row.departmentIds}
        onValueChange={(ids) => {
          /* "Không có đơn vị" loại trừ các đơn vị khác: vừa chọn nó thì bỏ
             hết đơn vị; đang có nó mà chọn thêm đơn vị thì bỏ nó đi. */
          const picked = ids.includes(NO_UNIT) && !row.noUnit;
          patch(
            picked
              ? { departmentIds: [], noUnit: true }
              : {
                  departmentIds: ids.filter((id) => id !== NO_UNIT),
                  noUnit: false,
                },
          );
        }}
        options={options}
        searchPlaceholder="Gõ mã hoặc tên đơn vị…"
        triggerClassName={cn(
          !row.departmentIds.length && !row.noUnit && "border-dashed",
        )}
        placeholder={`Chọn ${label.toLowerCase()}…`}
      />
    ) : (
      <span className="text-sm">
        {row.noUnit
          ? "Không có đơn vị"
          : row.departmentNames.join(", ") || "-"}
      </span>
    );

  const textCell = (
    value: string,
    onText: (text: string) => void,
    label: string,
    placeholder: string,
  ) =>
    editable ? (
      <Textarea
        value={value}
        rows={1}
        aria-label={label}
        placeholder={placeholder}
        className={TEXT_CELL}
        onChange={(event) => onText(event.target.value)}
      />
    ) : (
      <span className="whitespace-pre-wrap text-sm">{value || "-"}</span>
    );

  const noteCell = (value: string, onText: (text: string) => void) =>
    editable ? (
      <Input
        value={value}
        aria-label="Ghi chú"
        className="h-9 bg-background"
        onChange={(event) => onText(event.target.value)}
      />
    ) : (
      <span className="text-sm">{value || ""}</span>
    );

  const removeButton = (onClick: () => void) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-9"
      aria-label="Xoá dòng"
      onClick={onClick}
    >
      <Trash2 className="size-4 text-muted-foreground" />
    </Button>
  );

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ 1. biểu dương */}
      <section className="space-y-2">
        <h3 className="font-display text-sm font-semibold">
          1. Bảng nội dung biểu dương
        </h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[64rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(TH, "w-10 text-center")}>TT</th>
                <th className={cn(TH, "w-56")}>
                  Nhóm nội dung đề xuất biểu dương
                </th>
                <th className={cn(TH, "w-64")}>
                  Đơn vị, địa phương được biểu dương
                </th>
                <th className={TH}>
                  Nội dung, kết quả nổi bật
                  <span className="block font-normal text-muted-foreground">
                    đã có văn bản ghi nhận hoặc đề xuất biểu dương
                  </span>
                </th>
                <th className={cn(TH, "w-56")}>Căn cứ, tài liệu kiểm chứng</th>
                <th className={cn(TH, "w-36")}>Ghi chú</th>
                {editable ? <th className={cn(TH, "w-11")} /> : null}
              </tr>
            </thead>
            <tbody>
              {groups.map((group, groupIndex) => {
                const rows = praises
                  .map((row, index) => ({ row, index }))
                  .filter(({ row }) => row.itemId === group.id);
                const span = Math.max(1, rows.length) + (editable ? 1 : 0);
                const patch = (index: number, next: Partial<CommendationRow>) =>
                  setPraises(
                    praises.map((row, i) =>
                      i === index ? { ...row, ...next } : row,
                    ),
                  );
                const lead = (
                  <>
                    <td
                      rowSpan={span}
                      className={cn(TD, "text-center tabular-nums")}
                    >
                      {groupIndex + 1}
                    </td>
                    <td rowSpan={span} className={cn(TD, "font-medium")}>
                      {group.name}
                    </td>
                  </>
                );
                return (
                  <FragmentRows key={group.id}>
                    {rows.length ? (
                      rows.map(({ row, index }, i) => (
                        <tr key={row._id ?? `new-${index}`}>
                          {i === 0 ? lead : null}
                          <td className={TD}>
                            {unitsCell(
                              row,
                              (next) => patch(index, next),
                              "đơn vị được biểu dương",
                            )}
                          </td>
                          <td className={TD}>
                            {textCell(
                              row.content,
                              (content) => patch(index, { content }),
                              "Nội dung, kết quả nổi bật",
                              "Nêu nhiệm vụ, chỉ tiêu, kết quả vượt, hoàn thành sớm, mô hình hiệu quả…",
                            )}
                          </td>
                          <td className={TD}>
                            {textCell(
                              row.evidence,
                              (evidence) => patch(index, { evidence }),
                              "Căn cứ, tài liệu kiểm chứng",
                              "Số, ngày văn bản; báo cáo; kết quả kiểm tra…",
                            )}
                          </td>
                          <td className={TD}>
                            {noteCell(row.note, (note) =>
                              patch(index, { note }),
                            )}
                          </td>
                          {editable ? (
                            <td className={TD}>
                              {removeButton(() =>
                                setPraises(
                                  praises.filter((_, j) => j !== index),
                                ),
                              )}
                            </td>
                          ) : null}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        {lead}
                        <td
                          colSpan={editable ? 5 : 4}
                          className={cn(
                            TD,
                            "text-xs italic text-muted-foreground",
                          )}
                        >
                          Chưa có nội dung biểu dương ở nhóm này.
                        </td>
                      </tr>
                    )}
                    {editable ? (
                      <tr>
                        <td colSpan={5} className={cn(TD, "py-1.5")}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 bg-background"
                            onClick={() =>
                              setPraises([
                                ...praises,
                                {
                                  ...blankCommendationRow(),
                                  itemId: group.id,
                                  itemName: group.name,
                                },
                              ])
                            }
                          >
                            <Plus className="size-3.5" aria-hidden="true" />
                            Thêm dòng biểu dương
                          </Button>
                        </td>
                      </tr>
                    ) : null}
                  </FragmentRows>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------- 2. phê bình, chấn chỉnh */}
      <section className="space-y-2">
        <h3 className="font-display text-sm font-semibold">
          2. Bảng nội dung phê bình, chấn chỉnh
        </h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr>
                <th className={cn(TH, "w-10 text-center")}>TT</th>
                <th className={cn(TH, "w-64")}>
                  Đơn vị, địa phương bị đề xuất phê bình, chấn chỉnh
                </th>
                <th className={TH}>
                  Nội dung tồn tại, hạn chế
                  <span className="block font-normal text-muted-foreground">
                    đã có văn bản thể hiện hoặc cần phê bình, chấn chỉnh
                  </span>
                </th>
                <th className={cn(TH, "w-56")}>Căn cứ, tài liệu kiểm chứng</th>
                <th className={cn(TH, "w-36")}>Ghi chú</th>
                {editable ? <th className={cn(TH, "w-11")} /> : null}
              </tr>
            </thead>
            <tbody>
              {criticisms.length === 0 ? (
                <tr>
                  <td
                    colSpan={editable ? 6 : 5}
                    className={cn(TD, "text-xs italic text-muted-foreground")}
                  >
                    Chưa có nội dung phê bình, chấn chỉnh.
                  </td>
                </tr>
              ) : null}
              {criticisms.map((row, index) => {
                const patch = (next: Partial<CommendationRow>) =>
                  setCriticisms(
                    criticisms.map((item, i) =>
                      i === index ? { ...item, ...next } : item,
                    ),
                  );
                return (
                  <tr key={row._id ?? `new-${index}`}>
                    <td className={cn(TD, "text-center tabular-nums")}>
                      {index + 1}
                    </td>
                    <td className={TD}>
                      {unitsCell(row, patch, "đơn vị bị phê bình")}
                    </td>
                    <td className={TD}>
                      {textCell(
                        row.content,
                        (content) => patch({ content }),
                        "Nội dung tồn tại, hạn chế",
                        "Nhiệm vụ trễ hạn, không hoàn thành, vi phạm chế độ báo cáo…",
                      )}
                    </td>
                    <td className={TD}>
                      {textCell(
                        row.evidence,
                        (evidence) => patch({ evidence }),
                        "Căn cứ, tài liệu kiểm chứng",
                        "Số, ngày văn bản; qua theo dõi chỉ tiêu…",
                      )}
                    </td>
                    <td className={TD}>
                      {noteCell(row.note, (note) => patch({ note }))}
                    </td>
                    {editable ? (
                      <td className={TD}>
                        {removeButton(() =>
                          setCriticisms(
                            criticisms.filter((_, j) => j !== index),
                          ),
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {editable ? (
                <tr>
                  <td colSpan={6} className={cn(TD, "py-1.5")}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 bg-background"
                      onClick={() =>
                        setCriticisms([...criticisms, blankCommendationRow()])
                      }
                    >
                      <Plus className="size-3.5" aria-hidden="true" />
                      Thêm dòng phê bình
                    </Button>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Nhãn nguồn của một dòng: đội nào đề xuất, hoặc phòng lập bảng tự nhập. */
function SourceTag({ name, ownerName }: { name?: string; ownerName: string }) {
  if (name) {
    // "Đội X - Phòng Y" → chỉ giữ tên đội cho gọn; tên đầy đủ ở tooltip.
    const team = name.split(" - ")[0] ?? name;
    return (
      <span
        title={`${name} đề xuất`}
        className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300"
      >
        <Users className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{team} đề xuất</span>
      </span>
    );
  }
  return (
    <span
      title={ownerName ? `${ownerName} đề xuất` : undefined}
      className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
    >
      <Building2 className="size-3 shrink-0" aria-hidden="true" />
      <span className="truncate">
        {ownerName ? `${ownerName} đề xuất` : "Phòng đề xuất"}
      </span>
    </span>
  );
}

/** Nhóm nhiều `<tr>` mà không thêm phần tử DOM - `<tbody>` không nhận `<div>`. */
function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
