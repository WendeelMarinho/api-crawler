FROM mcr.microsoft.com/playwright:v1.51.0-noble

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && chmod +x scripts/*.sh

RUN mkdir -p storage logs storage/reports && \
    chown -R pwuser:pwuser /app

USER pwuser

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV CRAWL_HEADLESS=true

VOLUME ["/app/storage", "/app/logs"]

ENTRYPOINT ["node", "dist/index.js"]
CMD ["--help"]
