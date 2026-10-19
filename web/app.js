const healthStatus = document.getElementById("healthStatus");
const pageForm = document.getElementById("pageForm");
const pageIcon = document.getElementById("pageIcon");
const pageTitle = document.getElementById("pageTitle");
const pagesList = document.getElementById("pagesList");
const pagesStatus = document.getElementById("pagesStatus");
const chaosToggle = document.getElementById("chaosToggle");
const degradedBanner = document.getElementById("degradedBanner");
const logBox = document.getElementById("log");

// ---------- Журнал ----------

function log(text) {
    const time = new Date().toLocaleTimeString();
    logBox.textContent = `[${time}] ${text}\n` + logBox.textContent;
}

// ---------- Degraded mode ----------

const FAIL_LIMIT = 3;       // скільки збоїв поспіль вмикає degraded mode
const PAUSE_SECONDS = 10;   // на скільки блокуються кнопки
let failCount = 0;

function enterDegradedMode() {
    let secondsLeft = PAUSE_SECONDS;
    document.querySelectorAll("button").forEach((btn) => (btn.disabled = true));
    degradedBanner.hidden = false;

    const tick = () => {
        degradedBanner.textContent =
            `Сервер перевантажений або недоступний. Спробуйте через ${secondsLeft} с.`;
        if (secondsLeft === 0) {
            clearInterval(timer);
            degradedBanner.hidden = true;
            document.querySelectorAll("button").forEach((btn) => (btn.disabled = false));
            failCount = 0;
        }
        secondsLeft--;
    };
    const timer = setInterval(tick, 1000);
    tick();
}

// Обгортка над fetchWithResilience: рахує збої поспіль
async function request(path, options = {}) {
    if (chaosToggle.checked) {
        options.extraHeaders = { ...options.extraHeaders, "X-Simulate-Chaos": "true" };
    }

    try {
        const res = await fetchWithResilience(path, options);
        if (res.status >= 500 || res.status === 429) {
            registerFailure();
        } else {
            failCount = 0;
        }
        return res;
    } catch (err) {
        registerFailure();
        throw err;
    }
}

function registerFailure() {
    failCount++;
    log(`Збій ${failCount} з ${FAIL_LIMIT} поспіль`);
    if (failCount >= FAIL_LIMIT) enterDegradedMode();
}

// ---------- Health (таймаут 1 с) ----------

async function checkHealth(extraHeaders = {}) {
    healthStatus.textContent = "сервер: перевірка...";
    healthStatus.className = "badge";
    try {
        const res = await request("/health", { timeoutMs: 1000, retries: 0, extraHeaders });
        const data = await res.json();
        healthStatus.textContent = "сервер: " + data.status;
        healthStatus.className = "badge ok";
    } catch (err) {
        healthStatus.textContent = "сервер: " + err.message;
        healthStatus.className = "badge bad";
    }
}

document.getElementById("healthBtn").addEventListener("click", () => checkHealth());
document.getElementById("slowHealthBtn").addEventListener("click", () =>
    checkHealth({ "X-Simulate-Delay": "1500" })
);

// ---------- Сторінки: CRUD ----------

async function loadPages() {
    pagesStatus.textContent = "Завантаження...";
    try {
        const res = await request("/pages");
        if (!res.ok) {
            pagesStatus.textContent = await errorText(res);
            return;
        }
        const pages = await res.json();
        renderPages(pages);
        pagesStatus.textContent = pages.length === 0 ? "Сторінок ще немає" : "";
    } catch (err) {
        pagesStatus.textContent = "Не вдалося завантажити сторінки: " + err.message;
    }
}

function renderPages(pages) {
    pagesList.innerHTML = "";
    pages.forEach((page) => {
        const li = document.createElement("li");

        const title = document.createElement("span");
        title.className = "page-title";
        title.textContent = `${page.icon || "📄"} ${page.title}`;

        const renameBtn = document.createElement("button");
        renameBtn.textContent = "Перейменувати";
        renameBtn.className = "small secondary";
        renameBtn.addEventListener("click", () => renamePage(page));

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Видалити";
        deleteBtn.className = "small danger";
        deleteBtn.addEventListener("click", () => deletePage(page));

        li.append(title, renameBtn, deleteBtn);
        pagesList.appendChild(li);
    });
}

async function createPage(payload) {
    // Той самий ключ для всіх повторів цього створення → сервер не зробить дубль
    const key = await getOrReuseKey(payload);
    const res = await request("/pages", { method: "POST", body: payload, idempotencyKey: key });
    if (res.ok) await forgetKey(payload); // успіх: наступна така сама сторінка буде новою
    return res;
}

pageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = pageForm.querySelector("button");
    submitBtn.disabled = true;

    const payload = { title: pageTitle.value.trim() };
    if (pageIcon.value.trim()) payload.icon = pageIcon.value.trim();

    try {
        const res = await createPage(payload);
        if (res.status === 201) {
            const page = await res.json();
            log(`Створено сторінку id=${page.id}`);
            pageTitle.value = "";
            pageIcon.value = "";
            await loadPages();
        } else {
            pagesStatus.textContent = await errorText(res);
        }
    } catch (err) {
        pagesStatus.textContent = "Не вдалося створити сторінку: " + err.message;
    } finally {
        if (degradedBanner.hidden) submitBtn.disabled = false;
    }
});

async function renamePage(page) {
    const newTitle = prompt("Нова назва", page.title);
    if (newTitle === null) return;
    try {
        const res = await request(`/pages/${page.id}`, { method: "PUT", body: { title: newTitle } });
        if (res.ok) {
            await loadPages();
        } else {
            pagesStatus.textContent = await errorText(res);
        }
    } catch (err) {
        pagesStatus.textContent = "Не вдалося перейменувати: " + err.message;
    }
}

async function deletePage(page) {
    if (!confirm(`Видалити «${page.title}»?`)) return;
    try {
        const res = await request(`/pages/${page.id}`, { method: "DELETE" });
        if (res.status === 204) {
            await loadPages();
        } else {
            pagesStatus.textContent = await errorText(res);
        }
    } catch (err) {
        pagesStatus.textContent = "Не вдалося видалити: " + err.message;
    }
}

document.getElementById("reloadPagesBtn").addEventListener("click", loadPages);

// Два однакові POST одночасно з одним Idempotency-Key → обидва повертають той самий id
document.getElementById("doubleClickBtn").addEventListener("click", async () => {
    const payload = { title: "Тест подвійного кліку", icon: "🖱️" };
    const key = await getOrReuseKey(payload);
    try {
        const [a, b] = await Promise.all([
            request("/pages", { method: "POST", body: payload, idempotencyKey: key }),
            request("/pages", { method: "POST", body: payload, idempotencyKey: key }),
        ]);
        const [pageA, pageB] = await Promise.all([a.json(), b.json()]);
        log(`Подвійний клік: id перший=${pageA.id}, другий=${pageB.id} ` +
            (pageA.id === pageB.id ? "— дубля немає ✔" : "— ДУБЛЬ ✘"));
        await forgetKey(payload);
        await loadPages();
    } catch (err) {
        log("Подвійний клік не вдався: " + err.message);
    }
});

// ---------- Симуляція збою ----------

document.getElementById("errorBtn").addEventListener("click", async () => {
    try {
        const res = await request("/health", { extraHeaders: { "X-Simulate-Error": "503" } });
        log("Остаточна відповідь: " + (await errorText(res)));
    } catch (err) {
        log("Запит не вдався: " + err.message);
    }
});

// ---------- Практична 1: GET /items ----------

const loadBtn = document.getElementById("loadBtn");
const itemsList = document.getElementById("itemsList");
const statusMessage = document.getElementById("statusMessage");

loadBtn.addEventListener("click", async () => {
    loadBtn.disabled = true;
    statusMessage.textContent = "Завантаження...";
    itemsList.innerHTML = "";

    try {
        const response = await fetch(API_BASE + "/items");
        if (!response.ok) {
            throw new Error("HTTP помилка: " + response.status);
        }
        const items = await response.json();
        statusMessage.textContent = "";

        if (items.length === 0) {
            statusMessage.textContent = "Список порожній";
            return;
        }

        items.forEach(item => {
            const li = document.createElement("li");
            li.textContent = item.name || item.title || JSON.stringify(item);
            itemsList.appendChild(li);
        });
    } catch (error) {
        statusMessage.textContent = "Не вдалося отримати дані з сервера";
    } finally {
        if (degradedBanner.hidden) loadBtn.disabled = false;
    }
});

// ---------- Старт ----------

checkHealth();
loadPages();
