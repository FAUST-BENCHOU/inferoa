.PHONY: build dev-bin dev-unlink test docs-preview docs-build docs-serve

build:
	npm run build
	chmod +x dist/src/cli.js

dev-bin: build
	npm link
	@echo "inferoa is linked. Run: inferoa"

dev-unlink:
	npm unlink -g inferoa

test:
	npm test

docs-preview:
	npm run site:start

docs-build:
	npm run site:build

docs-serve:
	npm run site:serve
