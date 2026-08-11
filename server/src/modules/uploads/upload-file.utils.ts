import { extname } from 'path';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Đuôi tệp cho phép. Kiểm theo đuôi VÀ magic number, không tin `mimetype` do
 * trình duyệt gửi lên - trường đó client sửa được.
 */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.zip',
  '.rar',
  '.7z',
] as const;

const ALLOWED_SET = new Set<string>(ALLOWED_UPLOAD_EXTENSIONS);

export function isAllowedExtension(fileName: string): boolean {
  return ALLOWED_SET.has(extname(fileName).toLowerCase());
}

/**
 * Sửa tên tệp bị đọc sai bảng mã.
 * Busboy trả `originalname` là chuỗi UTF-8 nhưng bị hiểu thành Latin-1, nên
 * "hướng dẫn.pdf" thành "hÆ°á»›ng dáº«n.pdf".
 *
 * Cách nhận biết: chuỗi đã decode đúng thì có code unit > 0xFF (ư, ơ, emoji…);
 * chuỗi byte thô thì mọi code unit đều ≤ 0xFF.
 */
export function fixOriginalName(name: string): string {
  if (!name) return name;

  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(name)) return name;

  let hasWideChar = false;
  for (let i = 0; i < name.length; i += 1) {
    if (name.charCodeAt(i) > 0xff) {
      hasWideChar = true;
      break;
    }
  }
  if (hasWideChar) return name;

  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  // Có ký tự thay thế nghĩa là đoán sai - trả lại tên gốc còn hơn làm hỏng thêm.
  return decoded.includes('\uFFFD') ? name : decoded;
}

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

/** ZIP - vỏ chung của docx/xlsx/pptx và cả .zip. */
function isZip(buffer: Buffer): boolean {
  return (
    startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(buffer, [0x50, 0x4b, 0x07, 0x08])
  );
}

/** OLE Compound - vỏ chung của .doc/.xls/.ppt đời cũ. */
function isOle(buffer: Buffer): boolean {
  return startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

/**
 * Tìm chuỗi ASCII trong tệp - dùng phân biệt docx / xlsx / pptx.
 * Phải quét TOÀN BỘ buffer: thư mục trung tâm của ZIP nằm ở cuối tệp, và thứ tự
 * các mục trong ZIP không cố định, nên cắt ngắn phần quét sẽ từ chối oan những
 * tệp Office hợp lệ nhưng lớn.
 */
function containsAscii(buffer: Buffer, needle: string): boolean {
  return buffer.includes(Buffer.from(needle, 'ascii'));
}

/** Tài liệu Word: docx (ZIP + word/) hoặc doc đời cũ (OLE). */
function isWord(buffer: Buffer): boolean {
  return (isZip(buffer) && containsAscii(buffer, 'word/')) || isOle(buffer);
}

/** Bảng tính Excel: xlsx (ZIP + xl/) hoặc xls đời cũ (OLE). */
function isExcel(buffer: Buffer): boolean {
  return (isZip(buffer) && containsAscii(buffer, 'xl/')) || isOle(buffer);
}

/** Trình chiếu PowerPoint: pptx (ZIP + ppt/) hoặc ppt đời cũ (OLE). */
function isPowerPoint(buffer: Buffer): boolean {
  return (isZip(buffer) && containsAscii(buffer, 'ppt/')) || isOle(buffer);
}

/**
 * Nội dung tệp có khớp đuôi không.
 * docx/xlsx/pptx cùng 4 byte đầu (đều là ZIP) nên phải quét thêm nội dung;
 * doc/xls/ppt đời cũ cùng chữ ký OLE, không tách được bằng magic nên đành dựa
 * vào đuôi - đây là giới hạn của định dạng, không phải của cách kiểm.
 *
 * Trong cùng một họ thì nhận cả hai đời: tệp đặt tên .doc mà ruột là OOXML vẫn
 * là tài liệu Word, chặn nó không đem lại an toàn gì thêm.
 */
export function contentMatchesExtension(
  buffer: Buffer,
  fileName: string,
): boolean {
  const ext = extname(fileName).toLowerCase();
  if (buffer.length < 4) return false;

  switch (ext) {
    case '.pdf':
      return startsWith(buffer, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case '.doc':
    case '.docx':
      return isWord(buffer);
    case '.xls':
    case '.xlsx':
      return isExcel(buffer);
    case '.ppt':
    case '.pptx':
      return isPowerPoint(buffer);
    case '.zip':
      return isZip(buffer);
    case '.png':
      return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47]);
    case '.jpg':
    case '.jpeg':
      return startsWith(buffer, [0xff, 0xd8, 0xff]);
    case '.gif':
      return startsWith(buffer, [0x47, 0x49, 0x46, 0x38]);
    case '.webp':
      return (
        startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    case '.rar':
      return startsWith(buffer, [0x52, 0x61, 0x72, 0x21]);
    case '.7z':
      return startsWith(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
    // Tệp chữ không có chữ ký - chỉ chặn nội dung nhị phân rõ rệt.
    case '.txt':
    case '.csv':
      return !buffer.subarray(0, 512).includes(0x00);
    default:
      return false;
  }
}

/**
 * Tên tệp an toàn cho header Content-Disposition.
 * Ký tự ngoài dải in được ASCII và dấu nháy kép bị thay bằng "_".
 */
export function asciiFallbackName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/["\\]/g, '_').replace(/[^\x20-\x7e]/g, '_');
}
