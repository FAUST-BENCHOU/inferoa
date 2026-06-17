---
name: "coding-workflow"
description: "Default Inferoa coding workflow: inspect, plan, edit, test, record evidence, and preserve context."
---

# Coding Workflow

Use repository files and docs as the source of truth. For non-trivial work:

1. Inspect the relevant files before editing.
2. Use `file_search`, `read_file`, and code-intelligence tools where supported.
3. Maintain the loop coverage inventory: mapping a repo or listing files is not `covered`; each relevant surface must be covered with evidence or explicitly rejected with rationale/residual risk.
4. Keep frontier, coverage, evidence, and residual-risk state synchronized before closing a loop task.
5. Keep a task ledger with `todo_write` and evidence with `complete_step`.
6. Prefer `apply_patch` or structured edits for source changes.
7. Run targeted validation through `run_command`.
8. Store bulky outputs as resources and read only bounded pages.
9. Continue after context compression using the summary plus recent tail.
