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

# pi-subagents（researcher/delegate 等のサブエージェント移譲用）。バージョン固定で同梱する（P3-014）。
# pi は settings.json の packages（例: npm:pi-subagents）を pi 自身のモジュール解決経路で解決するため、
# グローバル node_modules に同梱すれば per-user 毎のランタイム npm インストールは発生しない（Phase 0 実機確認済み）。
RUN npm install -g pi-subagents@0.65.1

# pi-web-access（researcher 子エージェント専用の Web 検索・取得）。バージョン固定で同梱する（P3-014）。
# メインセッションには載せず、per-user settings.json の subagents.agentOverrides.researcher
# （subagentOnlyExtensions + tools）経由で researcher にのみ提供する（Phase 0 §3 の実機診断に基づく）。
RUN npm install -g pi-web-access@0.28.0

ENV GATEWAY_HOST=0.0.0.0 GATEWAY_PORT=8787
EXPOSE 8787

CMD ["node", "dist/index.js"]
