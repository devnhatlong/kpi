"use client";

import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth";
import type {
  TeamReportDayStatus,
  TeamReportParticipant,
} from "@/features/team-report/types";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatServerHm, formatYmd, serverYmd } from "@/lib/server-time";

/** Vai của người đang xem bản - quyết định ô ý kiến có hiện hay không. */
export type ParticipantViewerRole =
  | "OWNER"
  | "REVIEWER"
  | "COORDINATOR"
  | "INFORMED";

/** "Tài khoản - đơn vị"; bản cũ chưa có tài khoản thì chỉ tên đơn vị. */
export function participantLabel(item: TeamReportParticipant) {
  return item.userName && item.userName !== item.departmentName
    ? `${item.userName} - ${item.departmentName}`
    : item.departmentName;
}

const at = (value: string) =>
  `${formatServerHm(value)} ${formatYmd(serverYmd(value))}`;

/**
 * Bản này đi tới đâu: chủ trì, các nơi phối hợp kèm ý kiến, các nơi nhận để
 * biết. Dùng chung cho báo cáo tổng hợp và bảng điểm cộng / trừ.
 *
 * - Đội gửi, chủ trì, phối hợp: đọc được ý kiến của mọi nơi phối hợp.
 * - Nhận để biết: không thấy ý kiến - server đã xoá trắng trước khi gửi về.
 * - Phối hợp: thêm ô gửi / sửa ý kiến của CHÍNH đơn vị mình, chỉ khi bản còn
 *   chờ duyệt. Mỗi đơn vị một câu chốt, gửi lại là sửa chính câu đó.
 */
export function ParticipantsBlock({
  leadName,
  participants,
  status,
  role,
  onSubmitOpinion,
  onChanged,
}: {
  leadName: string;
  participants: TeamReportParticipant[];
  status: TeamReportDayStatus;
  role: ParticipantViewerRole;
  onSubmitOpinion: (comment: string) => Promise<unknown>;
  onChanged: () => void | Promise<void>;
}) {
  const me = useAuth().user?.departmentId ?? "";
  const coordinators = participants.filter(
    (item) => item.role === "COORDINATE",
  );
  const informed = participants.filter((item) => item.role === "INFORM");
  const mine =
    role === "COORDINATOR"
      ? coordinators.find((item) => item.departmentId === me)
      : undefined;
  const [draft, setDraft] = useState(mine?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const canComment = !!mine && status === "PENDING";
  const showOpinions = role !== "INFORMED";

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmitOpinion(draft.trim());
      toast.success(
        draft.trim() ? "Đã gửi ý kiến cho chủ trì." : "Đã xoá ý kiến.",
      );
      await onChanged();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Không gửi được ý kiến."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border p-3 text-sm">
      <p>
        <span className="text-muted-foreground">Chủ trì: </span>
        <strong className="font-semibold">{leadName}</strong>
        <span className="text-xs text-muted-foreground">
          {" "}
          - nơi duy nhất chấm lại, duyệt, trả lại
        </span>
      </p>

      {coordinators.length ? (
        <div className="space-y-1.5">
          <p className="font-medium">Phối hợp ({coordinators.length})</p>
          <ul className="divide-y rounded-md border">
            {coordinators.map((item) => (
              <li key={item.departmentId} className="space-y-1 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{participantLabel(item)}</span>
                  <span className="text-xs text-muted-foreground">
                    {showOpinions && item.commentedAt
                      ? `Ý kiến lúc ${at(item.commentedAt)}`
                      : item.seenAt
                        ? showOpinions
                          ? "Đã xem, chưa cho ý kiến"
                          : `Đã xem ${at(item.seenAt)}`
                        : "Chưa xem"}
                  </span>
                </div>
                {showOpinions && item.comment ? (
                  <p className="whitespace-pre-wrap break-words rounded-md bg-muted/40 px-2.5 py-1.5">
                    {item.comment}
                    {item.commentedByName ? (
                      <span className="block text-xs text-muted-foreground">
                        - {item.commentedByName}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {informed.length ? (
        <div className="space-y-1.5">
          <p className="font-medium">Nhận để biết ({informed.length})</p>
          <ul className="flex flex-wrap gap-1.5">
            {informed.map((item) => (
              <li key={item.departmentId}>
                <Badge variant="outline" className="gap-1.5 font-normal">
                  {participantLabel(item)}
                  <span className="text-muted-foreground">
                    · {item.seenAt ? "đã xem" : "chưa xem"}
                  </span>
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {canComment ? (
        <div className="space-y-2 border-t pt-3">
          <Label htmlFor="opinion">Ý kiến của đơn vị bạn gửi chủ trì</Label>
          <Textarea
            id="opinion"
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ví dụ: Đề nghị xem lại điểm nhiệm vụ… vì…"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              disabled={saving || draft.trim() === (mine?.comment ?? "")}
              onClick={() => void submit()}
            >
              {saving ? (
                <Loader2
                  className="size-4 motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              {mine?.comment ? "Cập nhật ý kiến" : "Gửi ý kiến"}
            </Button>
          </div>
        </div>
      ) : mine ? (
        <p className="text-xs text-muted-foreground">
          Chủ trì đã xử lý - không gửi ý kiến được nữa.
        </p>
      ) : role === "INFORMED" ? (
        <p className="text-xs text-muted-foreground">
          Đơn vị bạn nhận để biết - chỉ xem, không cho ý kiến hay duyệt.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Lời nhắc trong hộp xác nhận duyệt: còn nơi phối hợp chưa cho ý kiến. Nhắc,
 * không chặn - chờ đủ mới cho duyệt thì một nơi chậm là treo cả bản.
 */
export function silentCoordinatorsOf(participants: TeamReportParticipant[]) {
  const coordinators = participants.filter(
    (item) => item.role === "COORDINATE",
  );
  return {
    total: coordinators.length,
    silent: coordinators.filter((item) => !item.comment),
  };
}
