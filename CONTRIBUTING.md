# Contributing

Thanks for improving Inferoa. This project is a TypeScript/Node CLI and targets
Node.js 24 or newer.

## Source Setup

```bash
npm install
npm run build
make dev-bin
inferoa setup
inferoa
```

`make dev-bin` builds the project and links the local `inferoa` binary for
interactive development.

## Development Commands

```bash
npm test
make dev-bin
make docs-preview
make docs-build
```

Use `npm test` before sending changes. It runs the TypeScript build and the
Node test suite.

## Documentation Site

The website lives under `website/`.

```bash
make docs-preview
make docs-build
```

`make docs-preview` starts the local docs server. `make docs-build` validates
the production build.

## Publishing

Publishing is automated from `main`. After `package.json` is bumped, the GitHub
workflow builds, tests, packs, and publishes `inferoa@latest` to npm.

For npm publishing, configure one of:

- `NPM_TOKEN` repository secret using an npm automation token.
- npm Trusted Publishing for package `inferoa`, owner `agentic-in`, repository
  `inferoa`, workflow filename `npm-publish.yml`.

If the npm account has two-factor authentication enabled, the token must be an
automation token or a granular token with publish permission and 2FA bypass.

## License

By contributing, you agree that your contributions are licensed under the
Apache License, Version 2.0.
