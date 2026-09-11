"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SegmentedTabs } from "@/components/common/segmented-tabs";
import {
  createAdjustmentItem,
  updateAdjustmentItem,
} from "@/features/mission-form-config/api";
import {
  ADJUSTMENT_SECTIONS,
  ADJUSTMENT_SECTION_META,
  entityId,
  type AdjustmentItem,
  type AdjustmentSection,
} from "@/features/mission-form-config/types";
import { getApiErrorMessage } from "@/lib/api-client";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit?: AdjustmentItem | null;
  /** Phần đang mở ở màn ngoài - dòng mới mặc định thuộc phần đó. */
  defaultSection: AdjustmentSection;
  onSuccess: () => void;
};

const PLACEHOLDER: Record<AdjustmentSection, { name: string; rule: string }> = {
  BONUS: {
    name: "VD: Hoàn thành chỉ tiêu công tác trọng tâm",
    rule: "VD: Áp dụng đối với đơn vị được giao chủ trì… Hoàn thành bảo đảm yêu cầu: 1 điểm; hoàn thành sớm, vượt chỉ tiêu: 1,5-2 điểm.",
  },
  PENALTY: {
    name: "VD: Vi phạm chế độ thông tin, báo cáo; gửi hồ sơ quá hạn.",
    rule: "VD: Chậm dưới 01 ngày làm việc: 0,5 điểm/lần; từ 01 đến dưới 03 ngày: 1 điểm/lần…",
  },
  RANKING: {
    name: 'VD: Không xếp loại "Hoàn thành xuất sắc nhiệm vụ"',
    rule: "VD: Không có thành tích xuất sắc, nổi bật được lãnh đạo Công an tỉnh ghi nhận; có nhiệm vụ trọng tâm không hoàn thành…",
  },
};

export function AdjustmentItemFormDialog({
  open,
  onOpenChange,
  edit,
  defaultSection,
  onSuccess,
}: Props) {
  const [section, setSection] = useState<AdjustmentSection>(defaultSection);
  const [name, setName] = useState("");
  const [rule, setRule] = useState("");
  const [maxScore, setMaxScore] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  /* Nạp form ngay trong render, không qua effect - khỏi chớp giá trị lần mở
     trước. Đóng thì xoá khoá để lần sau nạp lại từ đầu. */
  const formKey = open
    ? edit
      ? entityId(edit)
      : `new:${defaultSection}`
    : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (formKey && formKey !== loadedKey) {
    setLoadedKey(formKey);
    setSection(edit?.section ?? defaultSection);
    setName(edit?.name ?? "");
    setRule(edit?.rule ?? "");
    setMaxScore(
      edit?.maxScore === null || edit?.maxScore === undefined
        ? ""
        : String(edit.maxScore),
    );
    setSortOrder(String(edit?.sortOrder ?? 0));
    setIsActive(edit?.isActive ?? true);
  }
  if (!formKey && loadedKey !== null) setLoadedKey(null);

  const meta = ADJUSTMENT_SECTION_META[section];

  const submit = async () => {
    if (!name.trim()) {
      toast.error(`Vui lòng nhập "${meta.nameLabel}".`);
      return;
    }
    let maxScoreNum: number | null = null;
    if (section === "BONUS" && maxScore.trim()) {
      maxScoreNum = Number(maxScore.replace(",", "."));
      if (!Number.isFinite(maxScoreNum) || maxScoreNum < 0) {
        toast.error("Điểm tối đa không hợp lệ.");
        return;
      }
    }
    const sortOrderNum = Number(sortOrder);
    if (!Number.isFinite(sortOrderNum) || sortOrderNum < 0) {
      toast.error("Thứ tự hiển thị không hợp lệ.");
      return;
    }

    setSaving(true);
    try {
      if (edit) {
        // Phần không đổi được sau khi tạo - server cũng chặn; không gửi lên.
        await updateAdjustmentItem(entityId(edit), {
          name: name.trim(),
          rule: rule.trim(),
          maxScore: maxScoreNum,
          sortOrder: sortOrderNum,
          isActive,
        });
        toast.success("Đã cập nhật dòng.");
      } else {
        await createAdjustmentItem({
          section,
          name: name.trim(),
          rule: rule.trim(),
          maxScore: maxScoreNum,
          sortOrder: sortOrderNum,
          isActive,
        });
        toast.success("Đã thêm dòng.");
      }
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không lưu được."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {edit ? "Sửa dòng" : "Thêm dòng"} · {meta.numeral}. {meta.title}
          </DialogTitle>
          <DialogDescription>
            {edit
              ? `Mã ${edit.code} - không đổi mã và phần sau khi tạo.`
              : "Mã sẽ tự sinh theo phần (DC-, DT-, XL-) khi lưu."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {/* Chọn phần chỉ khi THÊM: dòng đã tạo thì phần khoá cứng, đổi phần
              là điểm đã chấm đổi dấu mà không ai biết. */}
          {edit ? null : (
            <div className="space-y-2">
              <Label>Thuộc phần</Label>
              <SegmentedTabs
                ariaLabel="Phần"
                value={section}
                onChange={(next) => setSection(next)}
                items={ADJUSTMENT_SECTIONS.map((value) => ({
                  value,
                  label: `${ADJUSTMENT_SECTION_META[value].numeral}. ${ADJUSTMENT_SECTION_META[value].title}`,
                }))}
                className="flex-wrap"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="adj-name">
              {meta.nameLabel} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="adj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              rows={2}
              placeholder={PLACEHOLDER[section].name}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="adj-rule">{meta.ruleLabel}</Label>
            {/* Đoạn dài chép nguyên từ văn bản - ô nhiều dòng, cao hẳn. */}
            <Textarea
              id="adj-rule"
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              rows={6}
              placeholder={PLACEHOLDER[section].rule}
            />
          </div>

          {section === "BONUS" ? (
            <div className="space-y-2">
              <Label htmlFor="adj-max">Tối đa (điểm)</Label>
              <Input
                id="adj-max"
                type="number"
                min={0}
                step="0.5"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                placeholder="VD: 2"
              />
              <p className="text-xs text-muted-foreground">
                Cột &quot;Tối đa&quot; của dòng. Dòng TỔNG ĐIỂM CỘNG TỐI ĐA cuối
                bảng I là tổng của mọi dòng đang hoạt động (mẫu giấy: 10 điểm).
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="adj-sort">Thứ tự hiển thị</Label>
              <Input
                id="adj-sort"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </div>
            <div className="flex h-9 items-center justify-between self-end rounded-lg border px-3">
              <Label htmlFor="adj-active">Đang hoạt động</Label>
              <Switch
                id="adj-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Hủy
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
