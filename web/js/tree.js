// Дерево розділів і сторінок у бічній панелі
const Tree = {
    // Які гілки розгорнуті — пам'ятаємо між перезавантаженнями
    expanded: new Set(JSON.parse(localStorage.getItem("docuflow.expanded") || "[]")),
    activeId: null,

    saveExpanded() {
        localStorage.setItem("docuflow.expanded", JSON.stringify([...this.expanded]));
    },

    childrenOf(parentId) {
        return App.pages.filter((p) => p.parentId === parentId);
    },

    // Розгорнути всіх предків, щоб відкрита сторінка була видна в дереві
    reveal(pageId) {
        const byId = new Map(App.pages.map((p) => [p.id, p]));
        let current = byId.get(pageId);
        while (current && current.parentId) {
            this.expanded.add(current.parentId);
            current = byId.get(current.parentId);
        }
        this.saveExpanded();
    },

    setActive(pageId) {
        this.activeId = pageId;
        if (pageId) this.reveal(pageId);
        this.render();
    },

    render() {
        const root = clear(document.getElementById("pageTree"));
        const top = this.childrenOf(null);
        if (top.length === 0) {
            root.append(el("li", { className: "tree-empty" }, App.can("content:write") ? "Створіть перший розділ кнопкою ＋" : "Розділів ще немає"));
        }
        top.forEach((page) => root.append(this.renderNode(page)));
    },

    renderNode(page) {
        const children = this.childrenOf(page.id);
        const isOpen = this.expanded.has(page.id);

        const toggle = el("button", {
            className: "tree-toggle" + (children.length ? "" : " invisible"),
            "aria-label": isOpen ? "Згорнути" : "Розгорнути",
            onclick: () => {
                if (isOpen) this.expanded.delete(page.id);
                else this.expanded.add(page.id);
                this.saveExpanded();
                this.render();
            },
        }, isOpen ? "▾" : "▸");

        const link = el("a", { href: `#/page/${page.id}`, className: "tree-link" },
            el("span", { className: "tree-icon" }, page.icon || "📄"),
            el("span", { className: "tree-title" }, page.title));

        const add = App.can("content:write")
            ? el("button", { className: "tree-add", title: "Додати підсторінку", onclick: () => createPageFlow(page.id) }, "＋")
            : null;

        const row = el("div", { className: "tree-row" + (page.id === this.activeId ? " active" : "") }, toggle, link, add);
        const item = el("li", {}, row);
        if (children.length && isOpen) {
            item.append(el("ul", {}, children.map((child) => this.renderNode(child))));
        }
        return item;
    },
};

// Створення сторінки: модальна форма → POST /api/pages з Idempotency-Key (лаба 5)
async function createPageFlow(parentId = null) {
    const parent = parentId ? App.pages.find((p) => p.id === parentId) : null;
    const values = await openForm({
        title: parent ? `Нова сторінка в «${parent.title}»` : "Новий розділ",
        submitText: "Створити",
        fields: [
            { name: "title", label: "Назва", required: true },
            { name: "icon", label: "Іконка (емодзі, необов'язково)", value: parent ? "📄" : "📁" },
        ],
    });
    if (!values) return;
    try {
        const page = await api("POST", "/pages", {
            body: { title: values.title, icon: values.icon || null, parentId },
            idempotencyKey: crypto.randomUUID(),
        });
        if (parentId) Tree.expanded.add(parentId);
        await App.reloadPages();
        location.hash = `#/page/${page.id}?edit=1`;
    } catch (err) {
        showError(err);
    }
}
