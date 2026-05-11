FROM bloxbean/yano:latest AS base

FROM eclipse-temurin:25-jre-jammy

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=base /app/yano.jar yano.jar
COPY --from=base /app/config ./config
COPY snapshots/uverify-base-state /app/snapshots/uverify-base-state
# Override shelley genesis: slotsPerKESPeriod=3000000 accounts for the 0.2s slot
# length (5 slots/s), giving ~14 months of KES validity from genesis start.
# Formula: 63 × 3000000 × 0.2s = 37800000s ≈ 437 days from 2026-04-20 → expires ~2027-06-01.
COPY genesis/shelley-genesis.json /app/config/network/devnet/shelley-genesis.json
COPY application.yml /app/config/application.yml

EXPOSE 7070 13337

VOLUME /app/chainstate

CMD ["java", "-Dquarkus.profile=devnet", "-Dyaci.node.tx-evaluation.enabled=true", "-Dyaci.node.block-producer.script-evaluator=scalus", "-jar", "yano.jar"]
