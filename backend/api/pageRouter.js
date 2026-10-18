const express = require('express');
const PageService = require('../service/PageService');
const { AppError } = require('../service/errors');

function createPageRouter(pageService = new PageService()) {
  const router = express.Router();

  // POST /pages (201 Created)
  router.post('/', async (req, res, next) => {
    try {
      const page = await pageService.createPage(req.body);
      res.status(201).json(page);
    } catch (err) {
      next(err);
    }
  });

  // GET /pages (200 OK)
  router.get('/', async (req, res, next) => {
    try {
      const { isArchived, parentId } = req.query;
      const filters = {};
      if (isArchived !== undefined) {
        filters.isArchived = isArchived === 'true' || isArchived === '1';
      }
      if (parentId !== undefined) {
        filters.parentId = parentId;
      }
      const pages = await pageService.listPages(filters);
      res.status(200).json(pages);
    } catch (err) {
      next(err);
    }
  });

  // GET /pages/:id (200 OK, 404 Not Found)
  router.get('/:id', async (req, res, next) => {
    try {
      const page = await pageService.getPageById(req.params.id);
      res.status(200).json(page);
    } catch (err) {
      next(err);
    }
  });

  // PUT /pages/:id (200 OK, 400 Bad Request, 404 Not Found)
  router.put('/:id', async (req, res, next) => {
    try {
      const updated = await pageService.updatePage(req.params.id, req.body);
      res.status(200).json(updated);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /pages/:id (204 No Content, 404 Not Found)
  router.delete('/:id', async (req, res, next) => {
    try {
      await pageService.deletePage(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

// Error handler middleware conforming to ErrorResponse specification
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.error,
      code: err.code,
      details: err.details,
    });
  }

  console.error('Unhandled server error:', err);
  return res.status(500).json({
    error: 'InternalServerError',
    code: 'INTERNAL_SERVER_ERROR',
    details: [{ message: 'An unexpected internal error occurred' }],
  });
}

module.exports = {
  createPageRouter,
  errorHandler,
};
