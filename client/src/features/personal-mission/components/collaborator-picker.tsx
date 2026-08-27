"use client";

import { useMemo, useState } from "react";
import { Check, Plus, Search, Users, X } from "lucide-react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  colleagueKeys,
  fetchColleagues,
} from "@/features/personal-mission/api";
import { missionTone } from "@/features/personal-mission/status-styles";
import { cn } from "@/lib/utils";

type CollaboratorPickerProps = {
  /** Id đã chọn - nguồn sự thật nằm ở bản nháp của việc. */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /**
   * Chỉ một nút biểu tượng kèm số lượng, không nhãn cũng không huy hiệu.
   *
   * Dành cho ô trong bảng: bảng báo cáo ngày đã tràn ngang sẵn, nhét thêm một
   * cột chữ nữa là phải cuộn mới thấy hết. Bấm vào vẫn ra đúng popover đó.
   */
  compact?: boolean;
};

/**
 * Chọn cán bộ phối hợp cho một việc.
 *
 * KHÔNG có ô chọn "người xử lý chính": người đó luôn là người đang khai nhiệm
 * vụ. Bày ra một dropdown mà chỉ có đúng một lựa chọn thì vừa thừa vừa gợi ý
 * sai rằng khai hộ người khác được.
 *
 * Danh sách người tải MỘT LẦN rồi lọc tại chỗ: đơn vị lớn nhất trong hệ thống
 * cũng chỉ vài trăm người, gọi lại server sau mỗi ký tự gõ thì ô tìm kiếm giật
 * mà chẳng nhanh hơn.
 */
export function CollaboratorPicker({
  value,
  onChange,
  disabled,
  compact,
}: CollaboratorPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  /*
    Tải khi popover mở HOẶC khi đã có người được chọn sẵn.

    Vế thứ hai mới là chỗ quan trọng: mở lại một nhiệm vụ đã lưu thì bản nháp
    chỉ mang id, phải có danh sách mới tra ra tên - thiếu nó thì huy hiệu hiện
    "Cán bộ đã chọn" cho tới khi người dùng bấm mở popover.

    Việc trống chưa chọn ai thì không gọi gì. Mọi thẻ việc dùng chung một khoá
    SWR nên dù phiếu nhập có ba chục dòng cũng chỉ một lượt gọi.
  */
  const { data, isLoading } = useSWR(
    open || value.length ? colleagueKeys.all : null,
    () => fetchColleagues(),
  );
  const people = useMemo(() => data?.people ?? [], [data]);

  const nameById = useMemo(
    () => new Map(people.map((person) => [person.id, person.fullName])),
    [people],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((person) =>
      `${person.fullName} ${person.rank} ${person.departmentName}`
        .toLowerCase()
        .includes(needle),
    );
  }, [people, query]);

  const toggle = (id: string) => {
    onChange(
      value.includes(id) ? value.filter((item) => item !== id) : [...value, id],
    );
  };

  /** Ruột popover - hai kiểu vỏ dùng chung đúng một danh sách này. */
  const pickerList = (
    <PopoverContent align="start" className="w-72 p-0">
      <div className="border-b p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-sm"
            placeholder="Tìm cán bộ..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="max-h-64 overflow-auto p-1">
        {isLoading ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Đang tải danh sách...
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {query.trim()
              ? "Không có cán bộ nào khớp."
              : "Không có cán bộ nào trong đơn vị bạn."}
          </p>
        ) : (
          filtered.map((person) => {
            const picked = value.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                onClick={() => toggle(person.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  picked && "bg-accent/60",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    {person.rank ? (
                      <span className="text-muted-foreground">
                        {person.rank}{" "}
                      </span>
                    ) : null}
                    {person.fullName}
                  </span>
                  {person.departmentName ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {person.departmentName}
                    </span>
                  ) : null}
                </span>
                {picked ? (
                  <Check
                    className={cn("size-4 shrink-0", missionTone.success.text)}
                  />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </PopoverContent>
  );

  /*
    Kiểu gọn: một nút biểu tượng kèm số lượng, mở ra đúng popover của kiểu đầy
    đủ. Tách nhánh ngay ở đây thay vì bọc điều kiện quanh từng mảnh - hai kiểu
    khác nhau ở phần vỏ chứ không ở phần chọn người.
  */
  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled}
            className="relative size-8"
            title={
              value.length
                ? `${value.length} cán bộ phối hợp`
                : "Chưa có cán bộ phối hợp"
            }
            aria-label="Cán bộ phối hợp"
          >
            <Users
              className={cn(
                "size-4",
                value.length ? missionTone.success.text : undefined,
              )}
            />
            {value.length ? (
              <span
                className={cn(
                  "absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full text-[10px] font-bold tabular-nums",
                  missionTone.success.soft,
                )}
              >
                {value.length}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        {pickerList}
      </Popover>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Users className="size-3.5" />
        Cán bộ phối hợp
        <span className="font-normal normal-case italic">(không bắt buộc)</span>
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((id) => (
          <Badge
            key={id}
            variant="secondary"
            className={cn("gap-1 py-1 font-normal", missionTone.success.soft)}
          >
            {/*
              Ba trạng thái khác nhau, đừng gộp làm một: đang tải thì nói đang
              tải, tra không ra thì nói tài khoản không còn - "Cán bộ đã chọn"
              chung chung khiến người dùng tưởng hệ thống hỏng.
            */}
            {nameById.get(id) ??
              (isLoading ? "Đang tải..." : "Cán bộ không còn")}
            {!disabled ? (
              <button
                type="button"
                onClick={() => toggle(id)}
                className="cursor-pointer opacity-60 hover:opacity-100"
                aria-label="Bỏ cán bộ phối hợp"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </Badge>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              className="h-7 border-dashed bg-background px-2 text-xs"
            >
              <Plus className="size-3.5" />
              Thêm phối hợp
            </Button>
          </PopoverTrigger>
          {pickerList}
        </Popover>
      </div>
    </div>
  );
}
