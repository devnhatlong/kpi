import { createHmac, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';

import { UploadsService } from './uploads.service';

/** Đuôi tệp OnlyOffice mở được, gom theo loại trình soạn. */
const DOCUMENT_TYPES: Record<string, 'word' | 'cell' | 'slide' | 'pdf'> = {
  '.doc': 'word',
  '.docx': 'word',
  '.odt': 'word',
  '.rtf': 'word',
  '.txt': 'word',
  '.xls': 'cell',
  '.xlsx': 'cell',
  '.ods': 'cell',
  '.csv': 'cell',
  '.ppt': 'slide',
  '.pptx': 'slide',
  '.odp': 'slide',
  '.pdf': 'pdf',
};

/** Link tải cho Document Server sống bao lâu - đủ để nó kéo tệp, không hơn. */
const FILE_TOKEN_TTL_SECONDS = 10 * 60;

/**
 * Nối tệp trong GridFS với OnlyOffice Document Server (chạy Docker cạnh
 * backend, xem ONLYOFFICE_DOCKER_SETUP.md).
 *
 * Trình duyệt nạp editor từ ONLYOFFICE_DOCUMENT_SERVER_URL; Document Server
 * tự kéo tệp về từ backend qua ONLYOFFICE_FILE_BASE_URL - đường này KHÔNG
 * có Bearer token của người dùng nên tệp được mở bằng vé HMAC ngắn hạn gắn
 * vào URL, chỉ đúng một tệp, hết hạn sau vài phút.
 */
@Injectable()
export class OnlyOfficeService {
  constructor(
    private readonly config: ConfigService,
    private readonly uploads: UploadsService,
  ) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('ONLYOFFICE_DOCUMENT_SERVER_URL'));
  }

  /** Tệp này có mở bằng OnlyOffice được không (theo đuôi). */
  static supports(fileName: string): boolean {
    return extname(fileName).toLowerCase() in DOCUMENT_TYPES;
  }

  /**
   * Cấu hình cho `DocsAPI.DocEditor` ở client - chế độ CHỈ XEM. Không bật
   * chỉnh sửa: tệp kiểm chứng là bản chụp đã nộp, sửa ở đây là đổi chứng cứ.
   */
  async viewerConfig(uploadId: string, viewer: { id: string; name: string }) {
    const serverUrl = this.config
      .get<string>('ONLYOFFICE_DOCUMENT_SERVER_URL')
      ?.replace(/\/+$/, '');
    if (!serverUrl) {
      throw new BadRequestException(
        'Chưa cấu hình ONLYOFFICE_DOCUMENT_SERVER_URL - xem ONLYOFFICE_DOCKER_SETUP.md.',
      );
    }
    const file = await this.uploads.openForDownload(uploadId);
    // Không đọc nội dung ở đây - chỉ cần tên và kích thước; huỷ stream ngay.
    file.stream.destroy();

    const ext = extname(file.fileName).toLowerCase();
    const documentType = DOCUMENT_TYPES[ext];
    if (!documentType) {
      throw new BadRequestException(
        `OnlyOffice không mở được tệp ${ext || 'không có đuôi'} - tải về để xem.`,
      );
    }

    const fileBase = (
      this.config.get<string>('ONLYOFFICE_FILE_BASE_URL') ||
      `http://host.docker.internal:${this.config.get<string>('PORT') ?? '8080'}`
    ).replace(/\/+$/, '');
    const expires = Math.floor(Date.now() / 1000) + FILE_TOKEN_TTL_SECONDS;
    const ticket = this.sign(uploadId, expires);

    return {
      documentServerUrl: serverUrl,
      config: {
        documentType,
        document: {
          fileType: ext.slice(1),
          // Khoá theo id + kích thước: cùng id mà tệp đổi thì Document Server
          // không dùng bản đã cache.
          key: `${uploadId}-${file.size}`,
          title: file.fileName,
          url: `${fileBase}/api/v1/onlyoffice/files/${uploadId}?exp=${expires}&sig=${ticket}`,
          permissions: {
            edit: false,
            download: true,
            print: true,
            comment: false,
            review: false,
          },
        },
        editorConfig: {
          mode: 'view',
          lang: 'vi',
          user: { id: viewer.id, name: viewer.name },
          customization: {
            autosave: false,
            forcesave: false,
            compactHeader: true,
            hideRightMenu: true,
            toolbarNoTabs: false,
          },
        },
        height: '100%',
        width: '100%',
      },
    };
  }

  /** Document Server gọi về lấy tệp - kiểm vé rồi mới mở stream. */
  async openForDocumentServer(uploadId: string, exp: string, sig: string) {
    const expires = Number(exp);
    if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) {
      throw new ForbiddenException('Link tệp đã hết hạn.');
    }
    const expected = this.sign(uploadId, expires);
    const a = Buffer.from(expected);
    const b = Buffer.from(sig ?? '');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Link tệp không hợp lệ.');
    }
    return this.uploads.openForDownload(uploadId);
  }

  private sign(uploadId: string, expires: number): string {
    const secret =
      this.config.get<string>('ONLYOFFICE_FILE_SECRET') ||
      this.config.get<string>('JWT_SECRET') ||
      'onlyoffice';
    return createHmac('sha256', secret)
      .update(`${uploadId}.${expires}`)
      .digest('hex');
  }
}
