/*
  Nối các tiêu chí ĐIỂM CỘNG (mission_adjustment_items, section BONUS) với
  NỘI DUNG CÔNG VIỆC Trục 2 theo MÃ (trường workContentCode), và sửa lại tên
  tiêu chí cho đúng tên nội dung.

  Vì sao: bảng thẩm định lấy "Đơn vị tự nhận" từ các dòng Trục 2 của báo cáo
  tháng. Trước đây nối theo TÊN - tiêu chí "Sáng kiến… huy động nguồn" thiếu
  chữ "lực" nên mất cả nhóm. Nối theo mã thì đổi tên không gãy nữa.

  Cách chạy (đứng ở thư mục server):
    node scripts/link-adjustment-work-contents.js           # CHẠY THỬ - chỉ in
    node scripts/link-adjustment-work-contents.js --apply   # ghi thật

  Luật ghép, cho tiêu chí CHƯA có mã:
    1. Tên trùng hẳn (bỏ hoa thường / khoảng trắng thừa) → gán mã.
    2. Không trùng hẳn, nhưng đúng MỘT nội dung có tên bắt đầu bằng tên tiêu
       chí (tên tiêu chí bị gõ thiếu đuôi) → gán mã VÀ sửa tên tiêu chí theo
       tên nội dung.
    3. Còn lại: không đụng, in ra để quản trị chọn tay ở màn Cộng/trừ điểm.
  Tiêu chí đã có mã thì bỏ qua - chạy lại nhiều lần vẫn an toàn.
*/
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ROOT = path.resolve(__dirname, '..');

function readEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return env;
}

const norm = (text) => String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

async function main() {
  const apply = process.argv.includes('--apply');
  const env = { ...readEnv(path.join(ROOT, '.env')), ...process.env };
  const need = ['DB_USERNAME', 'DB_PASSWORD', 'DB_HOST', 'DB_NAME', 'DB_AUTH_SOURCE'];
  const missing = need.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Thiếu biến môi trường: ${missing.join(', ')}`);

  await mongoose.connect(
    `mongodb://${encodeURIComponent(env.DB_USERNAME)}:${encodeURIComponent(env.DB_PASSWORD)}` +
      `@${env.DB_HOST}:${env.DB_PORT || '27017'}/${env.DB_NAME}` +
      `?authSource=${encodeURIComponent(env.DB_AUTH_SOURCE)}`,
  );
  const db = mongoose.connection.db;
  const itemsCol = db.collection('mission_adjustment_items');
  const contents = await db
    .collection('workcontents')
    .find({}, { projection: { code: 1, name: 1 } })
    .toArray();
  const items = await itemsCol
    .find({ section: 'BONUS' }, { projection: { code: 1, name: 1, workContentCode: 1 } })
    .sort({ sortOrder: 1 })
    .toArray();

  // Mã nội dung đã nối với tiêu chí nào - một nội dung chỉ nối một tiêu chí.
  const taken = new Set(items.map((item) => item.workContentCode).filter(Boolean));

  console.log(`DB: ${db.databaseName} · ${apply ? 'GHI THẬT' : 'CHẠY THỬ (không ghi gì)'}`);
  console.log(`Tiêu chí điểm cộng: ${items.length}\n`);

  const plans = [];
  for (const item of items) {
    if (item.workContentCode) {
      console.log(`  BỎ QUA  ${item.code}  đã nối ${item.workContentCode}`);
      continue;
    }
    const name = norm(item.name);
    const exact = contents.filter((c) => norm(c.name) === name && !taken.has(c.code));
    const prefix = exact.length
      ? []
      : contents.filter((c) => norm(c.name).startsWith(name) && !taken.has(c.code));
    const match = exact.length === 1 ? exact[0] : prefix.length === 1 ? prefix[0] : null;
    if (!match) {
      const n = exact.length || prefix.length;
      console.log(
        `  CHỌN TAY ${item.code}  "${item.name}"  - ${n ? `${n} nội dung cùng khớp` : 'không nội dung nào khớp'}`,
      );
      continue;
    }
    taken.add(match.code);
    const rename = match.name !== item.name;
    plans.push({ item, match, rename });
    console.log(`  NỐI     ${item.code} → ${match.code}${rename ? '  + SỬA TÊN' : ''}`);
    if (rename) {
      console.log(`            cũ: "${item.name}"`);
      console.log(`            mới: "${match.name}"`);
    }
  }

  if (!apply) {
    console.log(`\n${plans.length} tiêu chí sẽ được nối. Chạy lại kèm --apply để ghi.`);
    await mongoose.disconnect();
    return;
  }

  for (const { item, match, rename } of plans) {
    await itemsCol.updateOne(
      { _id: item._id, $or: [{ workContentCode: { $exists: false } }, { workContentCode: '' }] },
      {
        $set: {
          workContentCode: match.code,
          ...(rename ? { name: match.name } : {}),
          updatedAt: new Date(),
        },
      },
    );
  }
  console.log(`\nĐã nối ${plans.length} tiêu chí.`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message ?? error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
