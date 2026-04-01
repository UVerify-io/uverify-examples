FROM eclipse-temurin:21-jre-jammy

RUN apt-get update && apt-get install -y --no-install-recommends curl unzip && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN curl -fsSL https://github.com/bloxbean/yaci/releases/download/v0.5.0-pre4/yaci-node-0.5.0-pre4.zip \
        -o yaci-node.zip \
    && unzip yaci-node.zip \
    && rm yaci-node.zip \
    && chmod +x yaci-node-0.5.0-pre4/yaci-node.sh

WORKDIR /app/yaci-node-0.5.0-pre4

# 8080  — Blockfrost-compatible REST API + Swagger UI
# 13337 — Cardano N2N server (for yaci-store / YACI Store embedded in uverify-backend)
EXPOSE 8080 13337

# Chain state is persisted here; mount a named volume to survive restarts
VOLUME /app/chainstate

CMD ["./yaci-node.sh", "--devnet"]
