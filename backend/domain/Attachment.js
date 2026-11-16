// Файл-документ, прикріплений до сторінки (статут, наказ, скан, таблиця)
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'text/plain',
  'text/csv',
  'image/png',
  'image/jpeg',
  'image/webp',
];

class Attachment {
  constructor({ id, pageId, fileName, mimeType, sizeBytes, uploadedBy = null, createdAt = null }) {
    this.id = id;
    this.pageId = pageId;
    this.fileName = fileName;
    this.mimeType = mimeType;
    this.sizeBytes = sizeBytes;
    this.uploadedBy = uploadedBy;
    this.createdAt = createdAt;
  }
}

Attachment.MAX_FILE_SIZE = MAX_FILE_SIZE;
Attachment.ALLOWED_MIME_TYPES = ALLOWED_MIME_TYPES;

module.exports = Attachment;
