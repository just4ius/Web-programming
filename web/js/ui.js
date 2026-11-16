// Дрібні помічники для інтерфейсу. Увесь текст вставляється через textContent,
// тому HTML/JS з даних користувача ніколи не виконується (захист від XSS).

// el("button", { className: "btn", onclick: fn }, "Текст", childElement)
function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
        else if (key === "className") node.className = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key in node && typeof value !== "string") node[key] = value;
        else node.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

function clear(node) {
    node.replaceChildren();
    return node;
}

// Коротке повідомлення в куті екрана
function toast(message, type = "info") {
    const box = document.getElementById("toasts");
    const item = el("div", { className: `toast toast-${type}` }, message);
    box.append(item);
    setTimeout(() => item.remove(), 4000);
}

function showError(err) {
    toast(err.message || String(err), "error");
}

const ROLE_LABELS = { owner: "Власник", admin: "Адміністратор", editor: "Редактор", viewer: "Глядач" };
const ROLE_ORDER = ["viewer", "editor", "admin", "owner"];

// Те саме правило RBAC, що й на бекенді (domain/Member.js) — щоб ховати недоступні кнопки
const PERMISSIONS = {
    "content:write": "editor",
    "files:write": "editor",
    "org:manage": "admin",
    "members:manage": "admin",
    "trash:purge": "admin",
};

function can(role, permission) {
    return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(PERMISSIONS[permission]);
}

function formatDate(value) {
    return new Date(value).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + " Б";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " КБ";
    return (bytes / 1024 / 1024).toFixed(1) + " МБ";
}

// Універсальна форма у модальному вікні. Повертає об'єкт зі значеннями або null, якщо скасовано.
// fields: [{ name, label, type: "text"|"email"|"password"|"number"|"textarea"|"select", value, options: [{value, label}], required }]
function openForm({ title, fields, submitText = "Зберегти" }) {
    return new Promise((resolve) => {
        const dialog = el("dialog", { className: "modal" });
        const form = el("form", { method: "dialog" });
        const inputs = {};

        form.append(el("h3", {}, title));
        for (const f of fields) {
            let input;
            if (f.type === "select") {
                input = el("select", { name: f.name },
                    f.options.map((o) => el("option", { value: o.value, selected: String(o.value) === String(f.value ?? "") }, o.label)));
            } else if (f.type === "textarea") {
                input = el("textarea", { name: f.name, rows: 4, required: f.required });
                input.value = f.value ?? "";
            } else {
                input = el("input", { name: f.name, type: f.type || "text", required: f.required, min: f.min, max: f.max });
                input.value = f.value ?? "";
            }
            inputs[f.name] = input;
            form.append(el("label", { className: "field" }, el("span", {}, f.label), input, f.hint ? el("small", {}, f.hint) : null));
        }

        const cancel = el("button", { type: "button", className: "btn btn-ghost", onclick: () => dialog.close("cancel") }, "Скасувати");
        form.append(el("div", { className: "modal-actions" }, cancel, el("button", { type: "submit", className: "btn", value: "ok" }, submitText)));
        dialog.append(form);
        document.body.append(dialog);

        dialog.addEventListener("close", () => {
            const values = {};
            for (const [name, input] of Object.entries(inputs)) values[name] = input.value;
            dialog.remove();
            resolve(dialog.returnValue === "ok" ? values : null);
        });
        dialog.showModal();
        const first = form.querySelector("input, textarea, select");
        if (first) first.focus();
    });
}
