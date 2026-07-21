# Contributing to Salotto 🛋️

Thank you for your interest in contributing to **Salotto**! We welcome contributions from everyone. Whether you are reporting a bug, proposing a new feature, writing documentation, or fixing code, your help makes Salotto better.

---

## 🧭 How Can I Contribute?

### 1. Reporting Bugs 🐛
If you find a bug in the application:
- Search the [Issues](https://github.com/salvatorecorvaglia/salotto/issues) tab to see if it has already been reported.
- If it hasn't, open a new issue. Include a clear, descriptive title, steps to reproduce, what you expected to happen, what actually happened, and relevant screenshots or logs.

### 2. Suggesting Enhancements 💡
To suggest a new feature or improvement:
- Open a new issue in the repository.
- Describe the feature you would like to see, why it is useful, and how it might be implemented.

### 3. Submitting Pull Requests 🚀
If you're ready to submit code changes:
1. **Fork** the repository and clone it locally.
2. Create a new branch from `main`. Use a descriptive prefix:
   - `feat/feature-name` for new features
   - `fix/bug-name` for bug fixes
   - `docs/doc-name` for documentation updates
   - `refactor/refactor-name` for code cleanup
3. Make your changes locally and ensure everything runs correctly.
4. Verify code formatting and linting (see [Development Standards](#development-standards) below).
5. Commit your changes with clear, concise messages.
6. Push your branch to your fork and open a **Pull Request (PR)** against our `main` branch.

---

## 🛠️ Development Standards

To maintain code quality across the codebase, please run the following verification steps before submitting your PR.

### 🦀 Rust Backend Guidelines
Make sure your Rust code is clean, formatted, and free of compiler warnings:
- **Format check**: Run `cargo fmt --all -- --check` to ensure style consistency. Run `cargo fmt` to automatically format your code.
- **Linter check**: Run `cargo clippy --all-targets -- -D warnings` to verify code quality. We enforce zero clippy warnings.
- **Tests**: Run `cargo test` to execute any backend unit and integration tests.

### ⚛️ Frontend React & TS Guidelines
Make sure TypeScript and React components compile cleanly:
- **Linter check**: Run `npm run lint` from the `frontend` directory. We use [oxlint](https://oxc.rs/docs/guide/usage/linter/introduction.html) for fast static analysis.
- **TypeScript compile check**: Run `npm run build` to verify there are no type errors or bundling errors during compilation.

---

## 📝 Commit Guidelines

We recommend writing clean and descriptive commit messages. Following the **Conventional Commits** format is highly appreciated:
- `feat: add LiveKit screen sharing support`
- `fix: resolve WebSocket disconnection memory leak`
- `docs: update setup steps in README`
- `refactor: clean up user authentication handlers`

---

## 🔒 Security
If you discover a security vulnerability, please do **not** open a public issue. Follow the instructions in our [SECURITY.md](./SECURITY.md) to report it privately.

## ⚖️ License & Contributions
By contributing to Salotto, you agree that your contributions will be licensed under the project's [MIT License](./LICENSE).
