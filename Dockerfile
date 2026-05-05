# Сборка образа API + статика для Cloud Run / VPS.
# Сайт (HTML), админка и CRM — те же файлы из репозитория; правки без смены Docker-слоя зависят от того, что вы копируете в образ или монтируете.

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
