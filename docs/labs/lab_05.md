# Звіт про виконання Практичної роботи №5
**Тема:** Error-handling bottlenecks (ідемпотентність, ретраї, таймаути, Retry-After, X-Request-Id, єдиний формат помилки, degraded mode)  
**Проєкт:** DocuFlow (Notion Clone) — платформа для ведення бази знань, регламентів та документів  
**Фокус реалізації:** Серверна частина (Бекенд)  

---

## 1. Мета роботи
- Реалізувати комплексний стек відмовостійкості на боці бекенду для мутуючих операцій створення сторінок (`POST /pages`).
- Забезпечити повну ідемпотентність запитів на базі заголовка `Idempotency-Key` із захистом від створення дублів при мережевих збоях та паралельних кліках (double-click prevention).
- Впровадити наскрізну кореляцію запитів через заголовок `X-Request-Id` для спрощення діагностики та трейсингу.
- Захистити сервіс від перевантаження за допомогою механізму обмеження частоти запитів (Rate Limiting) із повідомленням клієнта про час очікування через заголовок `Retry-After`.
- Збагатити єдину модель помилок полем `requestId` для повної зв'язності з логами сервера.
- Реалізувати керовану симуляцію нестабільності мережі та збоїв сервера (Fault / Chaos Injection) для верифікації клієнтських механізмів ретраїв (exponential backoff з jitter) та таймаутів (AbortController).
- Оформити архітектурне рішення в ADR 0004 та оновити специфікацію OpenAPI.

---

## 2. Реалізовані компоненти та архітектура

Усі нові компоненти розміщено у шарі API за принципом багатошарової архітектури:

```text
backend/
├── api/
│   ├── middleware/
│   │   ├── requestId.js       <-- Генерація та прокидання X-Request-Id
│   │   ├── idempotency.js     <-- Кешування результатів POST та блокування double-click
│   │   ├── rateLimiter.js     <-- Ковзне вікно обмеження частоти запитів з Retry-After
│   │   └── faultInjection.js  <-- Керована симуляція затримок (>1с) та 5xx збоїв
│   └── pageRouter.js          <-- Підключення ідемпотентності до POST /pages та централізований errorHandler
└── index.js                   <-- Реєстрація middleware у глобальному пайплайні Express
```

### 2.1. Ідемпотентність (`Idempotency-Key`)
- **Файл:** [`backend/api/middleware/idempotency.js`](../../backend/api/middleware/idempotency.js)
- **Механізм роботи:**
  1. Клієнт передає заголовок `Idempotency-Key: <uuid>`.
  2. Якщо ключ зустрічається вперше:
     - Створюється `in-flight promise` для блокування повторних паралельних запитів з тим же ключем.
     - Запит передається у `PageService.createPage()`.
     - При успішному статусі `201 Created` результат зберігається у сховищі ідемпотентності.
  3. Якщо ключ уже оброблявся:
     - Сервер миттєво повертає збережений результат (статус `201` та об'єкт створеної раніше сторінки).
     - **Повторний запис у базу даних не виконується**, кількість сторінок не збільшується.
  4. Якщо надходять паралельні сабміти (симуляція подвійного кліку через `Promise.all`):
     - Другий запит очікує завершення першого in-flight промісу та отримує той самий результат, що виключає стан перегонів (race condition).

### 2.2. Кореляція запитів (`X-Request-Id`)
- **Файл:** [`backend/api/middleware/requestId.js`](../../backend/api/middleware/requestId.js)
- **Механізм роботи:**
  - Якщо вхідний запит містить заголовок `X-Request-Id`, сервер фіксує його як `req.rid`.
  - Якщо заголовок відсутній — генерується новий UUID v4 через `crypto.randomUUID()`.
  - Сервер встановлює заголовок `X-Request-Id` у **кожну** HTTP-відповідь (як для успішних кодів, так і для помилок).
  - Поле `requestId` додається в тіло відповіді успішного створення сторінки та в усі тіла помилок.

### 2.3. Обмеження швидкості (Rate Limiting) та `Retry-After`
- **Файл:** [`backend/api/middleware/rateLimiter.js`](../../backend/api/middleware/rateLimiter.js)
- **Механізм роботи:**
  - Відстежує кількість запитів з кожної IP-адреси у часовому вікні 10 секунд (максимум 8 запитів за замовчуванням).
  - Якщо ліміт вичерпано:
    - Повертається HTTP-статус **`429 Too Many Requests`**.
    - Додається HTTP-заголовок **`Retry-After: 2`** (кількість секунд, які клієнт має зачекати перед повторною спробою).
    - Тіло відповіді містить інформативне повідомлення та `requestId`.

### 2.4. Єдиний формат помилок (`ErrorResponse`)
Усі помилки системи уніфіковано та узгоджено з контрактом OpenAPI:
```json
{
  "error": "too_many_requests",
  "code": "TOO_MANY_REQUESTS",
  "details": [
    {
      "message": "Rate limit of 8 requests per 10s exceeded. Please retry after 2s."
    }
  ],
  "requestId": "6f2a8904-4b52-4752-bfdf-7ff952bb43dc"
}
```

### 2.5. Fault / Chaos Injection
- **Файл:** [`backend/api/middleware/faultInjection.js`](../../backend/api/middleware/faultInjection.js)
- **Можливості:**
  - **Імовірнісна симуляція:** вмикається прапорцем `ENABLE_CHAOS=true` або заголовком `X-Simulate-Chaos: true`. Генерує 15% затримок (1200–2000 мс) та 20% помилок 500/503.
  - **Детермінована симуляція для тестів:**
    - `X-Simulate-Delay: 1500` — гарантує затримку в 1.5 секунди (використовується для перевірки скасування запиту клієнтом через `AbortController` при таймауті 1с на `/health`).
    - `X-Simulate-Error: 503` — симулює помилку `503 Service Unavailable` для тестування клієнтських ретраїв.
    - `X-Simulate-Error: 500` — симулює помилку `500 Internal Server Error`.

---

## 3. Документація та архітектурні рішення

1. Створено **[ADR 0004: Стратегії відмовостійкості, ідемпотентність, Rate Limiting та кореляція X-Request-Id](../adr/0004-resilience-and-error-handling.md)**.
2. Оновлено специфікацію API **[`docs/api/openapi.yaml`](../api/openapi.yaml)**:
   - Описано заголовки `Idempotency-Key` та `X-Request-Id` для операції `POST /pages`.
   - Додано опис статусу `429 Too Many Requests` та заголовка відповіді `Retry-After`.
   - Розширено схеми `PageResponse` та `ErrorResponse` обов'язковим полем `requestId`.
3. Оновлено головний **[`README.md`](../../README.md)** з описом нових можливостей та командами cURL.

---

## 4. Результати тестування

Для перевірки функціоналу створено окремий тестовий набір у [`backend/test/resilience.test.js`](../../backend/test/resilience.test.js).

### Запуск тестів:
```bash
npm test
```

### Вивід тест-раннера Node.js:
```text
> backend@1.0.0 test
> node --test test/**/*.test.js

▶ API Endpoints Integration Tests (OpenAPI compliance)
  ✔ GET /health повертає 200 та { status: "ok" }
  ✔ POST /pages повертає 201 Created та створений об’єкт за схемою PageResponse
  ✔ POST /pages з некоректними даними повертає 400 Bad Request та ErrorResponse
  ✔ GET /pages повертає 200 OK та масив сторінок
  ✔ GET /pages/:id повертає 200 OK для існуючої сторінки
  ✔ GET /pages/:id повертає 404 Not Found та ErrorResponse для неіснуючої сторінки
  ✔ PUT /pages/:id повертає 200 OK та оновлену сторінку
  ✔ DELETE /pages/:id повертає 204 No Content
✔ API Endpoints Integration Tests (OpenAPI compliance)

▶ Доменні моделі (Notion Clone)
  ✔ створення користувача User
  ✔ створення сторінки Page та додавання блоків (addBlock)
  ✔ оновлення вмісту блоку Block (updateContent)
  ✔ перейменування та архівація сторінки (archive, restore, rename)
✔ Доменні моделі (Notion Clone)

▶ Практична 5: Error-handling & Resilience Tests
  ▶ 1. Кореляція запитів (X-Request-Id)
    ✔ Кожна відповідь містить заголовок X-Request-Id (згенерований автоматично)
    ✔ Якщо клієнт надсилає власний X-Request-Id, сервер використовує його
    ✔ При помилці валідації requestId продубльовано у тілі JSON-відповіді
  ✔ 1. Кореляція запитів (X-Request-Id)
  ▶ 2. Ідемпотентність (Idempotency-Key)
    ✔ Повторний POST із тим самим Idempotency-Key повертає ідентичний результат без створення дубля
    ✔ Паралельні сабміти (double-click) з однаковим Idempotency-Key створюють лише 1 ресурс
    ✔ Різні Idempotency-Key створюють окремі нові ресурси
  ✔ 2. Ідемпотентність (Idempotency-Key)
  ▶ 3. Обмеження швидкості запитів (Rate Limiting) та Retry-After
    ✔ Повертає 429 Too Many Requests та заголовок Retry-After при перевищенні ліміту
  ✔ 3. Обмеження швидкості запитів (Rate Limiting) та Retry-After
  ▶ 4. Fault Injection & Client Timeout (AbortController)
    ✔ GET /health повертає { status: "ok" } за нормальних умов
    ✔ Симуляція помилки 503 Service Unavailable через X-Simulate-Error
    ✔ Симуляція помилки 500 Internal Server Error через X-Simulate-Error
    ✔ Клієнтський AbortController відміняє запит до /health, якщо затримка сервера > 1000мс
  ✔ 4. Fault Injection & Client Timeout (AbortController)
✔ Практична 5: Error-handling & Resilience Tests

▶ PageService Unit Tests (Практична 4)
  ✔ 10 юніт-тестів PageService пройшли успішно

ℹ tests 32
ℹ suites 12
ℹ pass 32
ℹ fail 0
```

---

## 5. Перевірка роботи через cURL без фронтенду

### 5.1. Перевірка ідемпотентності
```bash
# 1. Перше створення сторінки
curl -i -X POST http://localhost:8080/pages \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: notion-key-001" \
  -H "X-Request-Id: req-demo-1" \
  -d '{"title": "Документація проекту", "icon": "📚"}'

# 2. Повторне відправлення з тим самим Idempotency-Key
curl -i -X POST http://localhost:8080/pages \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: notion-key-001" \
  -H "X-Request-Id: req-demo-2" \
  -d '{"title": "Документація проекту", "icon": "📚"}'
```
*Результат:* Обидва запити повертають статус `201 Created` з однаковим ідентифікатором `id`. У базі даних існує тільки один запис.

### 5.2. Перевірка Rate Limit (429 та Retry-After)
Виконання швидких запитів у циклі:
```bash
curl -i http://localhost:8080/health
```
Після 8-го запиту сервер повертає статус `429 Too Many Requests` із заголовком `Retry-After: 2` та JSON-відповіддю з полем `requestId`.

---

## 6. Підсумок
Усі вимоги Практичної роботи №5 з боку бекенду виконано:
- Гарантовано захист від дублів через `Idempotency-Key` (включно з parallel double-click).
- Забезпечено повну кореляцію запитів через `X-Request-Id`.
- Налаштовано Rate Limiting з коректним `Retry-After`.
- Стандартизовано формат помилок з `requestId`.
- Реалізовано симуляцію відмов та підтверджено роботу таймауту клієнта через `AbortController`.
- Усі 32 тести проходять успішно без помилок.
