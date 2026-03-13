# ── Stage 1: Build ─────────────────────────────────────────────────────────────
# Clones the bloxbean/yaci repo (next branch) and builds the node-app uber-jar.
FROM eclipse-temurin:21-jdk-alpine AS builder

WORKDIR /build

RUN apk add --no-cache git

RUN git clone --depth 1 --branch next https://github.com/bloxbean/yaci.git .

# Build only the node-app module — produces build/yaci-node.jar (uber-jar)
RUN ./gradlew :node-app:quarkusBuild -x test --no-daemon

# ── Stage 2: Runtime ───────────────────────────────────────────────────────────
# Must use a glibc-based image — RocksDB JNI requires libstdc++.so.6 which is
# absent on Alpine (musl libc).
FROM eclipse-temurin:21-jre-jammy AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Uber-jar (self-contained, no classpath needed)
COPY --from=builder /build/node-app/build/yaci-node.jar yaci-node.jar

# Genesis files and network configs (devnet profile reads these from ./config/)
COPY --from=builder /build/node-app/config ./config

# 8080  — Blockfrost-compatible REST API + Swagger UI
# 13337 — Cardano N2N server (for yaci-store / YACI Store embedded in uverify-backend)
EXPOSE 8080 13337

# Chain state is persisted here; mount a named volume to survive restarts
VOLUME /app/chainstate

CMD ["java", "-Dquarkus.profile=devnet", "-Dyaci.node.tx-evaluation.enabled=true", "-jar", "yaci-node.jar"]
