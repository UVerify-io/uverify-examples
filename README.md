# UVerify Examples

Official code examples for integrating [UVerify](https://uverify.io) — on-chain certificate anchoring on Cardano.

All examples run against the **Cardano preprod testnet** out of the box. No tADA required — the UVerify faucet automatically funds your wallet on first run.

## Examples

Each language directory contains the same set of certificate templates:

| Template | Description |
|---|---|
| **Diploma** | Batch-issue academic diplomas |
| **Digital Product Passport** | EU Digital Product Passport (DPP) |
| **Laboratory Report** | GDPR-safe lab reports with measured values |
| **Pet Necklace** | Lost-pet necklace with privacy-preserving owner data |
| **Product Verification** | Product authentication certificate with QR-code URL |
| **Notary** *(TypeScript only)* | Sign and anchor arbitrary documents |

## Getting Started

Pick your language and follow the setup instructions:

- [TypeScript](typescript/) — Node.js, uses `@uverify/sdk`
- [Python](python/) — Python 3.8+, uses `uverify-sdk`
- [Java](java/) — Java 11+ / Maven, uses `io.uverify:uverify-sdk`

On first run, each example automatically:

1. Generates a wallet and saves the mnemonic to `wallet.txt`
2. Requests tADA from the UVerify faucet
3. Issues certificates to the preprod testnet
4. Prints a verification deep link to `https://app.preprod.uverify.io`

## Local Sandbox (Work in Progress)

The [sandbox/](sandbox/) directory contains a fully self-contained local development environment based on Docker and [YACI DevKit](https://github.com/bloxbean/yaci-devkit). It runs a complete UVerify stack — Cardano devnet, backend, and UI — entirely on your machine.

> **Status:** The sandbox is currently work in progress. Use preprod for all examples.

**Quick start (once stable):**

```bash
cd sandbox
cp .env.example .env
./start.sh
```

| Service | URL |
|---|---|
| UVerify UI | http://localhost:3000 |
| UVerify API | http://localhost:9090 |
| Swagger Docs | http://localhost:9090/swagger-ui |
| YACI DevKit | http://localhost:10000 |

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
