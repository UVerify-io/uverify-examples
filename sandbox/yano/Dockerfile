FROM bloxbean/yano:latest AS base

FROM eclipse-temurin:25-jre-jammy

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=base /app/yano.jar yano.jar
COPY --from=base /app/config ./config
COPY snapshots/uverify-base-state /app/snapshots/uverify-base-state
# Override maxKESEvolutions so the devnet never hits KES expiry in practice
COPY genesis/shelley-genesis.json /app/config/network/devnet/shelley-genesis.json
COPY application.yml /app/config/application.yml

EXPOSE 7070 13337

VOLUME /app/chainstate

CMD ["java", "-Dquarkus.profile=devnet", "-Dyaci.node.tx-evaluation.enabled=true", "-Dyaci.node.block-producer.script-evaluator=scalus", "-jar", "yano.jar"]
