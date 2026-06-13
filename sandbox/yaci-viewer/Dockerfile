FROM node:20-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
RUN git clone --branch v0.10.6 --depth 1 https://github.com/bloxbean/yaci-devkit.git . && \
    cd applications/viewer && \
    npm ci && \
    npm run build

# ─── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache nginx supervisor

WORKDIR /app
COPY --from=build /app/applications/viewer/build ./build
COPY --from=build /app/applications/viewer/cli.js ./cli.js
COPY --from=build /app/applications/viewer/node_modules ./node_modules

COPY nginx.conf /etc/nginx/http.d/default.conf
COPY supervisord.conf /etc/supervisord.conf

EXPOSE 3001
CMD ["supervisord", "-c", "/etc/supervisord.conf"]
