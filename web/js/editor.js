// Сторінка бази знань: перегляд, блоковий редактор і файли-документи

const BLOCK_TYPES = [
    { type: "paragraph", label: "Текст", add: "Текст" },
    { type: "h1", label: "Заголовок 1" },
    { type: "h2", label: "Заголовок 2", add: "Заголовок" },
    { type: "h3", label: "Заголовок 3" },
    { type: "bullet", label: "• Маркований список", add: "Список" },
    { type: "numbered", label: "1. Нумерований список", add: "Нумерація" },
    { type: "todo", label: "☑ Чекбокс", add: "Чекбокс" },
    { type: "quote", label: "❝ Цитата", add: "Цитата" },
    { type: "callout", label: "💡 Примітка", add: "Примітка" },
    { type: "code", label: "</> Код", add: "Код" },
    { type: "table", label: "▦ Таблиця", add: "Таблиця" },
    { type: "divider", label: "— Роздільник", add: "Роздільник" },
];

function newBlock(type) {
    if (type === "table") return { type, content: "", data: { rows: [["Колонка 1", "Колонка 2"], ["", ""]] } };
    if (type === "todo") return { type, content: "", data: { checked: false } };
    return { type, content: "", data: {} };
}

const Editor = {
    page: null,
    draft: null, // копія блоків під час редагування
    editing: false,
    dirty: false,

    async open(id, { edit = false } = {}) {
        this.page = await api("GET", `/pages/${id}`);
        this.editing = edit && App.can("content:write");
        this.draft = this.editing ? structuredClone(this.page.blocks) : null;
        this.dirty = false;
        if (edit && this.editing) history.replaceState(null, "", `#/page/${id}`);
        this.render();
    },

    render() {
        const page = this.page;
        clear(view).append(...[
            this.renderBreadcrumbs(page),
            this.editing ? this.renderEditHeader(page) : this.renderViewHeader(page),
            this.editing ? this.renderEditor() : this.renderBlocks(page.blocks),
            this.renderAttachments(page),
            this.renderChildren(page),
        ].filter(Boolean));
    },

    renderBreadcrumbs(page) {
        const crumbs = page.breadcrumbs.slice(0, -1);
        return el("nav", { className: "breadcrumbs" },
            el("a", { href: "#/" }, "🏠"),
            crumbs.map((c) => [el("span", {}, " / "), el("a", { href: `#/page/${c.id}` }, `${c.icon || ""} ${c.title}`)]));
    },

    renderViewHeader(page) {
        const actions = App.can("content:write") ? el("div", { className: "page-actions" },
            el("button", { className: "btn", onclick: () => this.startEditing() }, "✏️ Редагувати"),
            el("button", { className: "btn btn-ghost", onclick: () => createPageFlow(page.id) }, "＋ Підсторінка"),
            el("button", { className: "btn btn-ghost", onclick: () => this.move() }, "↪ Перемістити"),
            el("button", { className: "btn btn-ghost danger", onclick: () => this.archive() }, "🗑️ У кошик"),
        ) : null;
        return el("header", { className: "page-header" },
            el("h1", { className: "page-title" }, el("span", { className: "page-icon" }, page.icon || "📄"), page.title),
            el("p", { className: "muted" }, `Оновлено ${formatDate(page.updatedAt)}`),
            actions);
    },

    // ---------- Перегляд ----------

    renderBlocks(blocks) {
        const body = el("article", { className: "page-body" });
        if (blocks.length === 0) {
            body.append(el("p", { className: "muted" }, App.can("content:write") ? "Сторінка порожня. Натисніть «Редагувати», щоб додати вміст." : "Сторінка порожня."));
        }
        let list = null; // поточний <ul>/<ol> для сусідніх пунктів списку
        blocks.forEach((block, index) => {
            const listTag = block.type === "bullet" ? "ul" : block.type === "numbered" ? "ol" : null;
            if (listTag) {
                if (!list || list.tagName.toLowerCase() !== listTag) {
                    list = el(listTag);
                    body.append(list);
                }
                list.append(el("li", {}, block.content));
                return;
            }
            list = null;
            body.append(this.renderBlock(block, index));
        });
        return body;
    },

    renderBlock(block, index) {
        switch (block.type) {
            case "h1": return el("h1", {}, block.content);
            case "h2": return el("h2", {}, block.content);
            case "h3": return el("h3", {}, block.content);
            case "quote": return el("blockquote", {}, block.content);
            case "callout": return el("div", { className: "callout" }, el("span", {}, "💡"), el("div", {}, block.content));
            case "code": return el("pre", {}, el("code", {}, block.content));
            case "divider": return el("hr");
            case "todo": {
                const box = el("input", {
                    type: "checkbox",
                    checked: Boolean(block.data.checked),
                    disabled: !App.can("content:write"),
                    onchange: (e) => this.toggleTodo(index, e.target.checked),
                });
                return el("label", { className: "todo" + (block.data.checked ? " done" : "") }, box, el("span", {}, block.content));
            }
            case "table": {
                const [head, ...rows] = block.data.rows || [[]];
                return el("div", { className: "table-wrap" }, el("table", {},
                    el("thead", {}, el("tr", {}, head.map((c) => el("th", {}, c)))),
                    el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c) => el("td", {}, c)))))));
            }
            default: return el("p", {}, block.content);
        }
    },

    // Чекбокс можна відмітити без входу в режим редагування
    async toggleTodo(index, checked) {
        const blocks = structuredClone(this.page.blocks);
        blocks[index].data.checked = checked;
        try {
            this.page.blocks = await api("PUT", `/pages/${this.page.id}/blocks`, { body: { blocks } });
            this.render();
        } catch (err) {
            showError(err);
            this.render();
        }
    },

    // ---------- Редагування ----------

    startEditing() {
        this.editing = true;
        this.draft = structuredClone(this.page.blocks);
        this.render();
    },

    markDirty() {
        this.dirty = true;
    },

    renderEditHeader(page) {
        this.iconInput = el("input", { className: "icon-input", value: page.icon || "", maxlength: 16, placeholder: "📄", oninput: () => this.markDirty() });
        this.titleInput = el("input", { className: "title-input", value: page.title, maxlength: 255, required: true, oninput: () => this.markDirty() });
        return el("header", { className: "page-header editing" },
            el("div", { className: "title-row" }, this.iconInput, this.titleInput),
            el("div", { className: "page-actions sticky" },
                el("button", { className: "btn", onclick: () => this.save() }, "💾 Зберегти"),
                el("button", { className: "btn btn-ghost", onclick: () => this.cancel() }, "Скасувати"),
                el("span", { className: "muted" }, "Ctrl+S — зберегти")));
    },

    renderEditor() {
        const list = el("div", { className: "block-editor" });
        this.draft.forEach((block, index) => list.append(this.renderBlockEditor(block, index)));
        if (this.draft.length === 0) list.append(el("p", { className: "muted" }, "Додайте перший блок кнопками нижче."));

        const addBar = el("div", { className: "add-bar" },
            el("span", { className: "muted" }, "Додати:"),
            BLOCK_TYPES.filter((t) => t.add).map((t) => el("button", {
                className: "chip",
                onclick: () => {
                    this.draft.push(newBlock(t.type));
                    this.markDirty();
                    this.render();
                    const rows = view.querySelectorAll(".block-row");
                    const field = rows.length && rows[rows.length - 1].querySelector("textarea, td input");
                    if (field) field.focus();
                },
            }, "+ " + t.add)));
        return el("section", {}, list, addBar);
    },

    renderBlockEditor(block, index) {
        const typeSelect = el("select", {
            className: "type-select",
            onchange: (e) => {
                const fresh = newBlock(e.target.value);
                // Текст зберігаємо при зміні типу (крім таблиці/роздільника)
                if (!["table", "divider"].includes(fresh.type)) fresh.content = block.content;
                this.draft[index] = fresh;
                this.markDirty();
                this.render();
            },
        }, BLOCK_TYPES.map((t) => el("option", { value: t.type, selected: t.type === block.type }, t.label)));

        const move = (delta) => {
            const target = index + delta;
            if (target < 0 || target >= this.draft.length) return;
            [this.draft[index], this.draft[target]] = [this.draft[target], this.draft[index]];
            this.markDirty();
            this.render();
        };

        const controls = el("div", { className: "block-controls" },
            typeSelect,
            el("button", { className: "icon-btn", title: "Вище", onclick: () => move(-1) }, "↑"),
            el("button", { className: "icon-btn", title: "Нижче", onclick: () => move(1) }, "↓"),
            el("button", {
                className: "icon-btn danger", title: "Видалити блок",
                onclick: () => { this.draft.splice(index, 1); this.markDirty(); this.render(); },
            }, "✕"));

        return el("div", { className: `block-row block-${block.type}` }, controls, this.renderBlockInput(block));
    },

    renderBlockInput(block) {
        if (block.type === "divider") return el("hr");
        if (block.type === "table") return this.renderTableEditor(block);

        const area = el("textarea", {
            rows: 1,
            placeholder: block.type.startsWith("h") ? "Заголовок" : "Текст...",
            oninput: (e) => {
                block.content = e.target.value;
                this.markDirty();
                autoGrow(e.target);
            },
        });
        area.value = block.content;
        requestAnimationFrame(() => autoGrow(area));

        if (block.type === "todo") {
            const box = el("input", { type: "checkbox", checked: Boolean(block.data.checked), onchange: (e) => { block.data.checked = e.target.checked; this.markDirty(); } });
            return el("div", { className: "todo-edit" }, box, area);
        }
        return area;
    },

    renderTableEditor(block) {
        const rows = block.data.rows;
        const change = () => { this.markDirty(); this.render(); };
        const table = el("table", { className: "table-edit" },
            rows.map((row, r) => el("tr", {}, row.map((cell, c) => el("td", {},
                el("input", {
                    value: cell,
                    className: r === 0 ? "th" : "",
                    oninput: (e) => { rows[r][c] = e.target.value; this.markDirty(); },
                }))))));
        return el("div", { className: "table-wrap" }, table, el("div", { className: "table-tools" },
            el("button", { className: "chip", onclick: () => { rows.push(rows[0].map(() => "")); change(); } }, "+ рядок"),
            el("button", { className: "chip", onclick: () => { rows.forEach((row) => row.push("")); change(); } }, "+ стовпець"),
            el("button", { className: "chip", disabled: rows.length <= 1, onclick: () => { rows.pop(); change(); } }, "− рядок"),
            el("button", { className: "chip", disabled: rows[0].length <= 1, onclick: () => { rows.forEach((row) => row.pop()); change(); } }, "− стовпець")));
    },

    async save() {
        const title = this.titleInput.value.trim();
        if (!title) {
            toast("Вкажіть назву сторінки", "error");
            this.titleInput.focus();
            return;
        }
        try {
            const icon = this.iconInput.value.trim() || null;
            if (title !== this.page.title || icon !== this.page.icon) {
                await api("PATCH", `/pages/${this.page.id}`, { body: { title, icon } });
            }
            await api("PUT", `/pages/${this.page.id}/blocks`, { body: { blocks: this.draft } });
            this.dirty = false;
            toast("Збережено ✔", "success");
            await App.reloadPages();
            await this.open(this.page.id);
        } catch (err) {
            showError(err);
        }
    },

    cancel() {
        if (this.dirty && !confirm("Скасувати незбережені зміни?")) return;
        this.dirty = false;
        this.editing = false;
        this.render();
    },

    // ---------- Дії зі сторінкою ----------

    async move() {
        // Не можна перенести сторінку в саму себе або в свою підсторінку
        const banned = new Set([this.page.id]);
        let added = true;
        while (added) {
            added = false;
            for (const p of App.pages) {
                if (p.parentId && banned.has(p.parentId) && !banned.has(p.id)) {
                    banned.add(p.id);
                    added = true;
                }
            }
        }
        const options = [{ value: "", label: "— Верхній рівень —" }].concat(
            App.pages.filter((p) => !banned.has(p.id)).map((p) => ({ value: p.id, label: `${p.icon || "📄"} ${p.title}` })));
        const values = await openForm({
            title: `Перемістити «${this.page.title}»`,
            submitText: "Перемістити",
            fields: [{ name: "parentId", label: "Новий батьківський розділ", type: "select", options, value: this.page.parentId ?? "" }],
        });
        if (!values) return;
        try {
            await api("PATCH", `/pages/${this.page.id}`, { body: { parentId: values.parentId ? Number(values.parentId) : null } });
            await App.reloadPages();
            Tree.setActive(this.page.id);
            await this.open(this.page.id);
            toast("Сторінку переміщено", "success");
        } catch (err) {
            showError(err);
        }
    },

    async archive() {
        const subpages = this.page.children.length ? " разом з підсторінками" : "";
        if (!confirm(`Перемістити «${this.page.title}»${subpages} у кошик?`)) return;
        try {
            const result = await api("DELETE", `/pages/${this.page.id}`);
            toast(`У кошику: ${result.archived} стор.`, "success");
            const parentId = this.page.parentId;
            await App.reloadPages();
            location.hash = parentId ? `#/page/${parentId}` : "#/";
        } catch (err) {
            showError(err);
        }
    },

    // ---------- Файли ----------

    renderAttachments(page) {
        const section = el("section", { className: "attachments" }, el("h3", {}, `📎 Документи (${page.attachments.length})`));
        const list = el("ul", { className: "file-list" });
        page.attachments.forEach((file) => list.append(el("li", {},
            el("span", { className: "file-icon" }, fileIcon(file.mimeType)),
            el("div", { className: "file-info" },
                el("strong", {}, file.fileName),
                el("small", { className: "muted" }, `${formatSize(file.sizeBytes)} · ${file.uploadedBy || "—"} · ${formatDate(file.createdAt)}`)),
            el("button", { className: "btn btn-ghost btn-small", onclick: () => downloadFile(file) }, "Скачати"),
            App.can("files:write") ? el("button", { className: "btn btn-ghost btn-small danger", onclick: () => this.deleteFile(file) }, "Видалити") : null)));
        if (page.attachments.length === 0) list.append(el("li", { className: "muted" }, "Файлів поки немає."));
        section.append(list);

        if (App.can("files:write")) {
            const input = el("input", { type: "file", hidden: true, onchange: (e) => this.upload(e.target.files[0]) });
            const drop = el("div", {
                className: "dropzone",
                onclick: () => input.click(),
                ondragover: (e) => { e.preventDefault(); drop.classList.add("over"); },
                ondragleave: () => drop.classList.remove("over"),
                ondrop: (e) => { e.preventDefault(); drop.classList.remove("over"); this.upload(e.dataTransfer.files[0]); },
            }, "Перетягніть файл сюди або натисніть, щоб вибрати (PDF, Word, Excel, зображення — до 10 МБ)");
            section.append(drop, input);
        }
        return section;
    },

    async upload(file) {
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) {
            toast("Файл більший за 10 МБ", "error");
            return;
        }
        const form = new FormData();
        form.append("file", file);
        toast(`Завантаження «${file.name}»...`);
        try {
            // Завантаження не повторюємо автоматично і даємо більше часу
            await api("POST", `/pages/${this.page.id}/attachments`, { body: form, retries: 0, timeoutMs: 60000 });
            toast("Файл завантажено ✔", "success");
            await this.open(this.page.id);
        } catch (err) {
            showError(err);
        }
    },

    async deleteFile(file) {
        if (!confirm(`Видалити файл «${file.fileName}»?`)) return;
        try {
            await api("DELETE", `/attachments/${file.id}`);
            await this.open(this.page.id);
        } catch (err) {
            showError(err);
        }
    },

    renderChildren(page) {
        if (page.children.length === 0) return null;
        return el("section", { className: "children" },
            el("h3", {}, "Підсторінки"),
            el("div", { className: "cards" }, page.children.map((c) =>
                el("a", { className: "card", href: `#/page/${c.id}` }, el("span", { className: "card-icon" }, c.icon || "📄"), c.title))));
    },
};

function autoGrow(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
}

function fileIcon(mime) {
    if (mime === "application/pdf") return "📕";
    if (mime.includes("word") || mime.includes("opendocument.text")) return "📘";
    if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return "📗";
    if (mime.startsWith("image/")) return "🖼️";
    return "📄";
}

// Скачування з токеном: отримуємо файл як blob і «клікаємо» тимчасове посилання
async function downloadFile(file) {
    try {
        const res = await api("GET", `/attachments/${file.id}/download`, { raw: true, timeoutMs: 60000 });
        const url = URL.createObjectURL(await res.blob());
        const link = el("a", { href: url, download: file.fileName });
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
        showError(err);
    }
}

// Ctrl+S у режимі редагування
document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && Editor.editing) {
        e.preventDefault();
        Editor.save();
    }
});
