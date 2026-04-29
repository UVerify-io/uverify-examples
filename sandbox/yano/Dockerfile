FROM eclipse-temurin:25-jdk-alpine AS builder

WORKDIR /build

RUN apk add --no-cache git
RUN git clone --depth 1 --branch main https://github.com/bloxbean/yano.git .
RUN ./gradlew :node-app:quarkusBuild -x test --no-daemon

FROM eclipse-temurin:25-jre-jammy AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /build/node-app/build/yano.jar yano.jar
COPY --from=builder /build/node-app/config ./config
COPY snapshots/uverify-base-state /app/snapshots/uverify-base-state
# Override maxKESEvolutions so the devnet never hits KES expiry in practice
COPY genesis/shelley-genesis.json /app/config/network/devnet/shelley-genesis.json

EXPOSE 7070 13337

VOLUME /app/chainstate
VOLUME /app/config
CMD ["java", "-Dquarkus.profile=devnet", "-Dyaci.node.tx-evaluation.enabled=true", "-Dyaci.node.block-producer.script-evaluator=scalus", "-jar", "yano.jar"]
