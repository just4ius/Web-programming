// Сторінка входу та реєстрації компанії
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const authError = document.getElementById("authError");

// Уже увійшли — одразу в застосунок
if (session.token) location.href = "app.html";

document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
        loginForm.hidden = tab.dataset.tab !== "login";
        registerForm.hidden = tab.dataset.tab !== "register";
        authError.textContent = "";
    });
});

async function submitAuth(form, path) {
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    authError.textContent = "";
    try {
        const body = Object.fromEntries(new FormData(form));
        // Вхід і реєстрацію не повторюємо автоматично, щоб не створити дві компанії
        const data = await api("POST", path, { body, retries: 0 });
        session.save(data);
        location.href = "app.html";
    } catch (err) {
        authError.textContent = err.message;
    } finally {
        button.disabled = false;
    }
}

loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitAuth(loginForm, "/auth/login");
});

registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    submitAuth(registerForm, "/auth/register");
});
