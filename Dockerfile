# Backend (Express + Mongoose)
FROM node:24-alpine

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source and shared modules
COPY server ./server
COPY shared ./shared

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node", "server/index.js"]
