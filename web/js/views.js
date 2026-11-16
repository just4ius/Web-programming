// Головна, результати пошуку та кошик
const Views = {
    async home() {
        const ws = await api("GET", "/workspace");
        const s = ws.stats;
        const recent = [...App.pages].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6);
        const sections = App.pages.filter((p) => p.parentId === null);

        const stat = (icon, value, label, href) => el(href ? "a" : "div", { className: "stat", href }, el("span", { className: "stat-icon" }, icon), el("strong", {}, value), el("span", {}, label));

        clear(view).append(
            el("header", { className: "page-header" },
                el("h1", {}, `Вітаємо, ${App.user.name.split(" ")[0]}! 👋`),
                el("p", { className: "muted" }, `${ws.name} · ваша роль: ${ROLE_LABELS[App.role]}`)),
            el("div", { className: "stats" },
                stat("📄", s.pages, "сторінок"),
                stat("📎", s.documents, "документів"),
                stat("👥", s.members, "працівників", "#/members"),
                stat("🏢", s.departments, "відділів", "#/org"),
                stat("💼", s.positions, "посад", "#/org")),
            el("section", {},
                el("h3", {}, "Розділи"),
                sections.length
                    ? el("div", { className: "cards" }, sections.map((p) => el("a", { className: "card", href: `#/page/${p.id}` }, el("span", { className: "card-icon" }, p.icon || "📁"), p.title)))
                    : el("p", { className: "muted" }, App.can("content:write") ? "Почніть зі створення розділів: «Статутні документи», «Регламенти», «Посадові інструкції»." : "Розділів поки немає."),
                App.can("content:write") ? el("button", { className: "btn btn-ghost", onclick: () => createPageFlow(null) }, "＋ Новий розділ") : null),
            el("section", {},
                el("h3", {}, "Нещодавно оновлені"),
                el("ul", { className: "recent" }, recent.map((p) => el("li", {},
                    el("a", { href: `#/page/${p.id}` }, `${p.icon || "📄"} ${p.title}`),
                    el("span", { className: "muted" }, formatDate(p.updatedAt)))))),
        );
    },

    async search(q) {
        document.getElementById("searchInput").value = q;
        const results = await api("GET", "/search?q=" + encodeURIComponent(q));
        clear(view).append(
            el("header", { className: "page-header" },
                el("h1", {}, "Пошук"),
                el("p", { className: "muted" }, `«${q}» — знайдено: ${results.length}`)),
            results.length === 0
                ? el("p", {}, "Нічого не знайдено. Спробуйте інше слово або частину слова.")
                : el("ul", { className: "search-results" }, results.map((r) => el("li", {},
                    el("a", { href: `#/page/${r.id}` }, `${r.icon || "📄"} ${r.title}`),
                    r.snippet ? el("p", { className: "snippet" }, highlight(r.snippet, q)) : null))),
        );
    },

    async trash() {
        const items = await api("GET", "/trash");
        const restore = async (item) => {
            try {
                await api("POST", `/trash/${item.id}/restore`);
                toast(`«${item.title}» відновлено`, "success");
                await App.reloadPages();
                await Views.trash();
            } catch (err) {
                showError(err);
            }
        };
        const purge = async (item) => {
            if (!confirm(`Видалити «${item.title}» назавжди? Це не можна скасувати.`)) return;
            try {
                await api("DELETE", `/trash/${item.id}`);
                await Views.trash();
            } catch (err) {
                showError(err);
            }
        };

        clear(view).append(
            el("header", { className: "page-header" },
                el("h1", {}, "🗑️ Кошик"),
                el("p", { className: "muted" }, "Видалені сторінки можна відновити разом з підсторінками.")),
            items.length === 0 ? el("p", { className: "muted" }, "Кошик порожній.") : el("ul", { className: "trash-list" }, items.map((item) => el("li", {},
                el("div", {},
                    el("strong", {}, `${item.icon || "📄"} ${item.title}`),
                    el("small", { className: "muted" }, ` · видалено ${formatDate(item.archivedAt)}` + (item.childCount ? ` · підсторінок: ${item.childCount}` : ""))),
                el("div", { className: "row-actions" },
                    el("button", { className: "btn btn-small", onclick: () => restore(item) }, "Відновити"),
                    App.can("trash:purge") ? el("button", { className: "btn btn-ghost btn-small danger", onclick: () => purge(item) }, "Видалити назавжди") : null)))),
        );
    },
};

// Підсвічування знайденого слова: розбиваємо текст на частини, без innerHTML
function highlight(text, query) {
    const parts = [];
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    let pos = 0;
    let index;
    while ((index = lower.indexOf(q, pos)) !== -1) {
        parts.push(text.slice(pos, index), el("mark", {}, text.slice(index, index + q.length)));
        pos = index + q.length;
    }
    parts.push(text.slice(pos));
    return parts;
}
