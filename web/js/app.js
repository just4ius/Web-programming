// Головний модуль застосунку: стан, маршрутизація (#/...) і запуск
const view = document.getElementById("view");

const App = {
    user: null,
    role: null,
    workspace: null,
    pages: [],

    can(permission) {
        return can(this.role, permission);
    },

    async reloadPages() {
        this.pages = await api("GET", "/pages");
        Tree.render();
    },
};

// Маршрути: #/ · #/page/12 · #/page/12?edit=1 · #/org · #/members · #/trash · #/search?q=...
async function route() {
    const [path, query = ""] = location.hash.replace(/^#/, "").split("?");
    const params = new URLSearchParams(query);
    const parts = path.split("/").filter(Boolean);

    document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === (parts[0] || "home")));
    document.body.classList.remove("sidebar-open");
    if (parts[0] !== "page") Tree.setActive(null);

    try {
        if (parts[0] === "page" && parts[1]) {
            Tree.setActive(Number(parts[1]));
            await Editor.open(Number(parts[1]), { edit: params.get("edit") === "1" });
        } else if (parts[0] === "org") {
            await Org.render();
        } else if (parts[0] === "members") {
            await Members.render();
        } else if (parts[0] === "trash") {
            await Views.trash();
        } else if (parts[0] === "search") {
            await Views.search(params.get("q") || "");
        } else {
            await Views.home();
        }
    } catch (err) {
        clear(view).append(el("div", { className: "empty" },
            el("h2", {}, err.status === 404 ? "Не знайдено" : "Щось пішло не так"),
            el("p", {}, err.message),
            el("a", { href: "#/", className: "btn" }, "На головну")));
    }
    view.focus();
}

// Перед переходом з незбереженими змінами — попереджаємо
let restoringHash = false;
window.addEventListener("hashchange", () => {
    if (restoringHash) {
        restoringHash = false;
        return;
    }
    if (Editor.dirty && !confirm("Є незбережені зміни. Вийти без збереження?")) {
        restoringHash = true;
        history.back();
        return;
    }
    Editor.dirty = false;
    route();
});

document.getElementById("searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("searchInput").value.trim();
    if (q.length >= 2) location.hash = "#/search?q=" + encodeURIComponent(q);
});

document.getElementById("addRootPage").addEventListener("click", () => createPageFlow(null));
document.getElementById("logoutBtn").addEventListener("click", () => {
    session.clear();
    location.href = "index.html";
});
document.getElementById("openSidebar").addEventListener("click", () => document.body.classList.add("sidebar-open"));
document.getElementById("closeSidebar").addEventListener("click", () => document.body.classList.remove("sidebar-open"));

async function boot() {
    if (!session.token) {
        location.href = "index.html";
        return;
    }
    const me = await api("GET", "/auth/me");
    App.user = me.user;
    App.role = me.role;
    App.workspace = me.workspace;

    document.title = `${me.workspace.name} — DocuFlow`;
    document.getElementById("companyName").textContent = me.workspace.name;
    document.getElementById("meName").textContent = me.user.name;
    document.getElementById("meRole").textContent = ROLE_LABELS[me.role];
    document.getElementById("addRootPage").hidden = !App.can("content:write");
    document.getElementById("trashLink").hidden = !App.can("content:write");

    await App.reloadPages();
    await route();
}

boot().catch(showError);
