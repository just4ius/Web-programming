// Працівники компанії: ролі доступу та посади
const Members = {
    async render() {
        const [members, org] = await Promise.all([api("GET", "/members"), api("GET", "/org")]);
        const manage = App.can("members:manage");
        const positionTitle = (id) => {
            const pos = org.positions.find((p) => p.id === id);
            return pos ? pos.title : "—";
        };
        const positionOptions = [{ value: "", label: "— Без посади —" }, ...org.positions.map((p) => ({ value: p.id, label: p.title }))];
        // Адміністратор не може видати роль власника
        const roleOptions = ROLE_ORDER.slice().reverse()
            .filter((r) => r !== "owner" || App.role === "owner")
            .map((r) => ({ value: r, label: ROLE_LABELS[r] }));

        const update = async (m, body) => {
            try {
                await api("PATCH", `/members/${m.userId}`, { body });
                toast("Збережено ✔", "success");
            } catch (err) {
                showError(err);
            }
            await Members.render();
        };

        const remove = async (m) => {
            if (!confirm(`Видалити ${m.name} з компанії?`)) return;
            try {
                await api("DELETE", `/members/${m.userId}`);
                await Members.render();
            } catch (err) {
                showError(err);
            }
        };

        const select = (options, value, onchange, disabled) => el("select", { disabled, onchange },
            options.map((o) => el("option", { value: o.value, selected: String(o.value) === String(value ?? "") }, o.label)));

        const rows = members.map((m) => {
            const editable = manage && (m.role !== "owner" || App.role === "owner");
            return el("tr", {},
                el("td", {}, el("strong", {}, m.name), m.userId === App.user.id ? el("span", { className: "muted" }, " (ви)") : null),
                el("td", {}, m.email),
                el("td", {}, editable
                    ? select(m.role === "owner" && App.role !== "owner" ? [{ value: "owner", label: ROLE_LABELS.owner }] : roleOptions, m.role, (e) => update(m, { role: e.target.value }))
                    : el("span", { className: `role-badge role-${m.role}` }, ROLE_LABELS[m.role])),
                el("td", {}, editable
                    ? select(positionOptions, m.positionId, (e) => update(m, { positionId: e.target.value ? Number(e.target.value) : null }))
                    : positionTitle(m.positionId)),
                el("td", {}, editable && m.userId !== App.user.id
                    ? el("button", { className: "icon-btn danger", title: "Видалити з компанії", onclick: () => remove(m) }, "✕")
                    : null));
        });

        clear(view).append(
            el("header", { className: "page-header" },
                el("h1", {}, "👥 Працівники"),
                el("p", { className: "muted" }, "Власник — усе; адміністратор — працівники й оргструктура; редактор — документи; глядач — лише перегляд."),
                manage ? el("div", { className: "page-actions" }, el("button", { className: "btn", onclick: () => this.add(roleOptions, positionOptions) }, "＋ Додати працівника")) : null),
            el("div", { className: "table-wrap" }, el("table", { className: "data-table" },
                el("thead", {}, el("tr", {}, ["Ім'я", "Email", "Роль", "Посада", ""].map((h) => el("th", {}, h)))),
                el("tbody", {}, rows))),
        );
    },

    async add(roleOptions, positionOptions) {
        const values = await openForm({
            title: "Новий працівник",
            submitText: "Додати",
            fields: [
                { name: "name", label: "Ім'я та прізвище", required: true },
                { name: "email", label: "Email (логін)", type: "email", required: true },
                { name: "password", label: "Тимчасовий пароль", required: true, value: tempPassword(), hint: "Передайте його працівнику — він зможе увійти одразу" },
                { name: "role", label: "Роль", type: "select", options: roleOptions, value: "viewer" },
                { name: "positionId", label: "Посада", type: "select", options: positionOptions },
            ],
        });
        if (!values) return;
        try {
            await api("POST", "/members", {
                body: { ...values, positionId: values.positionId ? Number(values.positionId) : null },
                retries: 0,
            });
            toast(`${values.name} додано. Пароль: ${values.password}`, "success");
            await this.render();
        } catch (err) {
            showError(err);
        }
    },
};

// Випадковий пароль з 10 символів (без схожих символів 0/O, 1/l)
function tempPassword() {
    const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(10));
    return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
