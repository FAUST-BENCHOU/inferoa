---
title: Slash Commands
sidebar_label: Slash commands
---

Slash commands are entered inside the Inferoa TUI. They form a small,
purpose-built command registry — they are not a mirror of legacy CLI
subcommands.

## Top-Level Commands

| Command | Purpose |
| --- | --- |
| `/setup` | Open endpoint, provider, web search, and Omni setup wizard |
| `/model` | Open model and provider selector |
| `/system` | Show model, web search, Omni, and runtime status (also `/endpoint`, `/endpoints`) |
| `/access` | Change this workspace's file and tool access |
| `/skills` | List discovered skills or manage enabled skills |
| [`/goal`](../workflows/goal-mode.md) | Start or manage goal mode |
| [`/plan`](../workflows/plan-mode.md) | Start or manage plan mode |
| [`/autoresearch`](../workflows/autoresearch-mode.md) | Start or manage autoresearch experiments |
| `/tokenmaxxing` | Show token, cache, RTK, and routing savings (also `/cache`, `/rtk`, `/activity`, `/evidence`, `/history`) |
| `/context` | Show context usage, compression state, and code intelligence |
| `/tools` | Show fixed tool schemas and renderer status |
| `/sessions` | Manage chat sessions |
| `/jobs` | Open daemon and supervisor jobs |
| `/todo` | Open the task ledger |
| `/acceptance` | Open the final acceptance workflow |
| `/help` | Show keyboard shortcuts and slash commands |
| `/clear` | Start a fresh session |
| `/resume` | Resume a previous session |
| `/exit` | Exit the TUI |

## Common Subcommands

```text
# Goal mode
/goal show                   Show active goal state
/goal set                    Set or replace the goal objective
/goal plan                   Update the goal's internal plan
/goal pause                  Pause the current goal
/goal resume                 Resume a paused goal
/goal budget                 Set or clear the goal token budget
/goal complete               Mark the goal complete
/goal drop                   Drop the current goal

# Plan mode
/plan show                   Show active plan state
/plan set                    Set or replace the plan objective
/plan pause                  Pause the current plan
/plan resume                 Resume a paused plan
/plan approve                Approve the current plan for execution
/plan drop                   Drop the current plan

# Autoresearch
/autoresearch status         Show autoresearch state
/autoresearch off            Disable autoresearch mode
/autoresearch clear          Clear autoresearch state

# Skills
/skills list                 Show discovered skills
/skills manage               Enable or disable skills

# Access
/access status               Show this workspace's access mode
/access full                 Full local file and tool access
/access auto                 Auto-approve routine tools
/access ask                  Ask before risky access
/access custom               Use custom config rules

# Context
/context                     Show context and code intelligence state
/context reindex             Rebuild the context index

# Tools
/tools                       Show fixed tool schemas
/tools expand                Expand the latest tool run
/tools compact               Fold long successful tool runs
/tools last                  Show the latest tool trace

# Sessions
/sessions all                Show active and archived sessions
/sessions resume             Attach to a previous session
/sessions new                Start a fresh session

# Jobs
/jobs status                 Show daemon and job state
/jobs queue                  Queue a supervised run
/jobs attach                 Attach to a supervised run
/jobs detach                 Detach a supervised run
/jobs cancel                 Cancel a supervised run

# Acceptance
/acceptance status           Show final acceptance readiness
/acceptance run              Run the real endpoint acceptance workflow
```

## Aliases

Several top-level commands accept friendly aliases so muscle memory from
related surfaces still resolves:

| Alias | Resolves To |
| --- | --- |
| `/endpoint`, `/endpoints` | `/system` |
| `/cache`, `/rtk`, `/activity`, `/evidence`, `/history` | `/tokenmaxxing` |
