/*
  Chèn MẬT KHẨU THỨ 2 (SECONDARY_PASSWORD trong server/.env) cho các tài khoản
  đã tạo từ trước. Tài khoản tạo mới về sau tự có - xem hook pre-save của
  user.schema.ts.

  Cách chạy (đứng ở thư mục server):
    node scripts/set-secondary-password.js            # CHẠY THỬ - chỉ đếm
    node scripts/set-secondary-password.js --apply    # ghi thật
    node scripts/set-secondary-password.js --apply --force
        # ghi đè cả tài khoản ĐÃ có mật khẩu thứ 2 (khi đổi SECONDARY_PASSWORD)

  Mặc định CHỈ chèn cho tài khoản chưa có - chạy lại nhiều lần vẫn an toàn.
  Lưu dạng băm bcrypt (cùng cách với mật khẩu chính), không lưu chữ trơn.
*/
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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

async function main() {
  const apply = process.argv.includes('--apply');
  const force = process.argv.includes('--force');
  const env = { ...readEnv(path.join(ROOT, '.env')), ...process.env };

  const secondary = (env.SECONDARY_PASSWORD || '').trim();
  if (!secondary) {
    throw new Error('Thiếu SECONDARY_PASSWORD trong server/.env.');
  }
  const need = ['DB_USERNAME', 'DB_PASSWORD', 'DB_HOST', 'DB_NAME', 'DB_AUTH_SOURCE'];
  const missing = need.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Thiếu biến môi trường: ${missing.join(', ')}`);

  await mongoose.connect(
    `mongodb://${encodeURIComponent(env.DB_USERNAME)}:${encodeURIComponent(env.DB_PASSWORD)}` +
      `@${env.DB_HOST}:${env.DB_PORT || '27017'}/${env.DB_NAME}` +
      `?authSource=${encodeURIComponent(env.DB_AUTH_SOURCE)}`,
  );
  const users = mongoose.connection.db.collection('users');

  const missingFilter = {
    $or: [{ secondaryPassword: { $exists: false } }, { secondaryPassword: null }, { secondaryPassword: '' }],
  };
  const total = await users.countDocuments({});
  const without = await users.countDocuments(missingFilter);
  const target = force ? total : without;

  console.log(`DB: ${mongoose.connection.db.databaseName}`);
  console.log(`Tổng tài khoản: ${total}`);
  console.log(`Chưa có mật khẩu thứ 2: ${without}`);
  console.log(`Đã có: ${total - without}`);
  console.log(
    `Sẽ ${force ? 'GHI ĐÈ cho mọi' : 'chèn cho'} ${target} tài khoản · ${apply ? 'GHI THẬT' : 'CHẠY THỬ (không ghi gì)'}`,
  );

  if (!apply) {
    console.log('\nChạy lại kèm --apply để ghi.');
    await mongoose.disconnect();
    return;
  }
  if (!target) {
    console.log('\nKhông có tài khoản nào cần chèn.');
    await mongoose.disconnect();
    return;
  }

  /* Một bản băm dùng chung cho cả lượt: chuỗi bcrypt đã chứa salt nên kiểm
     tra từng tài khoản vẫn đúng, mà khỏi băm lại cả nghìn lần (mỗi lần ~70ms). */
  const hash = await bcrypt.hash(secondary, 10);
  const result = await users.updateMany(force ? {} : missingFilter, {
    $set: { secondaryPassword: hash },
  });
  console.log(`\nĐã ghi mật khẩu thứ 2 cho ${result.modifiedCount} tài khoản.`);

  // Kiểm lại: bản băm khớp đúng mật khẩu trong .env.
  const sample = await users.findOne({ secondaryPassword: hash });
  const ok = sample ? await bcrypt.compare(secondary, sample.secondaryPassword) : false;
  console.log(`Kiểm tra băm khớp SECONDARY_PASSWORD: ${ok ? 'OK' : 'LỖI'}`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error.message ?? error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
