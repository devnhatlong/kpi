"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Loader2, Search, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchPersonalMissionRecipients,
  type PersonalMissionRecipient,
  type SubmitPersonalMissionPayload,
} from "@/features/personal-mission/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NOTE_MAX = 1000;
const DEFAULT_NOTE = "Kính gửi";

type SendRecipientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  submitting?: boolean;
  /**
   * Bảng khối A của tháng có kèm được vào lượt này không.
   *
   * Bày ô tích thay vì tự kèm: bảng A được duyệt riêng, gửi hộ mà không hỏi
   * thì cán bộ không biết mình vừa trình cái gì lên. Mặc định BẬT - chấm bảng
   * rồi thì gần như luôn muốn gửi cùng báo cáo ngày.
   */
  canIncludeCriteria?: boolean;
  criteriaHint?: string;
  onConfirm: (payload: SubmitPersonalMissionPayload) => Promise<void> | void;
};

type RecipientGroup = {
  key: string;
  departmentId: string | null;
  departmentName: string;
  people: PersonalMissionRecipient[];
};

export function SendRecipientDialog({
  open,
  onOpenChange,
  title = "Gửi báo cáo",
  description,
  confirmLabel = "Gửi",
  submitting = false,
  canIncludeCriteria = false,
  criteriaHint,
  onConfirm,
}: SendRecipientDialogProps) {
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<PersonalMissionRecipient[]>([]);
  const [targetRoleLabel, setTargetRoleLabel] = useState("cấp trên");
  const [query, setQuery] = useState("");
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [note, setNote] = useState(DEFAULT_NOTE);
  const [includeCriteria, setIncludeCriteria] = useState(true);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setQuery("");
    setSelectedPersonIds([]);
    setNote(DEFAULT_NOTE);
    setIncludeCriteria(true);
    setLoading(true);

    void (async () => {
      try {
        const data = await fetchPersonalMissionRecipients();
        if (cancelled) return;
        setPeople(data?.people ?? []);
        setTargetRoleLabel("cấp trên");
      } catch (error) {
        if (cancelled) return;
        setPeople([]);
        toast.error(
          getApiErrorMessage(error, "Không tải được danh sách người nhận."),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const filteredPeople = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((item) => {
      const haystack = [
        item.fullName,
        item.username,
        item.departmentName,
        item.departmentCode,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, people]);

  const groups = useMemo(() => {
    const map = new Map<string, RecipientGroup>();
    for (const person of filteredPeople) {
      const key = person.departmentId ?? "__none__";
      const existing = map.get(key);
      if (existing) {
        existing.people.push(person);
        continue;
      }
      map.set(key, {
        key,
        departmentId: person.departmentId,
        departmentName: person.departmentName || "Chưa gắn đơn vị",
        people: [person],
      });
    }
    return Array.from(map.values());
  }, [filteredPeople]);

  const resolvedDescription =
    description ??
    `Chọn ${targetRoleLabel} trong phạm vi đơn vị của bạn (Staff → Manager → Unit Admin).`;

  const noteTrimmed = note.trim();
  const canSubmit = selectedPersonIds.length === 1 && noteTrimmed.length > 0;

  const selectDepartment = (group: RecipientGroup, checked: boolean) => {
    const ids = group.people.map((person) => person.id);
    if (!checked) {
      setSelectedPersonIds((prev) => prev.filter((id) => !ids.includes(id)));
      return;
    }
    // Tích đơn vị → tự tích hết người bên dưới
    setSelectedPersonIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const selectPerson = (person: PersonalMissionRecipient, checked: boolean) => {
    if (!checked) {
      setSelectedPersonIds((prev) => prev.filter((id) => id !== person.id));
      return;
    }
    // Chọn 1 người nhận (exclusive)
    setSelectedPersonIds([person.id]);
  };

  const handleConfirm = async () => {
    if (selectedPersonIds.length === 0) {
      toast.error(`Vui lòng chọn ${targetRoleLabel} nhận báo cáo.`);
      return;
    }
    if (selectedPersonIds.length > 1) {
      toast.error("Chỉ chọn một người nhận.");
      return;
    }
    if (!noteTrimmed) {
      toast.error("Vui lòng nhập nội dung gửi.");
      return;
    }
    await onConfirm({
      recipientId: selectedPersonIds[0]!,
      note: noteTrimmed,
      ...(canIncludeCriteria ? { includeCriteria } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="text-base font-semibold uppercase tracking-wide">
            {title}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{resolvedDescription}</p>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Tìm kiếm theo tên ${targetRoleLabel}`}
              className="pl-9"
              disabled={loading || submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>
              Người nhận <span className="text-destructive">*</span>
            </Label>
            <div className="overflow-hidden rounded-md border">
              <div className="grid grid-cols-[1fr_88px] border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                <span>Tên đơn vị, cá nhân</span>
                <span className="text-center">Chọn</span>
              </div>
              <ScrollArea className="h-[260px]">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tải danh sách...
                  </div>
                ) : groups.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    Không có {targetRoleLabel} nào trong phạm vi của bạn.
                  </div>
                ) : (
                  <div className="divide-y">
                    {groups.map((group) => {
                      const deptChecked =
                        group.people.length > 0 &&
                        group.people.every((person) =>
                          selectedPersonIds.includes(person.id),
                        );
                      return (
                        <div key={group.key}>
                          {/* Hàng là <label> chứ không phải <button>: Checkbox
                              của Radix vốn đã là <button>, lồng hai button vào
                              nhau là HTML sai và gây lỗi hydration. Label bọc
                              checkbox vẫn cho bấm cả hàng để tích. */}
                          <label
                            className={cn(
                              "grid w-full grid-cols-[1fr_88px] items-center px-3 py-2.5 text-left text-sm font-medium hover:bg-muted/40",
                              deptChecked && "bg-primary/5",
                              submitting || group.people.length === 0
                                ? "cursor-default opacity-60"
                                : "cursor-pointer",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <Building2 className="h-4 w-4 shrink-0 text-sky-600" />
                              <span className="truncate">
                                {group.departmentName}
                              </span>
                            </span>
                            <span className="flex justify-center">
                              <Checkbox
                                checked={deptChecked}
                                disabled={
                                  submitting || group.people.length === 0
                                }
                                onCheckedChange={(value) =>
                                  selectDepartment(group, value === true)
                                }
                                aria-label={`Chọn đơn vị ${group.departmentName}`}
                              />
                            </span>
                          </label>
                          {group.people.map((person) => {
                            const personChecked = selectedPersonIds.includes(
                              person.id,
                            );
                            return (
                              <label
                                key={person.id}
                                className={cn(
                                  "grid w-full grid-cols-[1fr_88px] items-center py-2.5 pr-3 pl-8 text-left text-sm hover:bg-muted/40",
                                  personChecked && "bg-primary/5",
                                  submitting
                                    ? "cursor-default opacity-60"
                                    : "cursor-pointer",
                                )}
                              >
                                <span className="flex min-w-0 items-center gap-2 pl-2">
                                  <UserRound className="h-4 w-4 shrink-0 text-amber-500" />
                                  <span className="truncate">
                                    {person.fullName}
                                    <span className="text-muted-foreground">
                                      {" "}
                                      ({person.username})
                                    </span>
                                  </span>
                                </span>
                                <span className="flex justify-center">
                                  <Checkbox
                                    checked={personChecked}
                                    disabled={submitting}
                                    onCheckedChange={(value) =>
                                      selectPerson(person, value === true)
                                    }
                                    aria-label={`Chọn ${person.fullName}`}
                                  />
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {canIncludeCriteria ? (
            <label className="flex cursor-pointer items-start gap-2 rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
              <Checkbox
                checked={includeCriteria}
                disabled={submitting}
                onCheckedChange={(value) => setIncludeCriteria(value === true)}
                aria-label="Gửi kèm bảng khối A"
              />
              <span className="min-w-0">
                <span className="font-medium">Gửi kèm bảng khối A</span>
                <span className="block text-xs text-muted-foreground">
                  {criteriaHint ??
                    "Bảng tiêu chí chung chốt kết quả tháng, bạn đã tự chấm."}
                </span>
              </span>
            </label>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="send-note">
              Nội dung gửi <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Textarea
                id="send-note"
                value={note}
                maxLength={NOTE_MAX}
                rows={4}
                required
                placeholder="Kính gửi"
                onChange={(event) => setNote(event.target.value)}
                disabled={submitting}
                className="pb-6"
              />
              <span className="pointer-events-none absolute right-3 bottom-2 text-xs text-muted-foreground">
                {note.length}/{NOTE_MAX} ký tự
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            className="bg-background"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Đóng
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting || loading || !canSubmit}
          >
            {submitting ? "Đang gửi..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
