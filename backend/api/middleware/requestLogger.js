// Структуровані логи запитів у форматі JSON (один рядок = один запит).
// Пишуться в stdout, а якщо задано LOG_FILE — ще й у файл (його читає Loki, практична 8).
const fs = require('fs');
const path = require('path');
const { trace } = require('@opentelemetry/api');

function createRequestLogger({ logFile = process.env.LOG_FILE, silent = process.env.NODE_ENV === 'test' } = {}) {
  let stream = null;
  if (logFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    stream = fs.createWriteStream(logFile, { flags: 'a' });
  }

  return (req, res, next) => {
    const started = process.hrtime.bigint();
    // traceId зв'язує рядок логу в Loki з трейсом у Tempo
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    res.on('finish', () => {
      const entry = {
        time: new Date().toISOString(),
        level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
        service: 'docuflow-api',
        method: req.method,
        route: req.route ? req.baseUrl + req.route.path : req.path,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - started) / 1e6,
        requestId: req.rid,
        traceId,
        userId: req.user ? req.user.id : undefined,
        workspaceId: req.user ? req.user.workspaceId : undefined,
      };
      const line = JSON.stringify(entry);
      if (!silent) console.log(line);
      if (stream) stream.write(`${line}\n`);
    });
    next();
  };
}

module.exports = createRequestLogger;
