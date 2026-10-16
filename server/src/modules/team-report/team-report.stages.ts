import { Types } from 'mongoose';

/**
 * DUYỆT 2 CẤP - luật dùng chung cho báo cáo tổng hợp và bảng điểm cộng / trừ.
 *
 * Bản có `finalRecipientId` thì đi hai bước: chủ trì (`recipientId`) duyệt cấp
 * 1 → bản chuyển lên `finalRecipientId` duyệt cuối mới chốt. Không có thì một
 * cấp như cũ. Trả lại ở bước nào bản cũng về đơn vị lập.
 */
export type StagedDoc = {
  status: string;
  recipientId: Types.ObjectId | null;
  finalRecipientId?: Types.ObjectId | null;
  finalRecipientName?: string;
  stage?: 'FIRST' | 'FINAL';
  firstApproval?: { byId: Types.ObjectId; byName: string; at: Date } | null;
};

type IdLike = Types.ObjectId | string | null | undefined;

const same = (a: IdLike, b: IdLike) =>
  a !== null && a !== undefined && String(a) === String(b);

/** Tài khoản đang cầm bản (được duyệt / trả lại / chấm lại lúc này). */
export function handlerIdOf(doc: StagedDoc): Types.ObjectId | null {
  return doc.stage === 'FINAL' && doc.finalRecipientId
    ? doc.finalRecipientId
    : doc.recipientId;
}

/** Tài khoản này đang được quyết bản không - chỉ khi bản còn chờ duyệt. */
export function isHandler(doc: StagedDoc, userId: IdLike): boolean {
  return doc.status === 'PENDING' && same(handlerIdOf(doc), userId);
}

/**
 * Tài khoản này đã CHỐT bản (duyệt cuối nếu 2 cấp, chủ trì nếu 1 cấp) - người
 * duy nhất được trả lại bản đã duyệt.
 */
export function isClosingApprover(doc: StagedDoc, userId: IdLike): boolean {
  return doc.status === 'APPROVED' && same(handlerIdOf(doc), userId);
}

/**
 * Được ĐỌC bản ở vai người duyệt không: chủ trì cấp 1 luôn đọc được (kể cả
 * sau khi đã chuyển lên); duyệt cuối chỉ đọc được từ lúc bản tới tay mình - bản
 * còn ở cấp 1 hay bị cấp 1 trả lại thì chưa phải việc của họ.
 */
export function isApprover(doc: StagedDoc, userId: IdLike): boolean {
  if (same(doc.recipientId, userId)) return true;
  return (
    same(doc.finalRecipientId, userId) &&
    (doc.stage === 'FINAL' || !!doc.firstApproval)
  );
}

/**
 * Điều kiện Mongo cho hộp "Chủ trì" của một tài khoản, theo ô trạng thái:
 *
 * - Chờ duyệt: bản đang nằm ở bước của tôi.
 * - Đã duyệt: bản đã chốt mà tôi là một cấp duyệt, HOẶC tôi đã duyệt cấp 1
 *   và bản đang chờ duyệt cuối (với tôi việc đã xong).
 * - Đã trả lại / Tất cả: mọi bản tôi là một cấp duyệt (duyệt cuối thì từ lúc
 *   bản tới tay mình).
 */
export function leadInboxFilter(
  userId: Types.ObjectId,
  status?: string,
): Record<string, unknown> {
  const asFirst = { recipientId: userId };
  const asFinal = {
    finalRecipientId: userId,
    $or: [{ stage: 'FINAL' }, { firstApproval: { $ne: null } }],
  };
  if (status === 'PENDING') {
    return {
      status: 'PENDING',
      $or: [
        { recipientId: userId, stage: { $ne: 'FINAL' } },
        { finalRecipientId: userId, stage: 'FINAL' },
      ],
    };
  }
  if (status === 'APPROVED') {
    return {
      $or: [
        { status: 'APPROVED', $or: [asFirst, asFinal] },
        { status: 'PENDING', stage: 'FINAL', recipientId: userId },
      ],
    };
  }
  return {
    status: status ? status : { $ne: 'DRAFT' },
    $or: [asFirst, asFinal],
  };
}

/**
 * Áp lượt DUYỆT của người đang cầm bản. Trả `FORWARDED` khi đây là cấp 1 của
 * bản 2 cấp (bản chuyển lên duyệt cuối, chưa chốt), `APPROVED` khi chốt.
 */
export function applyApprove(
  doc: StagedDoc,
  actor: { id: Types.ObjectId; name: string },
): 'FORWARDED' | 'APPROVED' {
  if (doc.finalRecipientId && doc.stage !== 'FINAL') {
    doc.stage = 'FINAL';
    doc.firstApproval = { byId: actor.id, byName: actor.name, at: new Date() };
    return 'FORWARDED';
  }
  doc.status = 'APPROVED';
  return 'APPROVED';
}

/** Đặt lại bước khi trình (hoặc trình lại sau khi bị trả). */
export function resetStages(
  doc: StagedDoc & {
    finalRecipientDepartmentId?: Types.ObjectId | null;
  },
  final: {
    id: Types.ObjectId;
    name: string;
    departmentId: Types.ObjectId;
  } | null,
) {
  doc.finalRecipientId = final?.id ?? null;
  doc.finalRecipientName = final?.name ?? '';
  doc.finalRecipientDepartmentId = final?.departmentId ?? null;
  doc.stage = 'FIRST';
  doc.firstApproval = null;
}
