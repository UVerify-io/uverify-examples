# 🔒 Security Policy

## Supported Versions

We actively support the following versions of UVerify with security updates:

| Version | Supported              |
| ------- | ---------------------- |
| 1.x     | ✅ Fully supported     |
| < 1.x   | ❌ No longer supported |

Please ensure you are using the latest version to benefit from the latest security patches and updates.

## 📢 Reporting a Vulnerability

If you discover a security vulnerability in UVerify, we encourage you to report it responsibly. Please follow these steps:

1. **Contact Us**
   Send an email to **[security@uverify.io](mailto:security@uverify.io)** with the details of the vulnerability. Include:

   - A clear description of the issue.
   - Steps to reproduce the vulnerability.
   - Any potential impact or risk.

2. **Do Not Disclose Publicly**
   Please do not publicly disclose the vulnerability until we have had a chance to investigate and address it.

3. **Response Time**
   We aim to respond to all security reports within **48 hours** and will work with you to resolve the issue promptly.

## ⚠️ Private Key & Wallet Safety

The examples in this repository use wallet private keys and mnemonics for demonstration purposes. **Never commit real private keys or seed phrases** to this repository or any public repository. Always use:

- Environment variables loaded at runtime.
- A `.env` file that is listed in `.gitignore`.
- Dedicated testnet wallets with no real funds for running examples.

## 🔐 Security Best Practices

To ensure the security of your UVerify integration, we recommend the following:

- Always use the latest version of the UVerify SDK and API client.
- Regularly review and update dependencies.
- Follow best practices for securing your environment (e.g., using HTTPS, securing API keys, protecting wallet credentials).

Thank you for helping us keep UVerify secure! 💙
