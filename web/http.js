// HTTP-хелпер для Практичної 5: таймаут, ретраї з backoff, Retry-After, X-Request-Id, Idempotency-Key

const API_BASE = "http://localhost:8080";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Експоненційна затримка з джитером: 300, 600, 1200 ... + випадкові 0-99 мс
const backoff = (baseDelayMs, attempt) =>
    baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100);

async function fetchWithResilience(path, options = {}) {
    const {
        method = "GET",
        body,
        idempotencyKey,
        extraHeaders = {},
        retries = 2,
        baseDelayMs = 300,
        timeoutMs = 3000,
    } = options;

    // Один X-Request-Id на всі спроби, щоб їх можна було знайти в логах сервера
    const requestId = crypto.randomUUID();

    for (let attempt = 0; ; attempt++) {
        const headers = { "X-Request-Id": requestId, ...extraHeaders };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

        // Таймаут: якщо сервер не відповів за timeoutMs, запит скасовується
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const canRetry = attempt < retries;

        try {
            const res = await fetch(API_BASE + path, {
                method,
                headers,
                body: body !== undefined ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });

            log(`${method} ${path} → ${res.status} (спроба ${attempt + 1}, X-Request-Id: ${requestId})`);

            // 429: чекаємо стільки, скільки сказав сервер у Retry-After (якщо заголовок недоступний — 2 с)
            if (res.status === 429 && canRetry) {
                const waitSec = Number(res.headers.get("Retry-After")) || 2;
                log(`Ліміт запитів, чекаємо ${waitSec} с (Retry-After)`);
                await sleep(waitSec * 1000);
                continue;
            }

            // 5xx: повторюємо з експоненційною затримкою
            if (res.status >= 500 && canRetry) {
                const delay = backoff(baseDelayMs, attempt);
                log(`Помилка сервера, повтор через ${delay} мс`);
                await sleep(delay);
                continue;
            }

            return res;
        } catch (err) {
            // Мережевий збій або таймаут (AbortController)
            const reason = err.name === "AbortError" ? `таймаут ${timeoutMs} мс` : "мережева помилка";
            log(`${method} ${path} → ${reason} (спроба ${attempt + 1}, X-Request-Id: ${requestId})`);

            if (!canRetry) throw new Error(reason);

            const delay = backoff(baseDelayMs, attempt);
            log(`Повтор через ${delay} мс`);
            await sleep(delay);
        } finally {
            clearTimeout(timer);
        }
    }
}

// Idempotency-Key: однакові дані → той самий ключ (поки запит не завершився успіхом)
async function payloadHash(obj) {
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

async function getOrReuseKey(payload) {
    const storageKey = "idem:" + (await payloadHash(payload));
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(storageKey, fresh);
    return fresh;
}

async function forgetKey(payload) {
    localStorage.removeItem("idem:" + (await payloadHash(payload)));
}

// Текст помилки з єдиного формату { error, code, details, requestId }
async function errorText(res) {
    try {
        const data = await res.json();
        const message = data.details?.[0]?.message || data.error;
        return `${res.status} ${data.code || data.error}: ${message} (requestId: ${data.requestId})`;
    } catch {
        return `HTTP ${res.status}`;
    }
}
