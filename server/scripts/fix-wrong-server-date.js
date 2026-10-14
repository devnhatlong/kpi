/*
  Sửa dữ liệu bị ghi SAI NGÀY do đồng hồ server đặt nhầm (VD để 15/10 trong
  khi thực tế là 14/10): đưa các ngày đã ghi theo giờ server về đúng ngày.

  Cách chạy (đứng ở thư mục server, đọc kết nối DB từ server/.env):
    node scripts/fix-wrong-server-date.js 2026-10-15 2026-10-14           # CHẠY THỬ - chỉ báo
    node scripts/fix-wrong-server-date.js 2026-10-15 2026-10-14 --apply   # sửa thật

  Sửa:
    - team_report_tasks.createdDate / closedDate   (nhiệm vụ khai / đóng hôm sai)
    - team_report_days.reportDate, team_report_unit_days.reportDate
      (bảng ngày đã gửi - đơn vị đã có bảng của ngày đúng thì BỎ QUA và báo,
      không gộp hai bảng)
  Chỉ LIỆT KÊ, không sửa:
    - team_report_summaries có kỳ chạm ngày sai - kỳ do người dùng chọn (hôm
      sai có thể đã chọn nhầm kỳ tháng 15/10 - 14/11), sửa máy móc dễ sai.

  Trước khi ghi, sao lưu nguyên các bản ghi sắp sửa ra
  ../data-backup/fix-date-<giờ>/ (EJSON) - lỡ sai thì còn đường lùi.
*/
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const ROOT = path.resolve(__dirname, '..');
const YMD = /^\d{4}-\d{2}-\d{2}$/;

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

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  const [wrong, right] = process.argv.slice(2, 4);
  const apply = process.argv.includes('--apply');
  if (!YMD.test(wrong || '') || !YMD.test(right || '')) {
    throw new Error(
      'Cách dùng: node scripts/fix-wrong-server-date.js <ngày-sai YYYY-MM-DD> <ngày-đúng YYYY-MM-DD> [--apply]',
    );
  }
  if (wrong === right) throw new Error('Ngày sai và ngày đúng trùng nhau.');

  await mongoose.connect(mongoUri());
  const db = mongoose.connection.db;
  const col = (name) => db.collection(name);
  console.log(`DB: ${db.databaseName} · đổi ${wrong} → ${right} · ${apply ? 'SỬA THẬT' : 'CHẠY THỬ (không ghi gì)'}\n`);

  const deptNames = new Map(
    (await col('departments').find({}).project({ code: 1, name: 1 }).toArray()).map(
      (d) => [String(d._id), d.code ? `${d.code} - ${d.name}` : d.name],
    ),
  );
  const nameOf = (id) => deptNames.get(String(id)) || String(id);

  // ---------------------------------------------------------- nhiệm vụ
  const tasksCreated = await col('team_report_tasks').find({ createdDate: wrong }).toArray();
  const tasksClosed = await col('team_report_tasks').find({ closedDate: wrong }).toArray();
  const byDept = new Map();
  for (const t of tasksCreated) {
    const key = nameOf(t.departmentId);
    byDept.set(key, (byDept.get(key) || 0) + 1);
  }
  console.log(`Nhiệm vụ khai ngày ${wrong}: ${tasksCreated.length}`);
  for (const [name, n] of [...byDept].sort((a, b) => b[1] - a[1])) {
    console.log(`  - ${name}: ${n}`);
  }
  console.log(`Nhiệm vụ đánh dấu xong / dừng ngày ${wrong}: ${tasksClosed.length}`);

  // ---------------------------------------------------------- bảng ngày
  const dayPlans = [];
  for (const name of ['team_report_days', 'team_report_unit_days']) {
    const docs = await col(name).find({ reportDate: wrong }).toArray();
    for (const doc of docs) {
      const clash = await col(name).findOne({
        departmentId: doc.departmentId,
        reportDate: right,
      });
      dayPlans.push({ name, doc, clash: !!clash });
    }
  }
  console.log(`Bảng ngày ${wrong} đã gửi: ${dayPlans.length}`);
  for (const plan of dayPlans) {
    console.log(
      `  - [${plan.name}] ${nameOf(plan.doc.departmentId)} (${plan.doc.status})${
        plan.clash ? `  → BỎ QUA: đơn vị đã có bảng ngày ${right}` : ''
      }`,
    );
  }

  // -------------------------------------------------- báo cáo tổng hợp
  const summaries = await col('team_report_summaries')
    .find({ $or: [{ fromDate: { $gte: wrong } }, { toDate: { $gte: wrong } }] })
    .project({ departmentId: 1, title: 1, period: 1, fromDate: 1, toDate: 1, status: 1 })
    .toArray();
  console.log(`\nBáo cáo tổng hợp có kỳ chạm ngày ${wrong} trở đi (CHỈ LIỆT KÊ - không sửa): ${summaries.length}`);
  for (const s of summaries) {
    console.log(
      `  - ${nameOf(s.departmentId)} · "${s.title}" · ${s.period} ${s.fromDate} → ${s.toDate} · ${s.status}`,
    );
  }
  if (summaries.length) {
    console.log('    → Xem lại kỳ: bản nháp sai kỳ thì xoá và lập lại; bản đã trình thì nhờ cấp trên trả lại rồi lập lại.');
  }

  if (!apply) {
    console.log('\nCHẠY THỬ xong - chưa ghi gì. Kiểm tra danh sách trên rồi chạy lại kèm --apply để sửa.');
    await mongoose.disconnect();
    return;
  }

  // ------------------------------------------------------- sao lưu
  const outDir = path.resolve(ROOT, '..', 'data-backup', `fix-date-${stamp()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const ids = (list) => [...new Set(list.map((d) => String(d._id)))];
  const taskIds = ids([...tasksCreated, ...tasksClosed]);
  const backup = {
    team_report_tasks: await col('team_report_tasks')
      .find({ _id: { $in: taskIds.map((id) => new mongoose.Types.ObjectId(id)) } })
      .toArray(),
    team_report_days: dayPlans.filter((p) => p.name === 'team_report_days').map((p) => p.doc),
    team_report_unit_days: dayPlans
      .filter((p) => p.name === 'team_report_unit_days')
      .map((p) => p.doc),
  };
  for (const [name, docs] of Object.entries(backup)) {
    fs.writeFileSync(
      path.join(outDir, `${name}.json`),
      EJSON.stringify(docs, null, 0, { relaxed: false }),
    );
  }
  console.log(`\nĐã sao lưu bản gốc vào: ${outDir}`);

  // ------------------------------------------------------- sửa
  const created = await col('team_report_tasks').updateMany(
    { createdDate: wrong },
    { $set: { createdDate: right } },
  );
  const closed = await col('team_report_tasks').updateMany(
    { closedDate: wrong },
    { $set: { closedDate: right } },
  );
  let daysFixed = 0;
  for (const plan of dayPlans) {
    if (plan.clash) continue;
    await col(plan.name).updateOne({ _id: plan.doc._id }, { $set: { reportDate: right } });
    daysFixed += 1;
  }
  console.log(`Đã sửa: ${created.modifiedCount} nhiệm vụ (ngày khai), ${closed.modifiedCount} nhiệm vụ (ngày đóng), ${daysFixed} bảng ngày.`);
  console.log('Xong. Các đơn vị tải lại trang (F5) là thấy lại nhiệm vụ.');
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message ?? error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
