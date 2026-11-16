// Оргструктура: дерево відділів, посади, працівники на посадах і посадові інструкції
const Org = {
    data: null,

    async render() {
        this.data = await api("GET", "/org");
        const { departments } = this.data;
        const manage = App.can("org:manage");

        clear(view).append(
            el("header", { className: "page-header" },
                el("h1", {}, "🏢 Оргструктура"),
                el("p", { className: "muted" }, "Відділи, посади, працівники та посадові інструкції компанії."),
                manage ? el("div", { className: "page-actions" },
                    el("button", { className: "btn", onclick: () => this.editDepartment(null, null) }, "＋ Відділ"),
                    departments.length ? el("button", { className: "btn btn-ghost", onclick: () => this.editPosition(null) }, "＋ Посада") : null) : null),
            departments.length === 0
                ? el("p", { className: "muted" }, manage ? "Створіть перший відділ, наприклад «Дирекція»." : "Оргструктуру ще не заповнено.")
                : el("div", { className: "org-tree" }, departments.filter((d) => d.parentId === null).map((d) => this.renderDepartment(d))),
        );
    },

    renderDepartment(dept) {
        const { departments, positions, members } = this.data;
        const manage = App.can("org:manage");
        const subs = departments.filter((d) => d.parentId === dept.id);
        const deptPositions = positions.filter((p) => p.departmentId === dept.id);

        return el("div", { className: "dept" },
            el("div", { className: "dept-head" },
                el("div", {},
                    el("h3", {}, dept.name),
                    dept.description ? el("p", { className: "muted" }, dept.description) : null),
                manage ? el("div", { className: "row-actions" },
                    el("button", { className: "icon-btn", title: "Підвідділ", onclick: () => this.editDepartment(null, dept.id) }, "＋"),
                    el("button", { className: "icon-btn", title: "Посада", onclick: () => this.editPosition(null, dept.id) }, "💼"),
                    el("button", { className: "icon-btn", title: "Редагувати", onclick: () => this.editDepartment(dept) }, "✏️"),
                    el("button", { className: "icon-btn danger", title: "Видалити", onclick: () => this.deleteDepartment(dept) }, "✕")) : null),
            deptPositions.length ? el("ul", { className: "positions" }, deptPositions.map((pos) => {
                const holders = members.filter((m) => m.positionId === pos.id);
                const page = pos.instructionPageId ? App.pages.find((p) => p.id === pos.instructionPageId) : null;
                return el("li", {},
                    el("div", { className: "pos-main" },
                        el("strong", {}, pos.title),
                        el("span", { className: "muted" }, ` · штат: ${pos.headcount}, зайнято: ${holders.length}`),
                        pos.responsibilities ? el("p", {}, pos.responsibilities) : null,
                        holders.length ? el("p", { className: "holders" }, "👤 " + holders.map((h) => h.name).join(", ")) : null),
                    el("div", { className: "row-actions" },
                        page ? el("a", { className: "btn btn-ghost btn-small", href: `#/page/${page.id}` }, "📄 Інструкція") : null,
                        manage ? el("button", { className: "icon-btn", title: "Редагувати", onclick: () => this.editPosition(pos) }, "✏️") : null,
                        manage ? el("button", { className: "icon-btn danger", title: "Видалити", onclick: () => this.deletePosition(pos) }, "✕") : null));
            })) : null,
            subs.length ? el("div", { className: "dept-children" }, subs.map((d) => this.renderDepartment(d))) : null,
        );
    },

    deptOptions(excludeId = null) {
        return this.data.departments.filter((d) => d.id !== excludeId).map((d) => ({ value: d.id, label: d.name }));
    },

    async editDepartment(dept, parentId = null) {
        const values = await openForm({
            title: dept ? "Редагувати відділ" : "Новий відділ",
            fields: [
                { name: "name", label: "Назва", required: true, value: dept ? dept.name : "" },
                { name: "description", label: "Опис", type: "textarea", value: dept ? dept.description : "" },
                {
                    name: "parentId", label: "Входить до відділу", type: "select",
                    options: [{ value: "", label: "— Верхній рівень —" }, ...this.deptOptions(dept && dept.id)],
                    value: dept ? dept.parentId ?? "" : parentId ?? "",
                },
            ],
        });
        if (!values) return;
        const body = { name: values.name, description: values.description, parentId: values.parentId ? Number(values.parentId) : null };
        try {
            if (dept) await api("PATCH", `/departments/${dept.id}`, { body });
            else await api("POST", "/departments", { body });
            await this.render();
        } catch (err) {
            showError(err);
        }
    },

    async deleteDepartment(dept) {
        if (!confirm(`Видалити відділ «${dept.name}» разом з підвідділами та посадами?`)) return;
        try {
            await api("DELETE", `/departments/${dept.id}`);
            await this.render();
        } catch (err) {
            showError(err);
        }
    },

    async editPosition(pos, departmentId = null) {
        const pageOptions = [{ value: "", label: "— Немає —" }, ...App.pages.map((p) => ({ value: p.id, label: `${p.icon || "📄"} ${p.title}` }))];
        const values = await openForm({
            title: pos ? "Редагувати посаду" : "Нова посада",
            fields: [
                { name: "title", label: "Назва посади", required: true, value: pos ? pos.title : "" },
                { name: "departmentId", label: "Відділ", type: "select", options: this.deptOptions(), value: pos ? pos.departmentId : departmentId ?? "" },
                { name: "headcount", label: "Штатних одиниць", type: "number", min: 1, max: 1000, required: true, value: pos ? pos.headcount : 1 },
                { name: "responsibilities", label: "Основні обов'язки", type: "textarea", value: pos ? pos.responsibilities : "" },
                { name: "instructionPageId", label: "Посадова інструкція (сторінка)", type: "select", options: pageOptions, value: pos ? pos.instructionPageId ?? "" : "" },
            ],
        });
        if (!values) return;
        const body = {
            title: values.title,
            departmentId: Number(values.departmentId),
            headcount: Number(values.headcount),
            responsibilities: values.responsibilities,
            instructionPageId: values.instructionPageId ? Number(values.instructionPageId) : null,
        };
        try {
            if (pos) await api("PATCH", `/positions/${pos.id}`, { body });
            else await api("POST", "/positions", { body });
            await this.render();
        } catch (err) {
            showError(err);
        }
    },

    async deletePosition(pos) {
        if (!confirm(`Видалити посаду «${pos.title}»?`)) return;
        try {
            await api("DELETE", `/positions/${pos.id}`);
            await this.render();
        } catch (err) {
            showError(err);
        }
    },
};
