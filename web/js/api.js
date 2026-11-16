// Запити до API курсового проєкту. Під капотом — fetchWithResilience з лаби 5
// (таймаути, ретраї, Retry-After, X-Request-Id), сюди додано токен входу та обробку помилок.

const session = {
    get token() {
        return localStorage.getItem("docuflow.token");
    },
    save(data) {
        localStorage.setItem("docuflow.token", data.token);
    },
    clear() {
        localStorage.removeItem("docuflow.token");
    },
};

// Помилка API з полями єдиного формату { error, code, details, requestId }
class ApiError extends Error {
    constructor(status, data) {
        const detail = data && data.details && data.details[0] && data.details[0].message;
        super(ApiError.translate(data && data.code) || detail || `Помилка ${status}`);
        this.status = status;
        this.code = data && data.code;
        this.requestId = data && data.requestId;
    }

    // Зрозумілі користувачу тексти для найчастіших кодів помилок
    static translate(code) {
        const messages = {
            INVALID_CREDENTIALS: "Неправильний email або пароль",
            EMAIL_TAKEN: "Користувач з таким email уже існує",
            WEAK_PASSWORD: "Пароль має містити щонайменше 8 символів",
            INVALID_EMAIL: "Некоректний email",
            FORBIDDEN: "Ваша роль не дозволяє цю дію",
            OWNER_ONLY: "Це може зробити лише власник компанії",
            LAST_OWNER: "У компанії має залишитися хоча б один власник",
            ALREADY_MEMBER: "Ця людина вже працює в компанії",
            PAGE_CYCLE: "Не можна перемістити сторінку всередину неї самої",
            DEPARTMENT_CYCLE: "Не можна перемістити відділ всередину нього самого",
            FILE_TOO_LARGE: "Файл більший за 10 МБ",
            FILE_TYPE_NOT_ALLOWED: "Дозволені PDF, Word, Excel, ODT/ODS, TXT, CSV, PNG, JPG, WEBP",
            TITLE_REQUIRED: "Вкажіть назву",
            INVALID_QUERY: "Введіть щонайменше 2 символи",
            TOO_MANY_REQUESTS: "Забагато запитів, зачекайте кілька секунд",
        };
        return messages[code];
    }
}

async function api(method, path, { body, idempotencyKey, timeoutMs = 8000, retries = 2, raw = false } = {}) {
    const extraHeaders = {};
    if (session.token) extraHeaders.Authorization = "Bearer " + session.token;

    let res;
    try {
        res = await fetchWithResilience("/api" + path, { method, body, idempotencyKey, extraHeaders, timeoutMs, retries });
    } catch (err) {
        throw new ApiError(0, { details: [{ message: "Сервер недоступний (" + err.message + ")" }] });
    }

    // Токен прострочений або доступ відкликано — повертаємося на сторінку входу
    if (res.status === 401 && path !== "/auth/login") {
        session.clear();
        location.href = "index.html";
        throw new ApiError(401, null);
    }
    if (raw && res.ok) return res;
    if (res.status === 204) return null;

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
}
