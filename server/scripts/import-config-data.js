/*
  Nhập dữ liệu cấu hình do scripts/export-config-data.js xuất ra.

  Cách chạy (đứng ở thư mục server, đọc kết nối DB từ server/.env):
    node scripts/import-config-data.js <thư mục xuất>          # chỉ in kế hoạch
    node scripts/import-config-data.js <thư mục xuất> --yes    # ghi thật

  THAY THẾ từng collection có trong thư mục xuất: xoá hết bản ghi cũ của
  collection đó rồi chép bản ghi mới vào, giữ nguyên _id. Không đụng tới
  collection không có trong thư mục xuất (báo cáo ngày, tổng hợp, cộng trừ…).

  Thay thế chứ không trộn: danh mục do server tự tạo khi khởi động (quyền, vai
  trò, nhóm điểm…) mang _id khác máy nguồn, trộn vào là trùng mã và các tham
  chiếu trỏ lệch nhau.
*/
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const ROOT = path.resolve(__dirname, '..');

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
  return (
    `mongodb://${encodeURIComponent(env.DB_USERNAME)}:${encodeURIComponent(env.DB_PASSWORD)}` +
    `@${env.DB_HOST}:${env.DB_PORT || '27017'}/${env.DB_NAME}` +
    `?authSource=${encodeURIComponent(env.DB_AUTH_SOURCE)}`
  );
}

async function main() {
  const dir = process.argv[2];
  const apply = process.argv.includes('--yes');
  if (!dir || !fs.existsSync(path.join(dir, 'manifest.json'))) {
    throw new Error('Chỉ định thư mục xuất (có manifest.json). VD: node scripts/import-config-data.js D:/data-export/20261008-2130');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

  await mongoose.connect(mongoUri());
  const db = mongoose.connection.db;
  console.log(`DB đích: ${db.databaseName}  ←  xuất từ "${manifest.database}" lúc ${manifest.exportedAt}\n`);

  for (const [name, expected] of Object.entries(manifest.collections)) {
    const docs = EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'), { relaxed: false });
    if (docs.length !== expected) {
      throw new Error(`${name}: file có ${docs.length} bản ghi, manifest ghi ${expected} - file hỏng?`);
    }
    const current = await db.collection(name).countDocuments().catch(() => 0);
    console.log(`${apply ? '~' : '?'} ${name.padEnd(36)} hiện ${String(current).padStart(5)}  →  ${docs.length}`);
    if (!apply) continue;
    await db.collection(name).deleteMany({});
    if (docs.length) await db.collection(name).insertMany(docs, { ordered: false });
  }

  console.log(
    apply
      ? '\nĐã nhập xong. Khởi động lại server để index và dữ liệu khởi tạo chạy lại.'
      : '\n[CHƯA GHI GÌ] Kiểm tra danh sách trên rồi chạy lại kèm --yes để nhập thật.',
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message ?? error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
