# 🤝 Contributing to UVerify Examples

Thank you for your interest in contributing to UVerify Examples! We welcome new examples, bug fixes, and improvements. Please follow these guidelines to ensure a smooth contribution process.

## 📝 Guidelines

1. **Open an Issue First**
   Before starting work on a new example or significant change, please open an issue to align with the project goals. This helps avoid duplicate efforts and ensures your contribution fits the repository's scope.

2. **Semantic Commits**
   Use [semantic commit messages](https://www.conventionalcommits.org/) to maintain a clean and meaningful commit history. Examples:

   - `feat: add Python example for certificate verification`
   - `fix: correct wallet path handling in notary example`
   - `docs: update README with prerequisites section`
   - `chore: update dependencies to latest versions`

3. **Sign the CLA**
   All contributors must sign the **Contributor License Agreement (CLA)** before their contributions can be merged. This ensures that the project remains open and accessible to everyone.

   - The bot will guide you through the signing process when you open a pull request.

4. **Pull Requests**

   - Fork the repository and create a new branch for your changes.
   - Ensure your example is self-contained and well-documented with inline comments.
   - Submit a pull request with a clear description of what the example demonstrates.

5. **Example Requirements**
   When contributing a new example, please ensure:

   - It lives in a dedicated subdirectory named after the language or framework (e.g., `typescript/`, `python/`).
   - It includes a `README.md` explaining prerequisites, setup steps, and what the example does.
   - Secrets (private keys, wallet mnemonics) are never committed — use environment variables or a `.env` file that is excluded via `.gitignore`.
   - Dependencies are declared in the appropriate manifest (e.g., `package.json`, `requirements.txt`).
   - The example follows the patterns established by existing examples in the repository.

6. **Testing**
   Please verify that your example runs end-to-end against the UVerify testnet before submitting a pull request. Refer to the [UVerify documentation](https://docs.uverify.io) for API and SDK details.

## 💡 Feature Requests

If you have an idea for a new example or a new language/framework integration, please open an issue and describe your proposal in detail. We encourage collaboration and will work with you to refine your idea.

## 📧 Need Help?

If you have any questions or need assistance, feel free to reach out to us at **[hello@uverify.io](mailto:hello@uverify.io)** or join our [Discord community](https://discord.gg/Dvqkynn6xc).

Thank you for contributing to UVerify! 💙
