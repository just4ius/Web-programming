// Перевірка JWT із заголовка Authorization: Bearer <token>.
// Після перевірки req.user = { id, name, email, workspaceId, role, positionId }.
const { trace } = require('@opentelemetry/api');
const { UnauthorizedError } = require('../../service/errors');

function createAuthMiddleware(authService) {
  return async (req, res, next) => {
    const header = req.get('Authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return next(new UnauthorizedError('Missing Bearer token', { code: 'TOKEN_REQUIRED' }));
    }
    req.user = await authService.authenticate(token);
    // Атрибути для трейсів (практична 8): у Grafana можна фільтрувати запити за компанією та користувачем
    trace.getActiveSpan()?.setAttributes({
      'enduser.id': String(req.user.id),
      'enduser.role': req.user.role,
      'docuflow.workspace_id': req.user.workspaceId,
    });
    return next();
  };
}

module.exports = createAuthMiddleware;
