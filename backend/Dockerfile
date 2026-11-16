FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Кешуємо встановлення залежностей
COPY package*.json ./
RUN npm ci --omit=dev

# Копіюємо код застосунку в образ
COPY . .

# Не запускаємо застосунок від root
USER node

# Порт сервера
EXPOSE 8080

# Перевірка стану контейнера (той самий /health, що й у Kubernetes)
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

# Спершу міграції БД (+ демо-дані), потім сервер.
# У Kubernetes міграції виконує initContainer, а тут — одна команда для docker compose.
CMD ["sh", "-c", "node migrate.js --seed && node index.js"]
