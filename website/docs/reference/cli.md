---
title: CLI Reference
sidebar_label: CLI
---

## Usage

```bash
inferoa
inferoa "prompt"
inferoa setup
inferoa --print "prompt"
inferoa debug <command>
```

`inferoa` launches the TUI. A positional prompt is sent as the first user turn
of the new or resumed session. `inferoa setup` opens the TUI setup wizard.
`inferoa --print` runs a single non-interactive request.

## Options

| Option | Description |
| --- | --- |
| `--config <path>` | Load a specific config YAML file |
| `--workspace <path>` | Set the workspace root |
| `--state-dir <path>` | Set the state directory, defaulting to `~/.inferoa` |
| `--json` | Print JSON for supported debug commands |
| `--print`, `-p` | Run non-interactive print mode |
| `--no-animation` | Disable the TUI intro animation |
| `--help`, `-h` | Show help |

## Debug Commands

Debug commands exist for automation, inspection, and validation. Use the TUI
for normal work.

```bash
# Setup and state
inferoa debug init [--force]            # Write ~/.inferoa/config.yaml
inferoa debug setup                     # Probe setup, skills, and endpoint signals
inferoa debug status                    # Runtime status and sessions
inferoa debug sessions                  # List workspace sessions

# Tools and events
inferoa debug tools list                # List registered tools
inferoa debug tools call <name> [json]  # Run a single tool call
inferoa debug events <session> [limit]  # List events for a session
inferoa debug archive <session>         # Archive a session

# Daemon
inferoa debug daemon start|status|jobs|run|goal|attach|detach|cancel ...

# Acceptance
inferoa debug acceptance [--daemon]
```

`inferoa debug tools call` is a thin shim around the runtime `ToolRegistry`; it
creates a session, runs the named tool, and prints the result. Use it to verify
tool wiring before involving the model.

Pass `--json` to any debug command to emit machine-readable JSON instead of
YAML.
