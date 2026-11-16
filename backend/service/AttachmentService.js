// Завантаження та скачування файлів-документів сторінки
const Attachment = require('../domain/Attachment');
const { ValidationError, NotFoundError } = require('./errors');
const v = require('./validate');

class AttachmentService {
  constructor({ attachmentRepository, knowledgeRepository }) {
    this.repo = attachmentRepository;
    this.pages = knowledgeRepository;
  }

  // Браузер передає ім'я файлу в UTF-8, а multer читає його як latin1 — виправляємо кирилицю
  static decodeFileName(name) {
    const decoded = Buffer.from(String(name || ''), 'latin1').toString('utf8');
    const safe = (decoded.includes('�') ? String(name) : decoded)
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
      .trim();
    return safe.slice(0, 255) || 'file';
  }

  async upload(actor, pageId, file) {
    v.requirePermission(actor, 'files:write');
    const page = await this.pages.getPage(actor.workspaceId, v.id(pageId, 'pageId'));
    if (!page || page.isArchived) {
      throw new NotFoundError(`Page ${pageId} not found`, { code: 'PAGE_NOT_FOUND' });
    }
    if (!file || !file.buffer || file.size === 0) {
      throw new ValidationError('File is required (form field "file")', { code: 'FILE_REQUIRED', field: 'file' });
    }
    if (file.size > Attachment.MAX_FILE_SIZE) {
      throw new ValidationError('File cannot be larger than 10 MB', { code: 'FILE_TOO_LARGE', field: 'file' });
    }
    if (!Attachment.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new ValidationError('Allowed formats: PDF, Word, Excel, ODT/ODS, TXT, CSV, PNG, JPG, WEBP', {
        code: 'FILE_TYPE_NOT_ALLOWED', field: 'file',
      });
    }

    return this.repo.create({
      workspaceId: actor.workspaceId,
      pageId: page.id,
      fileName: AttachmentService.decodeFileName(file.originalname),
      mimeType: file.mimetype,
      sizeBytes: file.size,
      data: file.buffer,
      userId: actor.id,
    });
  }

  async download(actor, id) {
    v.requirePermission(actor, 'content:read');
    const file = await this.repo.findWithData(actor.workspaceId, v.id(id, 'id'));
    if (!file) {
      throw new NotFoundError(`File ${id} not found`, { code: 'FILE_NOT_FOUND' });
    }
    return file;
  }

  async remove(actor, id) {
    v.requirePermission(actor, 'files:write');
    if (!await this.repo.delete(actor.workspaceId, v.id(id, 'id'))) {
      throw new NotFoundError(`File ${id} not found`, { code: 'FILE_NOT_FOUND' });
    }
  }
}

module.exports = AttachmentService;
