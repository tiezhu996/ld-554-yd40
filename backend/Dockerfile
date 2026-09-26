FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# sqlite3（devDependency，用于集成测试）在 musl 环境下可能需要源码编译
RUN apk add --no-cache python3 make g++
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 38504
CMD ["node", "dist/server.js"]
