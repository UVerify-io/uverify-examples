# UVerify Examples

Official code examples for integrating [UVerify](https://uverify.io) — on-chain certificate anchoring on Cardano.

Examples run against the **Cardano preprod testnet** by default. No tADA required — the UVerify faucet funds your wallet on first run. For fully local development, start the sandbox below.

## Sandbox (local devnet)

The sandbox runs a complete UVerify stack on your machine using Docker — Cardano devnet, backend, and UI — with contracts already deployed and funded.

**Prerequisites:**

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 24+
- [uv](https://docs.astral.sh/uv/) — Python package manager

Install uv on macOS:

```bash
# Homebrew
brew install uv

# or the official installer
curl -LsSf https://astral.sh/uv/install.sh | sh
```

On Windows, use the PowerShell installer:

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Start the sandbox (uv installs Python dependencies automatically on first run):

```bash
uv run sandbox.py start
```

```
  Service                     URL
  ─────────────────────────   ──────────────────────────────────────────
  UVerify UI                  http://localhost:3000
  UVerify Backend             http://localhost:9090
  API docs (Swagger)          http://localhost:9090/swagger-ui/index.html
  Chain viewer                http://localhost:3001
  Yaci Store API              http://localhost:8080
  Yaci Store (Swagger)        http://localhost:8080/swagger-ui/index.html
  Yano devnet API             http://localhost:7070/q/swagger-ui
```

> **Note:** The UI compiles on first startup (usually 1–2 minutes). The other services are available immediately. Run `uv run sandbox.py info` to check when the UI is ready.

```bash
uv run sandbox.py info      # show service status and URLs
uv run sandbox.py stop      # stop all services
uv run sandbox.py restart   # stop then start
```

To reset all persisted chain data and start fresh from the snapshot:

```bash
uv run sandbox.py start --clean
```

### Custom UI templates

The sandbox UI is served by `uverify/uverify-ui:builder`, a Docker image that compiles the React app at container startup. This means you can add custom certificate templates by dropping files into `sandbox/custom-ui-templates/` — no access to the `uverify-ui` source code required.

#### Scaffold a new template

Node.js is required to scaffold templates (the UVerify CLI runs via `npx`):

```bash
uv run sandbox.py template add my-template
```

This creates `sandbox/custom-ui-templates/my-template/` with a working template project and registers it in `sandbox/custom-ui-templates/additional-templates.json`.

Edit your template:

```bash
# open the generated certificate component
open sandbox/custom-ui-templates/my-template/src/Certificate.tsx
```

Then restart the sandbox to compile it in:

```bash
uv run sandbox.py restart
```

The template appears in the template selector at `http://localhost:3000`.

#### Manage templates

```bash
uv run sandbox.py templates              # list registered templates
uv run sandbox.py template add <name>   # scaffold + register a new template
uv run sandbox.py template rm  <name>   # remove a template (asks for confirmation)
```

#### How it works

- `sandbox/custom-ui-templates/` is mounted into the builder container at `/app/custom-templates/`.
- `sandbox/custom-ui-templates/additional-templates.json` declares which templates to include and where their entry files are.
- At startup, `config.js` reads that file and generates the import wiring before Vite builds the app.
- Both the template folder and `additional-templates.json` are excluded from git, so your local templates stay local.

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
uv run main.py
```

See [`python/`](python/) for available examples. No virtualenv or `pip install` needed — uv reads the inline dependency block at the top of each script.

### Java

```bash
cd java/<example>
jbang ClassName.java
```

See [`java/`](java/) for available examples. Install [jbang](https://www.jbang.dev/download/) if you don't have it.

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
