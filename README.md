# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

<!-- Trigger workflow -->

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## GitHub Actions Desktop Build

This repo now includes a GitHub Actions workflow at `.github/workflows/tauri-build.yml` that builds the desktop app for both macOS and Windows on every push to `main`.

- macOS output: `src-tauri/target/release/bundle/macos/`
- Windows output: `src-tauri/target/release/bundle/`

To use it:

1. Push your branch to GitHub.
2. Open the `Actions` tab in your repo.
3. Download the `macos-release` and `windows-release` artifacts from the workflow run.

You can also build locally with:

```bash
npm install
npx tauri build
```

## Desktop Updates

The desktop app is configured for signed Tauri updates through GitHub Releases. See `docs/desktop-updates.md` for the one-time GitHub secret setup and release steps.
