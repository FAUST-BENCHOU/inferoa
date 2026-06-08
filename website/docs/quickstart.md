---
id: quickstart
title: Quickstart
---

```bash
npm install
npm run build
npm link
inferoa setup
inferoa
```

Run a one-shot prompt:

```bash
inferoa --print "Inspect this repository and summarize the test entrypoints."
```

Useful development commands:

```bash
npm test
make docs-preview
make docs-build
```

Configuration is stored under `~/.inferoa/`. Endpoint keys are stored in the
local vault; config files store key references.
