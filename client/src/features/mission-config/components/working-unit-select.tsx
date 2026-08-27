"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { entityId, type Department } from "@/features/organization/types";

type Props = {
  workingDepartmentId: string;
  scopedOptions: Department[];
  onChange: (id: string) => void;
  className?: string;
};

export function WorkingUnitSelect({
  workingDepartmentId,
  scopedOptions,
  onChange,
  className,
}: Props) {
  if (scopedOptions.length <= 1) {
    const only = scopedOptions[0];
    if (!only) {
      return (
        <p className="text-sm text-muted-foreground">
          Chưa có đơn vị trong phạm vi role của bạn.
        </p>
      );
    }
    return (
      <p className={`text-sm ${className ?? ""}`}>
        Đơn vị làm việc:{" "}
        <span className="font-medium">
          {only.code} - {only.name}
        </span>
      </p>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <span className="text-sm text-muted-foreground shrink-0">
        Đơn vị làm việc
      </span>
      <Select value={workingDepartmentId} onValueChange={onChange}>
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder="Chọn đơn vị" />
        </SelectTrigger>
        <SelectContent>
          {scopedOptions.map((d) => (
            <SelectItem key={entityId(d)} value={entityId(d)}>
              {d.code} - {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
