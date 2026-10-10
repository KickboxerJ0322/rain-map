FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "require(\'node:http\').get(\'http://127.0.0.1:\' + (process.env.PORT || 8080) + \'/healthz\', r => process.exit(r.statusCode === 200 ? 0 : 1)).on(\'error\', () => process.exit(1))"
CMD ["node", "server.js"]
