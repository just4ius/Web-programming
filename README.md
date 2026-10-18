# DocuFlow (Notion Clone) — Модульний моноліт

Проєкт для централізованого ведення корпоративної бази знань, робочих регламентів, деревоподібних сторінок та контентних блоків.

---

## 🏛 Архітектура (Практична робота №4)

У межах 4-ї практичної роботи було прийнято рішення продовжувати розвиток системи як **Модульного моноліту** з чіткою шаровою архітектурою:
- **API (`backend/api/`)**: маршрутизація Express, контролери, мапінг HTTP-запитів у DTO, валідація, формування HTTP-відповідей.
- **Service (`backend/service/`)**: бізнес-логіка, сценарії використання (Use Cases), валідація інваріантів, мапінг DTO <-> Domain.
- **Domain (`backend/domain/`)**: чисті доменні моделі (`Page`, `Block`, `User`) без зовнішніх залежностей.
- **Repository (`backend/repository/`)**: рівень доступу до даних (PostgreSQL з підтримкою in-memory fallback для локального тестування).

### Архітектурні рішення (ADR)
1. [ADR 0001: Вибір архітектурного стилю — Модульний моноліт](docs/adr/0001-architecture-style.md)
2. [ADR 0002: Шарова архітектура модульного моноліту (Layered Architecture)](docs/adr/0002-layered-architecture.md)
3. [ADR 0003: Стиль API, статус-коди та єдина модель помилок (Error Model)](docs/adr/0003-api-style-and-error-model.md)
4. [ADR 0004: Стратегії відмовостійкості, ідемпотентність, Rate Limiting та кореляція X-Request-Id](docs/adr/0004-resilience-and-error-handling.md)

---

## 🛡️ Стійкість та обробка помилок (Практична робота №5)

У системі реалізовано повноцінний набір механізмів відмовостійкості та кореляції:
- **Ідемпотентність (`Idempotency-Key`)**: запобігає дублюванню операцій створення сторінки `POST /pages`. Повторний запит із тим самим ключем повертає збережений результат (201 Created) без створення нового запису в базі даних. Підтримується також захист від паралельних сабмітів (double click).
- **Кореляція запитів (`X-Request-Id`)**: кожен запит отримує унікальний ідентифікатор, який повертається у заголовку відповіді та дублюється у полі `requestId` тіла будь-якої помилки.
- **Обмеження частоти запитів (Rate Limiting)**: захист від перевантаження (вікно 10с, ліміт 8 запитів). При перевищенні повертається статус `429 Too Many Requests` із заголовком `Retry-After: 2`.
- **Симуляція збоїв (Fault / Chaos Injection)**: можливість тестування клієнтських ретраїв та таймаутів (заголовки `X-Simulate-Delay`, `X-Simulate-Error: 500|503`, або змінна `ENABLE_CHAOS=true`).

### Приклади тестування через cURL

#### 1. Перевірка ідемпотентності створення сторінки:
```bash
# Перший виклик (створення сторінки):
curl -i -X POST http://localhost:8080/pages \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: notion-demo-key-1" \
  -H "X-Request-Id: client-trace-001" \
  -d '{"title": "Новий документ Notion", "icon": "📝"}'

# Повторний виклик із тим самим Idempotency-Key (повертає той самий id без дублювання):
curl -i -X POST http://localhost:8080/pages \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: notion-demo-key-1" \
  -H "X-Request-Id: client-trace-002" \
  -d '{"title": "Новий документ Notion", "icon": "📝"}'
```

#### 2. Перевірка Rate Limit (429 та Retry-After):
Виконайте серію швидких запитів (більше 8 запитів за 10 секунд):
```bash
curl -i http://localhost:8080/health
```
При перевищенні ліміту сервер поверне `429 Too Many Requests` із заголовком `Retry-After: 2` та JSON-відповіддю з `requestId`.

---

## 📖 API документація

Специфікація API спроектована за підходом Contract-First та формалізована за стандартом OpenAPI 3.0:
- Контракт API: [docs/api/openapi.yaml](docs/api/openapi.yaml)

### Скріншот документації у Swagger Editor
![API Документація Swagger](docs/api/swagger_screenshot.png)

### Реалізовані ендпоінти
| Метод | Шлях | Опис | Статуси відповідей |
|:---|:---|:---|:---|
| `GET` | `/health` | Системний health-check | `200 OK` (`{ "status": "ok" }`) |
| `POST` | `/pages` | Створення нової сторінки (підтримує `Idempotency-Key`) | `201 Created`, `400 Bad Request`, `429 Too Many Requests` |
| `GET` | `/pages` | Отримання списку сторінок (з фільтрацією) | `200 OK` |
| `GET` | `/pages/{id}` | Отримання сторінки за ID | `200 OK`, `400 Bad Request`, `404 Not Found` |
| `PUT` | `/pages/{id}` | Повне/часткове оновлення сторінки | `200 OK`, `400 Bad Request`, `404 Not Found` |
| `DELETE` | `/pages/{id}` | Видалення сторінки | `204 No Content`, `400 Bad Request`, `404 Not Found` |

### Єдиний формат помилки (`ErrorResponse`)
Усі помилки повертаються в стандартизованому JSON-форматі з обов'язковим `requestId`:
```json
{
  "error": "ValidationError",
  "code": "TITLE_REQUIRED",
  "details": [
    {
      "field": "title",
      "message": "Title is required and cannot be empty"
    }
  ],
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

---

## 🚀 Швидкий старт

### 1. Налаштування оточення
Перейдіть у папку `backend` та за потреби створіть/налаштуйте `.env`:
```bash
cd backend
cp .env.example .env
```

### 2. Запуск міграцій БД (PostgreSQL)
```bash
npm run migrate
```

### 3. Запуск юніт- та інтеграційних тестів
Покриває доменний шар, сервісний рівень `PageService`, ендпоінти API, а також механізми відмовостійкості (ідемпотентність, rate-limiting, кореляція, таймаути):
```bash
npm test
```

### 4. Запуск сервера
```bash
npm start
# або в режимі розробки з автоперезапуском:
npm run dev
```
Сервер буде доступний за адресою `http://localhost:8080`.