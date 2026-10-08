/*
  Nhập danh mục "Nội dung công việc" theo phụ lục (Phụ lục 2..5) vào DB.

  Dữ liệu lấy từ scripts/data/work-content-sets.json - bóc sẵn từ các file Excel
  phụ lục, commit kèm repo để chạy được trên máy không có file gốc.

  Cách chạy (đứng ở thư mục server, đọc kết nối DB từ server/.env):
    node scripts/import-work-content-sets.js --dry-run   # chỉ in kế hoạch
    node scripts/import-work-content-sets.js             # ghi thật

  CHỈ THÊM, KHÔNG SỬA, KHÔNG XOÁ - chạy lại bao nhiêu lần cũng được:
  - Bộ nội dung: tạo theo mã (BND-PL2…) nếu chưa có.
  - Nhóm điểm: khớp theo tên (Nhóm 1/2/3, "0x điểm (Trục 2)"); thiếu thì tạo
    theo định nghĩa trong file dữ liệu.
  - Nội dung công việc: khớp theo (trục, tên) không phân biệt hoa thường. Có rồi
    thì chỉ gắn thêm bộ vào `setIds` và điền nhóm điểm nếu đang trống; chưa có
    thì tạo mới kèm nhóm điểm theo cột "Điểm chuẩn" của phụ lục.
  - Nhiệm vụ (Trục 2): tạo dưới nội dung nếu chưa có nhiệm vụ trùng tên. Nội
    dung đã có nhiệm vụ khác tên thì BỎ QUA và in ra để quản trị tự xem - có thể
    đó là bản đã sửa tay.
  - Trục: phải có sẵn (TRUC-0001..0004 hoặc tên bắt đầu "Trục 1..4"); thiếu thì
    dừng, không tự tạo trục vì điểm tối đa của trục là cấu hình nghiệp vụ.
*/
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

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
  if (missing.length) {
    throw new Error(`Thiếu biến môi trường: ${missing.join(', ')}`);
  }
  // Dựng y như src/config/database.config.ts.
  return (
    `mongodb://${encodeURIComponent(env.DB_USERNAME)}:${encodeURIComponent(env.DB_PASSWORD)}` +
    `@${env.DB_HOST}:${env.DB_PORT || '27017'}/${env.DB_NAME}` +
    `?authSource=${encodeURIComponent(env.DB_AUTH_SOURCE)}`
  );
}

// So khớp tên: bỏ khác biệt khoảng trắng, hoa thường và dấu "…" ở cuối (văn
// bản gốc lúc có lúc không, "của Đảng ủy…" và "của Đảng ủy" là một dòng).
const norm = (value) =>
  String(value ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .replace(/[\s.…]+$/, '')
    .trim()
    .toLowerCase();

async function nextCode(collection, prefix) {
  const docs = await collection
    .find({ code: { $regex: `^${prefix}-\\d+$`, $options: 'i' } })
    .project({ code: 1 })
    .toArray();
  let max = 0;
  for (const doc of docs) {
    const n = Number(/-(\d+)$/.exec(doc.code)?.[1]);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return () => `${prefix}-${String(++max).padStart(4, '0')}`;
}

async function main() {
  const data = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'data', 'work-content-sets.json'), 'utf8'),
  );

  await mongoose.connect(mongoUri());
  const db = mongoose.connection.db;
  const setsCol = db.collection('mission_work_content_sets');
  const axesCol = db.collection('axes');
  const contentsCol = db.collection('workcontents');
  const tasksCol = db.collection('mission_work_tasks');
  const now = new Date();
  const log = [];

  /* ------------------------------------------------------------ trục */
  const axes = await axesCol.find({}).toArray();
  const axisOf = {};
  for (const no of [...new Set(data.items.map((item) => item.axis))]) {
    const axis =
      axes.find((a) => a.code === `TRUC-${String(no).padStart(4, '0')}`) ??
      axes.find((a) => new RegExp(`^Trục\\s*${no}(\\D|$)`, 'i').test(a.name));
    if (!axis) throw new Error(`Không tìm thấy Trục ${no} - tạo trục trước rồi chạy lại.`);
    axisOf[no] = axis;
  }

  /* ----------------------------------------------------- bộ nội dung */
  const setIdOf = {};
  for (const [index, set] of data.sets.entries()) {
    const found = await setsCol.findOne({ code: set.code });
    if (found) {
      setIdOf[set.code] = found._id;
      continue;
    }
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      code: set.code,
      name: set.name,
      description: '',
      sortOrder: index + 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    };
    if (!DRY_RUN) await setsCol.insertOne(doc);
    setIdOf[set.code] = doc._id;
    log.push(`+ Bộ ${set.code} "${set.name}"`);
  }

  /* ------------------------------------------------------- nhóm điểm */
  const groupsCol = db.collection('scoregroups');
  const groups = await groupsCol.find({}).toArray();
  const groupIdOf = {};
  const nextGroupCode = await nextCode(groupsCol, 'DG');
  for (const [index, group] of (data.scoreGroups ?? []).entries()) {
    const found = groups.find((row) => norm(row.name) === norm(group.name));
    if (found) {
      groupIdOf[group.name] = found._id;
      continue;
    }
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      code: nextGroupCode(),
      ...group,
      sortOrder: index,
      isActive: true,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
      __v: 0,
    };
    if (!DRY_RUN) await groupsCol.insertOne(doc);
    groupIdOf[group.name] = doc._id;
    log.push(`+ Nhóm điểm ${doc.code} "${group.name}"`);
  }

  /* -------------------------------------------- nội dung công việc */
  const existing = await contentsCol.find({}).toArray();
  const contentByKey = new Map(
    existing.map((row) => [`${row.axisId}|${norm(row.name)}`, row]),
  );
  const nextContentCode = await nextCode(contentsCol, 'ND');
  const orderInAxis = {};
  let created = 0;
  let tagged = 0;

  for (const item of data.items) {
    const axis = axisOf[item.axis];
    orderInAxis[item.axis] = (orderInAxis[item.axis] ?? 0) + 1;
    const key = `${axis._id}|${norm(item.name)}`;
    const setIds = item.sets.map((code) => setIdOf[code]);
    // null = phụ lục không ghi nhóm cố định ("căn cứ nhiệm vụ cấp trên giao").
    const scoreGroupId = item.scoreGroup ? groupIdOf[item.scoreGroup] : null;
    if (item.scoreGroup && !scoreGroupId) {
      throw new Error(`Không có nhóm điểm "${item.scoreGroup}" trong file dữ liệu.`);
    }
    let content = contentByKey.get(key);

    if (!content) {
      content = {
        _id: new mongoose.Types.ObjectId(),
        code: nextContentCode(),
        name: item.name,
        description: '',
        note: '',
        axisId: axis._id,
        scoreGroupId,
        setIds,
        sortOrder: orderInAxis[item.axis],
        isActive: true,
        createdAt: now,
        updatedAt: now,
        __v: 0,
      };
      if (!DRY_RUN) await contentsCol.insertOne(content);
      contentByKey.set(key, content);
      created++;
      log.push(
        `+ ${content.code} [${axis.name}] ${item.name} | ${item.scoreGroup ?? 'chưa gán'} <- ${item.sets.join(', ')}`,
      );
    } else {
      // Chỉ điền khi đang trống - quản trị đã chọn tay thì giữ nguyên.
      if (!content.scoreGroupId && scoreGroupId) {
        if (!DRY_RUN) {
          await contentsCol.updateOne(
            { _id: content._id },
            { $set: { scoreGroupId, updatedAt: now } },
          );
        }
        content.scoreGroupId = scoreGroupId;
        log.push(`~ ${content.code} [${axis.name}] ${item.name} <- nhóm điểm ${item.scoreGroup}`);
      }
      const have = new Set((content.setIds ?? []).map(String));
      const missing = setIds.filter((id) => !have.has(String(id)));
      if (missing.length) {
        if (!DRY_RUN) {
          await contentsCol.updateOne(
            { _id: content._id },
            { $addToSet: { setIds: { $each: missing } }, $set: { updatedAt: now } },
          );
        }
        content.setIds = [...(content.setIds ?? []), ...missing];
        tagged++;
        log.push(`~ ${content.code} [${axis.name}] ${item.name} <- gắn thêm bộ`);
      }
    }

    /* ---------------------------------------------- nhiệm vụ (Trục 2) */
    if (!item.tasks?.length) continue;
    const ownTasks = DRY_RUN && !content.createdAt
      ? []
      : await tasksCol.find({ workContentId: content._id }).toArray();
    const ownNames = new Set(ownTasks.map((task) => norm(task.name)));
    const fresh = item.tasks.filter((task) => !ownNames.has(norm(task.name)));
    if (!fresh.length) continue;
    // Nội dung đã có nhiệm vụ khai tay (khác chữ) - không chen thêm bản thứ hai.
    if (ownTasks.length) {
      for (const task of fresh) {
        log.push(`! BỎ QUA nhiệm vụ của ${content.code} (đã có ${ownTasks.length} nhiệm vụ khác chữ): ${task.name.slice(0, 80)}…`);
      }
      continue;
    }
    const nextTaskCode = await nextCode(tasksCol, 'NV');
    for (const [index, task] of fresh.entries()) {
      const doc = {
        _id: new mongoose.Types.ObjectId(),
        code: nextTaskCode(),
        name: task.name,
        workContentId: content._id,
        scoreGroupId: null,
        note: '',
        sortOrder: index,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        __v: 0,
      };
      if (!DRY_RUN) await tasksCol.insertOne(doc);
      log.push(`+ ${doc.code} nhiệm vụ của ${content.code} (${task.sets.join(', ')}): ${task.name.slice(0, 80)}…`);
    }
  }

  console.log(log.join('\n'));
  console.log(
    `\n${DRY_RUN ? '[DRY RUN - chưa ghi gì] ' : ''}` +
      `Nội dung: tạo mới ${created}, gắn thêm bộ ${tagged}, tổng trong file ${data.items.length}.`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message ?? error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
