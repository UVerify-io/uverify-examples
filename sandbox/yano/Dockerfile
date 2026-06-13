FROM bloxbean/yano:0.1.0-pre6-jvm

COPY snapshots/uverify-base-state /app/snapshots/uverify-base-state
COPY genesis/shelley-genesis.json /app/config/network/devnet/shelley-genesis.json
COPY application.yml /app/config/application.yml

EXPOSE 7070 13337

# Clear the upstream entrypoint so `docker run ... sh -c "..."` works for seeding.
ENTRYPOINT []
CMD ["java", "-Dquarkus.profile=devnet", \
     "-Dyano.block-producer.tx-evaluation=true", \
     "-Dyano.block-producer.script-evaluator=scalus", \
     "-jar", "yano.jar"]
