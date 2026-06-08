---
name: "coding-workflow"
description: "Default Inferoa coding workflow: inspect, plan, edit, test, record evidence, and preserve context."
---

# Coding Workflow

Use repository files and docs as the source of truth. For non-trivial work:

1. Inspect the relevant files before editing.
2. Use `file_search`, `read_file`, and code-intelligence tools where supported.
3. Keep a task ledger with `todo_write` and evidence with `complete_step`.
4. Prefer `apply_patch` or structured edits for source changes.
5. Run targeted validation through `run_command`.
6. Store bulky outputs as resources and read only bounded pages.
7. Continue after context compression using the summary plus recent tail.
