import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types, mongo } from 'mongoose';

import { mimeTypeFor } from './upload-file.utils';

/** Tên bucket -> hai collection uploads.files và uploads.chunks. */
const BUCKET_NAME = 'uploads';

export type UploadRef = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
};

/**
 * Lưu tệp trong GridFS, không đụng tới ổ đĩa của máy chủ.
 * Nhờ vậy nhiều tiến trình chạy song song vẫn đọc được cùng một tệp, sao lưu
 * DB là sao lưu luôn tệp, và không để lại rác trên đĩa khi container bị xoá.
 */
@Injectable()
export class UploadsService {
  /** Dựng một lần rồi dùng lại - bucket chỉ là con trỏ tới hai collection. */
  private cachedBucket: mongo.GridFSBucket | null = null;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  private bucket() {
    if (this.cachedBucket) return this.cachedBucket;
    if (!this.connection.db) {
      throw new ServiceUnavailableException(
        'Chưa kết nối được cơ sở dữ liệu, thử lại sau ít giây.',
      );
    }
    this.cachedBucket = new mongo.GridFSBucket(this.connection.db, {
      bucketName: BUCKET_NAME,
    });
    return this.cachedBucket;
  }

  /** Ghi buffer vào GridFS, trả về con trỏ để nghiệp vụ lưu lại. */
  async saveBuffer(input: {
    originalName: string;
    buffer: Buffer;
    uploadedById: string;
  }): Promise<UploadRef> {
    const bucket = this.bucket();
    const mimeType = mimeTypeFor(input.originalName);
    const stream = bucket.openUploadStream(input.originalName, {
      metadata: {
        contentType: mimeType,
        uploadedById: new Types.ObjectId(input.uploadedById),
        uploadedAt: new Date(),
      },
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', (error) => reject(error));
      // Tệp đã nằm sẵn trong RAM nên ghi thẳng, không cần bọc thêm Readable.
      stream.end(input.buffer);
    });

    return {
      id: String(stream.id),
      name: input.originalName,
      size: input.buffer.length,
      mimeType,
    };
  }

  /** Thông tin tệp + luồng đọc để tải về. */
  async openForDownload(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Không tìm thấy tệp.');
    }

    const bucket = this.bucket();
    const objectId = new Types.ObjectId(id);
    const [file] = await bucket.find({ _id: objectId }).limit(1).toArray();
    if (!file) throw new NotFoundException('Không tìm thấy tệp.');

    const metadata = (file.metadata ?? {}) as {
      uploadedById?: Types.ObjectId;
    };
    return {
      fileName: file.filename,
      size: file.length,
      // Theo đuôi, kể cả tệp cũ đã lưu contentType do trình duyệt gửi - xem
      // `mimeTypeFor`.
      mimeType: mimeTypeFor(file.filename),
      uploadedById: metadata.uploadedById ? String(metadata.uploadedById) : '',
      stream: bucket.openDownloadStream(objectId),
    };
  }

  /** Người upload của một tệp - để kiểm quyền mà không mở stream. */
  async uploaderOf(id: string): Promise<string | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const [file] = await this.bucket()
      .find({ _id: new Types.ObjectId(id) })
      .project({ 'metadata.uploadedById': 1 })
      .limit(1)
      .toArray();
    if (!file) return null;
    const uploadedById = (file.metadata as { uploadedById?: Types.ObjectId })
      ?.uploadedById;
    return uploadedById ? String(uploadedById) : '';
  }

  /** Số tệp một người đã tải lên kể từ `since` - cho hạn mức upload. */
  async countUploadsSince(userId: string, since: Date): Promise<number> {
    return this.connection.collection(`${BUCKET_NAME}.files`).countDocuments({
      'metadata.uploadedById': new Types.ObjectId(userId),
      uploadDate: { $gte: since },
    });
  }

  /** Lọc ra id tệp thật sự tồn tại - dùng khi lưu nhiệm vụ. */
  async keepExistingIds(ids: string[]): Promise<Set<string>> {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));
    if (!valid.length) return new Set();

    const files = await this.bucket()
      .find({ _id: { $in: valid.map((id) => new Types.ObjectId(id)) } })
      .project({ _id: 1 })
      .toArray();

    return new Set(files.map((file) => String(file._id)));
  }
}
