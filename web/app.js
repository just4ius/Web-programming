const loadBtn = document.getElementById("loadBtn");
const itemsList = document.getElementById("itemsList");
const statusMessage = document.getElementById("statusMessage");

const API_URL = "http://localhost:8080/items";

loadBtn.addEventListener("click", async () => {
    loadBtn.disabled = true;
    statusMessage.textContent = "Завантаження...";
    itemsList.innerHTML = "";

    try {
        const response = await fetch(API_URL);
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
        loadBtn.disabled = false;
    }
});