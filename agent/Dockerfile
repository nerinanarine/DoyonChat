FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

# 実 pi 駆動用（非LLMコマンドの疎通・将来の本番形）。バージョン固定で再現性を担保する。
RUN npm install -g @earendil-works/pi-coding-agent@0.85.0

ENV GATEWAY_HOST=0.0.0.0 GATEWAY_PORT=8787
EXPOSE 8787

CMD ["node", "dist/index.js"]
