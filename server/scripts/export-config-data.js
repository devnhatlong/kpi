/*
  Xuất DỮ LIỆU CẤU HÌNH (đơn vị, tài khoản, vai trò, danh mục, mẫu, luồng
  trình…) để mang sang server khác - BỎ dữ liệu báo cáo phát sinh.

  Cách chạy (đứng ở thư mục server, đọc kết nối DB từ server/.env):
    node scripts/export-config-data.js                # ra ../data-export/<ngày giờ>
    node scripts/export-config-data.js D:/backup/kpi  # chỉ định thư mục ra

  Mỗi collection một file <tên>.json dạng EJSON (giữ nguyên ObjectId, ngày giờ)
  - id giữ nguyên nên các tham chiếu giữa collection không gãy. Nhập bằng
  scripts/import-config-data.js.

  CHỨA MẬT KHẨU ĐÃ BĂM của tài khoản - giữ thư mục xuất như dữ liệu mật, không
  commit lên git.
*/
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const ROOT = path.resolve(__dirname, '..');

/**
 * Collection KHÔNG xuất - dữ liệu phát sinh khi đơn vị làm báo cáo. Collection
 * nào không nằm đây đều được xuất, để thêm danh mục mới về sau không bị sót.
 */
const EXCLUDED = new Set([
  // Báo cáo ngày
  'team_report_tasks',
  'team_report_days',
  'team_report_unit_days',
  'team_report_criteria_sheets',
  // Báo cáo ngày bản nghiệp vụ cũ
  'personal_mission_items',
  'personal_mission_submissions',
  'personal_mission_criteria_sheets',
  // Điểm cộng, trừ & xếp loại
  'team_report_adjustment_sheets',
  // Báo cáo tổng hợp
  'team_report_summaries',
  'mission_summary_reports',
  // Tệp minh chứng đính kèm báo cáo
  'uploads.files',
  'uploads.chunks',
  // Phiên đăng nhập - đăng nhập lại ở server mới
  'refreshtokens',
]);

function readEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

function mongoUri() {
  const env = { ...readEnv(path.join(ROOT, '.env')), ...process.env };
  const need = ['DB_USERNAME', 'DB_PASSWORD', 'DB_HOST', 'DB_NAME', 'DB_AUTH_SOURCE'];
  const missing = need.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Thiếu biến môi trường: ${missing.join(', ')}`);
  // Dựng y như src/config/database.config.ts.
  return (
    `mongodb://${encodeURIComponent(env.DB_USERNAME)}:${encodeURIComponent(env.DB_PASSWORD)}` +
    `@${env.DB_HOST}:${env.DB_PORT || '27017'}/${env.DB_NAME}` +
    `?authSource=${encodeURIComponent(env.DB_AUTH_SOURCE)}`
  );
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const outDir = path.resolve(
    process.argv[2] || path.join(ROOT, '..', 'data-export', stamp()),
  );
  fs.mkdirSync(outDir, { recursive: true });

  await mongoose.connect(mongoUri());
  const db = mongoose.connection.db;
  const names = (await db.listCollections().toArray())
    .map((item) => item.name)
    .filter((name) => !name.startsWith('system.'))
    .sort();

  const manifest = { exportedAt: new Date().toISOString(), database: db.databaseName, collections: {}, skipped: [] };
  for (const name of names) {
    if (EXCLUDED.has(name)) {
      manifest.skipped.push(name);
      continue;
    }
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(
      path.join(outDir, `${name}.json`),
      EJSON.stringify(docs, null, 0, { relaxed: false }),
    );
    manifest.collections[name] = docs.length;
    console.log(`+ ${name.padEnd(36)} ${docs.length}`);
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`\nBỏ qua: ${manifest.skipped.join(', ')}`);
  console.log(`Đã xuất ${Object.keys(manifest.collections).length} collection vào: ${outDir}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message ?? error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
