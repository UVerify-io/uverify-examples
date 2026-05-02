# UVerify Examples

Official code examples for integrating [UVerify](https://uverify.io) — on-chain certificate anchoring on Cardano.

Examples run against the **Cardano preprod testnet** by default. No tADA required — the UVerify faucet funds your wallet on first run. For fully local development, start the sandbox below.

## Sandbox (local devnet)

The sandbox runs a complete UVerify stack on your machine using Docker — Cardano devnet, backend, and UI — with contracts already deployed and funded.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) 24+

```bash
./sandbox.sh start
```

```
  Service                     URL
  ─────────────────────────   ──────────────────────────────────────────
  UVerify UI                  http://localhost:3000
  UVerify Backend             http://localhost:9090
  API docs (Swagger)          http://localhost:9090/swagger-ui
  Chain viewer                http://localhost:3001
  Yaci Store API              http://localhost:8080
  Yano devnet API             http://localhost:7070/q/swagger-ui
```

```bash
./sandbox.sh info      # show service status and URLs
./sandbox.sh stop      # stop all services
./sandbox.sh restart   # stop then start
```

To reset all persisted chain data and start fresh from the snapshot:

```bash
(cd sandbox && docker compose down -v)
./sandbox.sh start
```

## Examples

Each language directory contains the same set of certificate templates. Pick your language and run an example:

### TypeScript (Deno)

```bash
cd typescript/notary
deno run -A index.ts
```

| Example | Description |
|---|---|
| [`notary/`](typescript/notary/) | Proof of existence for files, contracts, and creative works |
| [`diploma/`](typescript/diploma/) | Batch-issue academic degree certificates |
| [`laboratory_report/`](typescript/laboratory_report/) | Privacy-preserving lab report certification |
| [`certificate_of_insurance/`](typescript/certificate_of_insurance/) | Insurance certificate issuance |
| [`digital_product_passport/`](typescript/digital_product_passport/) | EU Digital Product Passport |
| [`pet_necklace/`](typescript/pet_necklace/) | QR-code pet ID necklace tags |
| [`product_verification/`](typescript/product_verification/) | Anti-counterfeiting product authentication |
| [`document_integrity/`](typescript/document_integrity/) | File integrity verification with drag-and-drop |
| [`tokenizable_certificate/`](typescript/tokenizable_certificate/) | Issue and redeem CIP-68 NFT certificates |

### Python

```bash
cd python/<example>
pip install -r requirements.txt
python main.py
```

See [`python/`](python/) for available examples.

### Java

```bash
cd java/<example>
mvn compile exec:java
```

See [`java/`](java/) for available examples.

On first run each example generates a wallet, requests tADA from the UVerify faucet, issues certificates, and prints a verification link to `https://app.preprod.uverify.io`.

## Links

- [UVerify App (preprod)](https://app.preprod.uverify.io)
- [Documentation](https://docs.uverify.io)
- [API Reference](https://api.uverify.io/v1/api-docs)
- [Discord](https://discord.gg/Dvqkynn6xc)
- [GitHub](https://github.com/UVerify-io)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. For security issues, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
