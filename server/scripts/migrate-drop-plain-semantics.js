/**
 * Gỡ 4 ánh xạ thuần văn bản: deadline, product, executing_unit, note.
 *
 * Bốn cột này không có danh mục để lấy giá trị, cũng không vào công thức chấm -
 * chúng chỉ lưu rồi hiện lại, y hệt cột nhập tự do. Script chuyển chúng thành
 * cột `custom` và dời dữ liệu đã nhập từ field cứng sang `fieldValues`.
 *
 *   node scripts/migrate-drop-plain-semantics.js          # xem trước, không ghi
 *   node scripts/migrate-drop-plain-semantics.js --apply  # ghi thật
 *
 * Chạy được nhiều lần: lượt sau không còn gì để chuyển.
 */
const path = require('path');
const { MongoClient } = require('mongodb');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

/** semanticKey bị gỡ -> field cứng đang giữ dữ liệu trên personal_kpi_items. */
const SEMANTIC_FIELD = {
  deadline: 'deadline',
  product: 'product',
  executing_unit: 'executingUnit',
  note: 'note',
  // Năm cột điểm: không có công thức nào đọc chúng, chỉ lưu rồi hiện lại.
  standard_score: 'standardScore',
  progress_percent: 'progressPercent',
  progress_self_score: 'progressSelfScore',
  quality_percent: 'qualityPercent',
  quality_self_score: 'qualitySelfScore',
  // Nhóm "Trường hệ thống" bỏ hẳn - tất cả thành cột nhập tự do.
  task_title: 'title',
  result_passed: 'resultPassed',
  result_failed: 'resultFailed',
  evidence_files: 'evidenceFiles',
};

/** Ô tích của cột tự do đọc chuỗi "1", không phải boolean. */
const BOOLEAN_FIELDS = new Set(['resultPassed', 'resultFailed']);
const DROPPED = Object.keys(SEMANTIC_FIELD);
const FIELDS = Object.values(SEMANTIC_FIELD);

const APPLY = process.argv.includes('--apply');

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

/**
 * Khoá lưu fieldValues của một semantic trong một mẫu cụ thể.
 * Mặc định khoá cột bằng đúng tên semantic, nên tra được thì dùng khoá thật,
 * không tra được thì lấy tên semantic - không để rơi dữ liệu.
 */
function keyMapOfColumns(columns) {
  const map = {};
  for (const column of columns ?? []) {
    if (DROPPED.includes(column.semanticKey)) {
      map[column.semanticKey] = column.key || column.semanticKey;
    }
  }
  return map;
}

async function migrateTemplates(collection, label, keyIndex) {
  const docs = await collection
    .find({ 'columns.semanticKey': { $in: DROPPED } })
    .toArray();

  let touched = 0;
  for (const doc of docs) {
    const map = keyMapOfColumns(doc.columns);
    // Nhiệm vụ tra mẫu theo templateId + version; bản gốc coi như version của nó.
    const templateId = String(doc.templateId ?? doc._id);
    const version = doc.version ?? 1;
    keyIndex.set(`${templateId}:${version}`, map);

    const columns = doc.columns.map((column) =>
      DROPPED.includes(column.semanticKey)
        ? {
            ...column,
            semanticKey: 'custom',
            key: column.key || column.semanticKey,
          }
        : column,
    );

    touched += 1;
    if (APPLY) {
      await collection.updateOne({ _id: doc._id }, { $set: { columns } });
    }
  }

  console.log(`  ${label}: ${touched} bản ghi có cột cần đổi`);
  return touched;
}

async function migrateItems(collection, keyIndex) {
  const docs = await collection
    .find({ $or: FIELDS.map((field) => ({ [field]: { $exists: true } })) })
    .toArray();

  let moved = 0;
  let values = 0;
  for (const doc of docs) {
    const templateKey = `${String(doc.formTemplateId ?? '')}:${doc.formTemplateVersion ?? 1}`;
    const map = keyIndex.get(templateKey) ?? {};

    const fieldValues = { ...(doc.fieldValues ?? {}) };
    let changed = false;

    for (const [semantic, field] of Object.entries(SEMANTIC_FIELD)) {
      const raw = doc[field];
      if (raw === undefined || raw === null) continue;
      // Mảng tệp rỗng và chuỗi rỗng đều coi như chưa nhập gì.
      if (Array.isArray(raw) && raw.length === 0) continue;
      if (!Array.isArray(raw) && String(raw).trim() === '') continue;

      const value = BOOLEAN_FIELDS.has(field)
        ? raw === true
          ? '1'
          : ''
        : Array.isArray(raw)
          ? JSON.stringify(raw)
          : String(raw);
      if (!value) continue;

      const key = map[semantic] ?? semantic;
      // Không đè giá trị đã có sẵn trong fieldValues.
      if (fieldValues[key] !== undefined && String(fieldValues[key]).trim()) {
        continue;
      }
      fieldValues[key] = value;
      changed = true;
      values += 1;
    }

    moved += 1;
    if (APPLY) {
      const update = { $unset: Object.fromEntries(FIELDS.map((f) => [f, ''])) };
      if (changed) update.$set = { fieldValues };
      await collection.updateOne({ _id: doc._id }, update);
    }
  }

  console.log(`  personal_kpi_items: ${moved} nhiệm vụ, dời ${values} giá trị`);
  return moved;
}

async function main() {
  const client = new MongoClient(buildUri());
  await client.connect();
  const db = client.db(process.env.DB_NAME);

  console.log(APPLY ? '== GHI THẬT ==' : '== XEM TRƯỚC (chưa ghi) ==');

  // Chỉ mục khoá cột phải dựng xong trước khi đụng tới nhiệm vụ.
  const keyIndex = new Map();
  await migrateTemplates(db.collection('kpi_form_templates'), 'kpi_form_templates', keyIndex);
  await migrateTemplates(
    db.collection('kpi_form_template_versions'),
    'kpi_form_template_versions',
    keyIndex,
  );
  await migrateItems(db.collection('personal_kpi_items'), keyIndex);

  await client.close();
  if (!APPLY) console.log('\nChạy lại với --apply để ghi.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
