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
| `POST` | `/pages` | Створення нової сторінки | `201 Created`, `400 Bad Request` |
| `GET` | `/pages` | Отримання списку сторінок (з фільтрацією) | `200 OK` |
| `GET` | `/pages/{id}` | Отримання сторінки за ID | `200 OK`, `400 Bad Request`, `404 Not Found` |
| `PUT` | `/pages/{id}` | Повне/часткове оновлення сторінки | `200 OK`, `400 Bad Request`, `404 Not Found` |
| `DELETE` | `/pages/{id}` | Видалення сторінки | `204 No Content`, `400 Bad Request`, `404 Not Found` |

### Єдиний формат помилки (`ErrorResponse`)
Усі помилки повертаються в стандартизованому JSON-форматі:
```json
{
  "error": "ValidationError",
  "code": "TITLE_REQUIRED",
  "details": [
    {
      "field": "title",
      "message": "Title is required and cannot be empty"
    }
  ]
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
Покриває доменний шар, сервісний рівень `PageService` (успішні та помилкові випадки), а також ендпоінти API:
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