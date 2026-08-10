import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createReadStream, existsSync } from 'fs';
import { join, resolve } from 'path';
import { Upload, UploadDocument } from './schemas/upload.schema';

/** Thư mục gốc chứa tệp - nằm cạnh mã nguồn, không nằm trong dist. */
export const UPLOAD_ROOT = resolve(process.cwd(), 'uploads');

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Đuôi tệp cho phép. Chặn theo đuôi chứ không theo mime trình duyệt gửi - mime
 * client gửi lên sửa được, còn đuôi quyết định cách máy chủ phục vụ lại tệp.
 */
export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
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
]);

export type UploadRef = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};

@Injectable()
export class UploadsService {
  constructor(
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
  ) {}

  async register(input: {
    originalName: string;
    relativePath: string;
    mimeType: string;
    size: number;
    uploadedById: string;
  }): Promise<UploadRef> {
    const doc = await this.uploadModel.create({
      originalName: input.originalName,
      // Chuẩn hoá dấu gạch để đường dẫn lưu trên Windows đọc lại được ở nơi khác.
      path: input.relativePath.split('\\').join('/'),
      mimeType: input.mimeType,
      size: input.size,
      uploadedById: new Types.ObjectId(input.uploadedById),
    });

    return {
      id: String(doc._id),
      name: doc.originalName,
      size: doc.size,
      mimeType: doc.mimeType,
    };
  }

  /** Bản ghi + luồng đọc để tải tệp về. */
  async openForDownload(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy tệp.');
    }
    const doc = await this.uploadModel.findById(id);
    if (!doc) throw new NotFoundException('Không tìm thấy tệp.');

    const absolute = resolve(join(UPLOAD_ROOT, doc.path));
    // Chặn path traversal: đường dẫn ghép ra phải vẫn nằm trong UPLOAD_ROOT.
    if (!absolute.startsWith(UPLOAD_ROOT)) {
      throw new NotFoundException('Không tìm thấy tệp.');
    }
    if (!existsSync(absolute)) {
      throw new NotFoundException('Tệp không còn trên máy chủ.');
    }

    return { doc, stream: createReadStream(absolute) };
  }

  /** Lọc ra id tệp thật sự tồn tại - dùng khi lưu nhiệm vụ. */
  async keepExistingIds(ids: string[]): Promise<Set<string>> {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));
    if (!valid.length) return new Set();
    const rows = await this.uploadModel
      .find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } })
      .select('_id');
    return new Set(rows.map((row) => String(row._id)));
  }
}
