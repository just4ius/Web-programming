// REST API курсового проєкту (/api/...). Контролери лише розбирають HTTP-запит
// і викликають сервіси; уся логіка й перевірки — у шарі service/.
const express = require('express');
const multer = require('multer');
const Attachment = require('../domain/Attachment');
const createAuthMiddleware = require('./middleware/auth');
const createIdempotencyMiddleware = require('./middleware/idempotency');
const createRateLimiter = require('./middleware/rateLimiter');

const UserRepository = require('../repository/UserRepository');
const WorkspaceRepository = require('../repository/WorkspaceRepository');
const MemberRepository = require('../repository/MemberRepository');
const KnowledgeRepository = require('../repository/KnowledgeRepository');
const AttachmentRepository = require('../repository/AttachmentRepository');
const OrgRepository = require('../repository/OrgRepository');

const AuthService = require('../service/AuthService');
const WorkspaceService = require('../service/WorkspaceService');
const MemberService = require('../service/MemberService');
const KnowledgeService = require('../service/KnowledgeService');
const AttachmentService = require('../service/AttachmentService');
const OrgService = require('../service/OrgService');

// Збираємо всі сервіси з репозиторіями (у тестах можна передати свої)
function createServices(db) {
  const userRepository = new UserRepository(db);
  const workspaceRepository = new WorkspaceRepository(db);
  const memberRepository = new MemberRepository(db);
  const knowledgeRepository = new KnowledgeRepository(db);
  const attachmentRepository = new AttachmentRepository(db);
  const orgRepository = new OrgRepository(db);

  return {
    auth: new AuthService({ userRepository, workspaceRepository, memberRepository }),
    workspace: new WorkspaceService({ workspaceRepository }),
    members: new MemberService({ memberRepository, userRepository, orgRepository }),
    knowledge: new KnowledgeService({ knowledgeRepository, attachmentRepository }),
    attachments: new AttachmentService({ attachmentRepository, knowledgeRepository }),
    org: new OrgService({ orgRepository, knowledgeRepository, memberRepository }),
  };
}

function createApiRouter({ services = createServices(), loginLimit = 10 } = {}) {
  const router = express.Router();
  const requireAuth = createAuthMiddleware(services.auth);
  const idempotency = createIdempotencyMiddleware();
  // Захист від підбору паролів: не більше loginLimit спроб входу за хвилину з однієї IP
  const loginLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: loginLimit, retryAfterSeconds: 30 });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Attachment.MAX_FILE_SIZE, files: 1 },
  });

  // ---------- Автентифікація ----------
  router.post('/auth/register', async (req, res) => {
    res.status(201).json(await services.auth.register(req.body));
  });
  router.post('/auth/login', loginLimiter, async (req, res) => {
    res.json(await services.auth.login(req.body));
  });
  router.get('/auth/me', requireAuth, async (req, res) => {
    res.json(await services.auth.me(req.user));
  });

  // Усі маршрути нижче — лише для авторизованих користувачів
  router.use(requireAuth);

  // ---------- Компанія ----------
  router.get('/workspace', async (req, res) => {
    res.json(await services.workspace.overview(req.user));
  });
  router.patch('/workspace', async (req, res) => {
    res.json(await services.workspace.rename(req.user, req.body));
  });

  // ---------- Працівники ----------
  router.get('/members', async (req, res) => {
    res.json(await services.members.list(req.user));
  });
  router.post('/members', async (req, res) => {
    res.status(201).json(await services.members.add(req.user, req.body));
  });
  router.patch('/members/:userId', async (req, res) => {
    res.json(await services.members.update(req.user, req.params.userId, req.body));
  });
  router.delete('/members/:userId', async (req, res) => {
    await services.members.remove(req.user, req.params.userId);
    res.status(204).send();
  });

  // ---------- Сторінки бази знань ----------
  router.get('/pages', async (req, res) => {
    res.json(await services.knowledge.listPages(req.user));
  });
  router.post('/pages', idempotency, async (req, res) => {
    res.status(201).json(await services.knowledge.createPage(req.user, req.body));
  });
  router.get('/pages/:id', async (req, res) => {
    res.json(await services.knowledge.getPage(req.user, req.params.id));
  });
  router.patch('/pages/:id', async (req, res) => {
    res.json(await services.knowledge.updatePage(req.user, req.params.id, req.body));
  });
  router.put('/pages/:id/blocks', async (req, res) => {
    res.json(await services.knowledge.saveBlocks(req.user, req.params.id, req.body && req.body.blocks));
  });
  router.delete('/pages/:id', async (req, res) => {
    res.json(await services.knowledge.archivePage(req.user, req.params.id));
  });

  // ---------- Кошик ----------
  router.get('/trash', async (req, res) => {
    res.json(await services.knowledge.listTrash(req.user));
  });
  router.post('/trash/:id/restore', async (req, res) => {
    res.json(await services.knowledge.restorePage(req.user, req.params.id));
  });
  router.delete('/trash/:id', async (req, res) => {
    await services.knowledge.purgePage(req.user, req.params.id);
    res.status(204).send();
  });

  // ---------- Пошук ----------
  router.get('/search', async (req, res) => {
    res.json(await services.knowledge.search(req.user, req.query.q));
  });

  // ---------- Файли ----------
  router.post('/pages/:id/attachments', upload.single('file'), async (req, res) => {
    res.status(201).json(await services.attachments.upload(req.user, req.params.id, req.file));
  });
  router.get('/attachments/:id/download', async (req, res) => {
    const file = await services.attachments.download(req.user, req.params.id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.sizeBytes);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
    res.send(file.data);
  });
  router.delete('/attachments/:id', async (req, res) => {
    await services.attachments.remove(req.user, req.params.id);
    res.status(204).send();
  });

  // ---------- Оргструктура ----------
  router.get('/org', async (req, res) => {
    res.json(await services.org.getStructure(req.user));
  });
  router.post('/departments', async (req, res) => {
    res.status(201).json(await services.org.createDepartment(req.user, req.body));
  });
  router.patch('/departments/:id', async (req, res) => {
    res.json(await services.org.updateDepartment(req.user, req.params.id, req.body));
  });
  router.delete('/departments/:id', async (req, res) => {
    await services.org.deleteDepartment(req.user, req.params.id);
    res.status(204).send();
  });
  router.post('/positions', async (req, res) => {
    res.status(201).json(await services.org.createPosition(req.user, req.body));
  });
  router.patch('/positions/:id', async (req, res) => {
    res.json(await services.org.updatePosition(req.user, req.params.id, req.body));
  });
  router.delete('/positions/:id', async (req, res) => {
    await services.org.deletePosition(req.user, req.params.id);
    res.status(204).send();
  });

  return router;
}

module.exports = { createApiRouter, createServices };
