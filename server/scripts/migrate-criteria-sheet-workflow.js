/**
 * Đưa bảng khối A về mô hình MỘT BẢN MỖI THÁNG, có vòng đời duyệt.
 *
 * Hai việc trong một lượt:
 *
 * 1. Gắn bộ trường vòng đời (trạng thái, người giữ, nhật ký) cho bản ghi cũ -
 *    trước đây bảng chỉ có "lưu", không có gì trong số đó. Thiếu thì truy vấn
 *    bảng tổng (`reviewStatus`, `currentRecipientId`) bỏ sót hoặc trả undefined.
 *
 * 2. Đổi khoá từ NGÀY (`reportDate`) sang THÁNG (`periodMonth`). Một tháng cũ có
 *    thể có nhiều bảng theo ngày, mà khoá mới chỉ cho một - script GIỮ BẢN MỚI
 *    NHẤT của mỗi tháng và chuyển các bản còn lại sang collection lưu trữ
 *    `personal_kpi_criteria_sheets_archive`. KHÔNG xoá: bản cũ vẫn là số cán bộ
 *    đã khai, cần tra lại được.
 *
 * Bản ghi cũ để nguyên là DRAFT - đúng sự thật: chúng chưa từng được gửi lên ai.
 * Báo cáo tổng hợp vẫn đọc được chúng: `latestCriteriaSheets` chỉ ưu tiên bản đã
 * gửi, còn cán bộ không có bản đã gửi nào trong kỳ thì vẫn lấy bản nháp mới nhất.
 *
 *   node scripts/migrate-criteria-sheet-workflow.js          # xem trước, không ghi
 *   node scripts/migrate-criteria-sheet-workflow.js --apply  # ghi thật
 *
 * Chạy được nhiều lần: lượt sau không còn gì để đổi.
 *
 * SAU KHI CHẠY phải xoá index cũ bằng tay - Mongoose tạo index mới chứ không gỡ
 * index cũ, để nguyên thì bản ghi thứ hai của cùng một ngày vẫn bị chặn:
 *
 *   db.personal_kpi_criteria_sheets.dropIndex('ownerId_1_reportDate_1')
 */
const path = require('path');
const { MongoClient } = require('mongodb');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const APPLY = process.argv.includes('--apply');

/** Bộ trường vòng đời, giống hệt mặc định của schema. */
const DEFAULTS = {
  reviewStatus: 'DRAFT',
  holderLevel: 0,
  currentRecipientId: null,
  currentRecipientDepartmentId: null,
  currentSubmissionId: null,
  lastSenderId: null,
  lastSenderDepartmentId: null,
  lastSentAt: null,
  lastProgressAt: null,
  lastDecidedById: null,
  lastDecidedAt: null,
  returnReason: '',
  reviewNote: '',
  reviewScoredById: null,
  reviewScoredByName: '',
  reviewScoredAt: null,
  formTemplateId: null,
  formTemplateVersion: null,
  progressLogs: [],
};

function buildUri() {
  const {
    DB_USERNAME,
    DB_PASSWORD,
    DB_HOST,
    DB_PORT = '27017',
    DB_NAME,
    DB_AUTH_SOURCE,
  } = process.env;
  for (const [key, value] of Object.entries({
    DB_USERNAME,
    DB_PASSWORD,
    DB_HOST,
    DB_NAME,
    DB_AUTH_SOURCE,
  })) {
    if (!value) throw new Error(`Thiếu ${key} trong .env`);
  }
  return (
    `mongodb://${encodeURIComponent(DB_USERNAME)}:${encodeURIComponent(DB_PASSWORD)}` +
    `@${DB_HOST}:${DB_PORT}/${DB_NAME}` +
    `?authSource=${encodeURIComponent(DB_AUTH_SOURCE)}`
  );
}

async function main() {
  const client = new MongoClient(buildUri());
  await client.connect();
  const db = client.db(process.env.DB_NAME);
  const sheets = db.collection('personal_kpi_criteria_sheets');

  console.log(APPLY ? '== GHI THẬT ==' : '== XEM TRƯỚC (chưa ghi) ==');

  const missing = await sheets.countDocuments({
    reviewStatus: { $exists: false },
  });
  console.log(`  bảng chưa có trạng thái duyệt: ${missing}`);

  if (APPLY && missing > 0) {
    const result = await sheets.updateMany(
      { reviewStatus: { $exists: false } },
      { $set: DEFAULTS },
    );
    console.log(`  đã đặt mặc định cho ${result.modifiedCount} bảng`);
  }

  /*
    Hai túi điểm của chỉ huy nằm trong từng DÒNG, không phải ở gốc document -
    `$set` với khoá "rows.$[].reviewValues" đặt cho mọi dòng một lượt.
  */
  const rowsMissing = await sheets.countDocuments({
    'rows.0': { $exists: true },
    'rows.reviewValues': { $exists: false },
  });
  console.log(`  bảng có dòng chưa có ô điểm chỉ huy: ${rowsMissing}`);

  if (APPLY && rowsMissing > 0) {
    const result = await sheets.updateMany(
      { 'rows.0': { $exists: true }, 'rows.reviewValues': { $exists: false } },
      {
        $set: {
          'rows.$[].reviewValues': {},
          'rows.$[].reviewCatalogValues': {},
        },
      },
    );
    console.log(`  đã đặt ô điểm chỉ huy cho ${result.modifiedCount} bảng`);
  }

  await migrateToMonthly(db, sheets);

  await client.close();
  if (!APPLY) console.log('\nChạy lại với --apply để ghi.');
}

/**
 * Đổi khoá ngày -> tháng, gộp các bảng cùng tháng.
 *
 * Bản GIỮ LẠI là bản có `reportDate` lớn nhất trong tháng (cùng ngày thì lấy bản
 * ghi sau) - đúng luật "bản sau thay thế bản trước" mà báo cáo tổng hợp vẫn
 * đang dùng. Các bản thua chuyển sang collection lưu trữ chứ không xoá.
 */
async function migrateToMonthly(db, sheets) {
  const legacy = await sheets
    .find({ reportDate: { $exists: true } })
    .sort({ reportDate: 1, createdAt: 1 })
    .toArray();

  console.log(`  bảng còn khoá theo ngày: ${legacy.length}`);
  if (!legacy.length) return;

  /** owner + tháng -> bản đang thắng. */
  const winners = new Map();
  const losers = [];
  for (const doc of legacy) {
    const month = String(doc.reportDate).slice(0, 7);
    const key = `${String(doc.ownerId)}:${month}`;
    const previous = winners.get(key);
    // Duyệt theo thứ tự tăng dần nên bản gặp sau luôn mới hơn.
    if (previous) losers.push(previous);
    winners.set(key, doc);
  }

  console.log(
    `  -> giữ ${winners.size} bảng (mỗi cán bộ mỗi tháng một bản), lưu trữ ${losers.length} bản cũ`,
  );
  for (const doc of losers) {
    console.log(
      `     lưu trữ: ${String(doc.ownerId)} ngày ${doc.reportDate}`,
    );
  }
  if (!APPLY) return;

  if (losers.length) {
    await db
      .collection('personal_kpi_criteria_sheets_archive')
      .insertMany(losers.map((doc) => ({ ...doc, archivedAt: new Date() })));
    await sheets.deleteMany({ _id: { $in: losers.map((doc) => doc._id) } });
  }

  for (const [key, doc] of winners) {
    const month = key.split(':')[1];
    await sheets.updateOne(
      { _id: doc._id },
      { $set: { periodMonth: month }, $unset: { reportDate: '' } },
    );
  }
  console.log(`  đã đổi khoá cho ${winners.size} bảng`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
