// OpenTelemetry для практичної 8: трейси та метрики HTTP/Express/PostgreSQL відправляються в OTLP-колектор.
// Підключається ДО старту застосунку:  node -r ./tracing.js index.js   (npm run start:otel)
// Якщо OTEL_EXPORTER_OTLP_ENDPOINT не задано — нічого не робить.
//   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
//   OTEL_SERVICE_NAME=docuflow-api (за замовчуванням)

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

if (endpoint) {
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-http');
  const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics');
  const { resourceFromAttributes } = require('@opentelemetry/resources');
  const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = require('@opentelemetry/semantic-conventions');

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'docuflow-api',
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION || '1.0.0',
      'deployment.environment': process.env.APP_ENV || 'dev',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: 10_000,
    }),
    // Автоматично: вхідні HTTP-запити, маршрути Express, SQL-запити pg
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  });

  sdk.start();
  console.log(`OpenTelemetry увімкнено → ${endpoint}`);

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
