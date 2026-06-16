import type { JsonObject, ToolDefinition, VllmAgentConfig } from "../types.js";

function objectSchema(properties: Record<string, JsonObject>, required: string[] = []): JsonObject {
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required,
  };
}

const string = (description: string): JsonObject => ({ type: "string", description });
const stringEnum = (description: string, values: string[]): JsonObject => ({ type: "string", description, enum: values });
const number = (description: string): JsonObject => ({ type: "number", description });
const boolean = (description: string): JsonObject => ({ type: "boolean", description });
const jsonObject = (description: string): JsonObject => ({ type: "object", description, additionalProperties: true });

const goalStep = objectSchema(
  {
    id: string("Optional stable step id. If omitted, one is derived from the title."),
    title: string("Concrete goal step title."),
    status: stringEnum("Optional step status.", ["pending", "in_progress", "completed", "blocked", "skipped"]),
    notes: string("Optional short notes for the step."),
    evidence: jsonObject("Optional structured evidence for this step."),
  },
  ["title"],
);

const goalCandidate = objectSchema(
  {
    id: string("Optional stable candidate id. If omitted, one is derived from the title."),
    title: string("Concrete candidate title."),
    source: string("Optional source, subsystem, file, or rationale origin."),
    value: stringEnum("Expected value if pursued.", ["high", "medium", "low"]),
    reason: string("Optional reason for keeping, completing, or rejecting this candidate."),
    evidence: jsonObject("Optional structured candidate evidence."),
  },
  ["title"],
);

const goalFrontierItem = objectSchema(
  {
    id: string("Optional stable frontier id. If omitted, one is derived from the title."),
    title: string("Concrete frontier item, risk, hypothesis, surface, or follow-up."),
    source: string("Optional source, subsystem, file, experiment, or rationale origin."),
    value: stringEnum("Expected value if pursued.", ["high", "medium", "low"]),
    status: stringEnum("Frontier status.", ["open", "done", "rejected"]),
    reason: string("Reason for opening, completing, or rejecting this frontier item."),
    evidence: jsonObject("Optional structured evidence."),
    evidence_ids: { type: "array", items: string("Evidence record id.") },
    residual_risk_id: string("Optional accepted residual risk id when rejecting or closing without direct evidence."),
  },
  ["title"],
);

const goalCoverageSurface = objectSchema(
  {
    id: string("Optional stable surface id. If omitted, one is derived from the title."),
    title: string("Coverage surface title."),
    status: stringEnum("Coverage status.", ["pending", "in_progress", "covered", "rejected"]),
    notes: string("Optional short notes for this surface."),
    evidence: jsonObject("Optional structured coverage evidence."),
    evidence_ids: { type: "array", items: string("Evidence record id.") },
    confidence: stringEnum("Evidence confidence for this coverage claim.", ["hard", "soft", "weak"]),
    residual_risk_id: string("Optional accepted residual risk id for rejected or partially covered surfaces."),
  },
  ["title"],
);

const goalEvidenceRecord = objectSchema(
  {
    id: string("Optional stable evidence id. If omitted, one is derived from the title, summary, command, path, or uri."),
    kind: stringEnum("Evidence kind.", ["command", "test", "file", "resource", "metric", "review", "manual", "other"]),
    title: string("Optional short evidence title."),
    summary: string("Evidence summary."),
    command: string("Exact command used as evidence."),
    path: string("Workspace path inspected or modified."),
    uri: string("Evidence resource URI or external URI."),
    metrics: jsonObject("Optional structured metrics."),
    evidence: jsonObject("Optional raw structured evidence."),
    confidence: stringEnum("Evidence confidence.", ["hard", "soft", "weak"]),
  },
);

const goalResidualRisk = objectSchema(
  {
    id: string("Optional stable residual risk id."),
    title: string("Residual risk title."),
    severity: stringEnum("Residual risk severity.", ["high", "medium", "low"]),
    accepted: boolean("Whether this residual risk is explicitly accepted."),
    reason: string("Reason for accepting or keeping this residual risk open."),
    evidence_ids: { type: "array", items: string("Evidence record id.") },
  },
  ["title"],
);

const goalCommandVerifier = objectSchema(
  {
    id: string("Optional stable verifier id. If omitted, one is derived from the command."),
    command: string("Exact shell command that should be treated as a command verifier when run with run_command."),
    cwd: string("Optional workspace-relative cwd. If omitted, the command matches from any workspace cwd."),
    required: boolean("Whether this command verifier must pass before goal completion. Defaults to true."),
  },
  ["command"],
);

const clarifyChoice = objectSchema(
  {
    id: string("Optional stable choice id."),
    label: string("User-facing choice label."),
    description: string("Optional short explanation of this choice."),
  },
  ["label"],
);

const DEFINITIONS = [
  {
    name: "apply_patch",
    description: "Apply a workspace patch. Accepts complete unified diff patches or the *** Begin Patch wrapper format. Prefer this for multi-line code edits; read the target file first when uncertain.",
    permission: "write",
    parameters: objectSchema({ patch: string("Complete unified diff patch with file headers and valid hunks, or a *** Begin Patch wrapper.") }, ["patch"]),
  },
  {
    name: "ast_edit",
    description: "Apply a structured AST edit for TypeScript/JavaScript or Python selectors. Escaped newlines in content are normalized, and successful edits return a diff.",
    permission: "write",
    parameters: objectSchema(
      {
        language: stringEnum("Language id.", ["typescript", "javascript", "tsx", "jsx", "python"]),
        path: string("Workspace-relative file path."),
        operation: stringEnum("AST edit operation.", ["replace_node", "insert_before", "insert_after", "delete_node"]),
        selector: string("Selector such as function:name, class:name, import, or text:literal."),
        content: string("Replacement or inserted content. JSON escaped newlines such as \\n are accepted."),
        position: string("Optional language-specific position hint."),
      },
      ["language", "path", "operation", "selector"],
    ),
  },
  {
    name: "ast_grep",
    description: "Search TypeScript/JavaScript or Python structure with a compact selector.",
    permission: "read",
    parameters: objectSchema(
      {
        language: stringEnum("Language id.", ["typescript", "javascript", "tsx", "jsx", "python"]),
        path: string("Workspace-relative file path."),
        selector: string("Selector such as function:name, class:name, import, or text:literal."),
        limit: number("Maximum matches."),
        page: string("Opaque page token."),
      },
      ["language", "path", "selector"],
    ),
  },
  {
    name: "audio_generation",
    description: "Generate audio through a configured endpoint-backed Omni tool.",
    permission: "network",
    parameters: objectSchema(
      {
        input: string("Text prompt describing the audio to generate, or a text resource:// URI."),
        response_format: stringEnum("Optional response format.", ["wav", "pcm", "flac", "mp3", "aac", "opus"]),
        speed: number("Optional speed multiplier."),
        audio_length: number("Optional audio length in seconds."),
        audio_start: number("Optional audio start time in seconds."),
        negative_prompt: string("Optional negative prompt."),
        guidance_scale: number("Optional diffusion guidance scale."),
        num_inference_steps: number("Optional diffusion step count."),
        seed: number("Optional seed."),
      },
      ["input"],
    ),
  },
  {
    name: "audio_understanding",
    description: "Analyze audio inputs through a configured endpoint-backed Omni tool.",
    permission: "network",
    parameters: objectSchema(
      {
        inputs: { type: "array", items: string("Audio URL, file path, data URI, or resource:// URI.") },
        prompt: string("Question or instruction."),
      },
      ["inputs", "prompt"],
    ),
  },
  {
    name: "clarify",
    description: "Ask the user for a missing decision before taking an action that would otherwise rely on a risky assumption. Provide concise choices when possible, allow free-form input when the user may need to explain constraints, and use the returned answer as tool evidence.",
    permission: "read",
    parameters: objectSchema(
      {
        question: string("The specific question to ask the user."),
        details: string("Optional short context explaining why the answer is needed."),
        choices: { type: "array", description: "Optional mutually exclusive choices for the user.", items: clarifyChoice },
        allow_freeform: boolean("Allow the user to type a custom answer. Defaults to true."),
        placeholder: string("Optional placeholder for free-form input."),
      },
      ["question"],
    ),
  },
  {
    name: "edit_file",
    description: "Replace exact text in a workspace file, or in an absolute local file when workspace access is full. If no exact match is found, the result includes nearby similar lines; escaped multiline text is accepted as a fallback.",
    permission: "write",
    parameters: objectSchema(
      {
        path: string("Workspace-relative path, or absolute local path when access is full."),
        old_text: string("Exact text to replace. Escaped multiline text such as \\n is accepted as a fallback."),
        new_text: string("Replacement text."),
        occurrence: number("1-based occurrence to replace. Defaults to 1."),
      },
      ["path", "old_text", "new_text"],
    ),
  },
  {
    name: "file_search",
    description: "Search workspace text using rg when available, then grep or a bounded built-in fallback.",
    permission: "read",
    parameters: objectSchema(
      {
        query: string("Search query or regex."),
        path: string("Optional workspace-relative path."),
        glob: string("Optional glob filter."),
        regex: boolean("Treat query as regex."),
        case_sensitive: boolean("Case-sensitive search."),
        limit: number("Maximum results."),
        page: string("Opaque page token."),
      },
      ["query"],
    ),
  },
  {
    name: "git",
    description: "Read bounded git state. Use op=status, op=diff, or op=show. op=show without path shows a commit/object; op=show with path reads that file at rev. Use run_command for unusual git commands.",
    permission: "read",
    parameters: objectSchema(
      {
        op: stringEnum("Git operation: status reads `git status --short --branch`; diff reads workspace or staged diff; show reads one revision and requires rev.", ["status", "diff", "show"]),
        cwd: string("Optional workspace-relative cwd."),
        staged: boolean("For op=diff, show staged diff instead of unstaged diff."),
        path: string("For op=diff, optional path filter. For op=show, optional file path to read at rev, equivalent to git show <rev>:<path>."),
        rev: string("Required for op=show. Revision, commit, tag, object, or rev:path spec, for example HEAD, HEAD~1, or HEAD:package.json."),
      },
      ["op"],
    ),
  },
  {
    name: "glob",
    description: "Find workspace paths using a simple glob pattern.",
    permission: "read",
    parameters: objectSchema(
      {
        pattern: string("Glob pattern."),
        cwd: string("Optional workspace-relative cwd."),
        limit: number("Maximum paths."),
        page: string("Opaque page token."),
      },
      ["pattern"],
    ),
  },
  {
    name: "goal",
    description: "Inspect or update active loop work, record internal reflection, or record verification. Use update for steps, coverage, frontier, evidence, risks, contract, and verifier policy. Lifecycle actions stay in /loop.",
    permission: "read",
    parameters: objectSchema(
      {
        op: stringEnum("Goal operation.", ["get", "update", "reflect", "verify"]),
        action: stringEnum("Update action for op=update.", ["plan", "step", "frontier", "coverage", "evidence", "residual_risk", "contract", "verifier_policy", "owner", "review_owner"]),
        owner: string("Explicit goal owner for op=update action=owner. Empty clears owner; do not infer owner from objective text."),
        review_owner: string("Explicit human review owner for op=update action=review_owner. Empty clears review owner; do not infer owner from objective or review text."),
        command_verifiers: { type: "array", description: "Command verifier policy for op=update action=verifier_policy. Only exact matching run_command calls become command verification records.", items: goalCommandVerifier },
        frontier: { type: "array", description: "Frontier items for op=update action=frontier.", items: goalFrontierItem },
        frontier_id: string("Frontier id for op=update action=frontier."),
        frontier_status: stringEnum("Frontier status for op=update action=frontier.", ["open", "done", "rejected"]),
        value: stringEnum("Value/severity for frontier or residual risk updates.", ["high", "medium", "low"]),
        source: string("Source, subsystem, file, experiment, or rationale origin for frontier updates."),
        reason: string("Reason for opening, closing, rejecting, or accepting a frontier/risk item."),
        success_criteria: { type: "array", description: "Delivery/research contract success criteria for op=update action=contract.", items: string("Success criterion.") },
        constraints: { type: "array", description: "Delivery/research contract constraints for op=update action=contract.", items: string("Constraint.") },
        assumptions: { type: "array", description: "Delivery/research contract assumptions for op=update action=contract.", items: string("Assumption.") },
        non_goals: { type: "array", description: "Delivery/research contract non-goals for op=update action=contract.", items: string("Non-goal.") },
        required_evidence: { type: "array", description: "Evidence requirements for op=update action=contract.", items: string("Required evidence.") },
        risk_surfaces: { type: "array", description: "Risk or research surfaces for op=update action=contract.", items: string("Risk surface.") },
        coverage: { type: "array", description: "Coverage surface records for op=update action=coverage.", items: goalCoverageSurface },
        surface_id: string("Coverage surface id for op=update action=coverage."),
        coverage_status: stringEnum("Coverage status for op=update action=coverage.", ["pending", "in_progress", "covered", "rejected"]),
        evidence_record: jsonObject("Evidence record object for op=update action=evidence. May include kind, title, summary, command, path, uri, metrics, evidence, confidence."),
        evidence_ids: { type: "array", description: "Evidence record ids linked to coverage/frontier/risk updates.", items: string("Evidence record id.") },
        residual_risk: jsonObject("Residual risk object for op=update action=residual_risk. May include id, title, severity, accepted, reason, evidence_ids."),
        residual_risk_id: string("Residual risk id linked to coverage/frontier updates."),
        risk_id: string("Residual risk id for op=update action=residual_risk."),
        severity: stringEnum("Residual risk severity.", ["high", "medium", "low"]),
        accepted: boolean("Whether a residual risk is accepted."),
        kind: stringEnum("Evidence kind for op=update action=evidence.", ["command", "test", "file", "resource", "metric", "review", "manual", "other"]),
        command: string("Evidence command for op=update action=evidence."),
        path: string("Evidence path for op=update action=evidence."),
        uri: string("Evidence URI for op=update action=evidence."),
        steps: { type: "array", description: "Concrete internal loop task steps for op=update action=plan or op=reflect decision=expand. Required when decision=expand.", items: goalStep },
        active_step_id: string("Optional active step id for op=update action=plan/step or op=reflect decision=expand."),
        step_id: string("Step id for op=update action=step. If omitted, the active step is used when available."),
        title: string("Title for step, frontier, coverage, evidence, or residual risk updates."),
        status: stringEnum("Step status for op=update action=step, or alias status for coverage/frontier when action selects those.", ["pending", "in_progress", "completed", "blocked", "skipped", "covered", "rejected", "open", "done"]),
        notes: string("Optional notes for step or coverage updates. Empty string clears notes for step updates."),
        evidence: jsonObject("Optional structured evidence for step, frontier, coverage, verification, or evidence record updates."),
        decision: stringEnum("Reflection decision for op=reflect in an internal reflection run only. decision=expand requires concrete steps.", ["expand", "done", "blocked"]),
        provider: stringEnum("Verification provider for op=verify. checker requires a verification run.", ["checker", "human", "command"]),
        verdict: stringEnum("Verification verdict for op=verify.", ["pass", "fail", "partial", "blocked", "unknown"]),
        confidence: stringEnum("Verification or structural evidence confidence.", ["hard", "soft", "mixed", "weak"]),
        verification_evidence: jsonObject(
          "Required top-level structured verification evidence for op=reflect with decision=done. This does not replace reflection_packet.",
        ),
        reflection_packet: jsonObject(
          "Explicit recursive reflection packet for op=reflect. For decision=done include objective_decomposition, coverage_review, executed_evidence, remaining_frontier or residual_risk, and why_no_expand. This does not replace top-level verification_evidence.",
        ),
        evidence_resource_uri: string("Optional resource URI with captured verification evidence for op=verify."),
        metrics: jsonObject("Optional structured metrics for op=verify."),
        failure_reason: string("Optional failure reason for op=verify."),
        blocker: string("Optional blocker details for op=reflect with decision=blocked in an internal reflection run."),
        summary: string("Reflection, planning, verification, frontier, coverage, evidence, or risk summary."),
      },
      ["op"],
    ),
  },
  {
    name: "image_edit",
    description: "Edit one or more images through a configured endpoint-backed Omni tool.",
    permission: "network",
    parameters: objectSchema(
      {
        prompt: string("Image edit instruction."),
        images: { type: "array", items: string("Image URL, file path, data URI, or resource:// URI.") },
        mask_image: string("Optional mask image URL, file path, data URI, or resource:// URI."),
        reference_image: string("Optional reference image URL, file path, data URI, or resource:// URI."),
        n: number("Optional image count."),
        size: string("Optional size such as 1024x1024 or auto."),
        response_format: stringEnum("Optional response format.", ["b64_json", "url"]),
        output_format: stringEnum("Optional output format.", ["png", "jpeg", "webp"]),
        background: string("Optional background mode."),
        output_compression: number("Optional output compression 0-100."),
        negative_prompt: string("Optional negative prompt."),
        num_inference_steps: number("Optional diffusion step count."),
        guidance_scale: number("Optional guidance scale."),
        strength: number("Optional edit strength."),
        true_cfg_scale: number("Optional true CFG scale."),
        seed: number("Optional seed."),
      },
      ["prompt", "images"],
    ),
  },
  {
    name: "image_generation",
    description: "Generate images through a configured endpoint-backed Omni tool.",
    permission: "network",
    parameters: objectSchema(
      {
        prompt: string("Image generation prompt."),
        size: string("Optional size such as 1024x1024."),
        n: number("Optional image count."),
        response_format: stringEnum("Optional response format.", ["b64_json", "url"]),
        output_format: stringEnum("Optional output format.", ["png", "jpeg", "webp"]),
        negative_prompt: string("Optional negative prompt."),
        num_inference_steps: number("Optional diffusion step count."),
        guidance_scale: number("Optional guidance scale."),
        true_cfg_scale: number("Optional true CFG scale."),
        seed: number("Optional seed."),
      },
      ["prompt"],
    ),
  },
  {
    name: "init_experiment",
    description: "Initialize or activate a research experiment after ./autoresearch.sh exists. Defines the primary metric, direction, scope, constraints, and soft iteration cap.",
    permission: "read",
    parameters: objectSchema(
      {
        name: string("Experiment name."),
        goal: string("Optional experiment goal."),
        primary_metric: string("Primary metric name printed by the harness as METRIC name=value."),
        metric_unit: string("Metric unit such as ms, tokens, or percent."),
        direction: stringEnum("Better direction.", ["lower", "higher"]),
        hypothesis: string("Research hypothesis this experiment tests."),
        intervention: string("Intervention, algorithm, system change, or condition being tested."),
        baseline: string("Baseline or control condition to compare against."),
        controls: { type: "array", items: string("Control, ablation, or comparison condition.") },
        reward_hack_risks: { type: "array", items: string("Known way the metric could improve without real progress.") },
        variance_plan: string("Plan for repeatability, variance, sampling, or confounder checks."),
        scope_paths: { type: "array", items: string("Expected-to-modify path or glob.") },
        off_limits: { type: "array", items: string("Path or glob that should not be modified.") },
        constraints: { type: "array", items: string("Free-form experiment constraint.") },
        max_iterations: number("Optional positive keep-run cap."),
        validate_harness: boolean("Run ./autoresearch.sh during initialization and require the primary metric. Defaults to true."),
      },
      ["name", "primary_metric"],
    ),
  },
  {
    name: "list_dir",
    description: "List files and folders in a workspace directory, or an absolute local directory when workspace access is full.",
    permission: "read",
    parameters: objectSchema(
      {
        path: string("Workspace-relative directory path, or absolute local directory when access is full. Use '.' or '/' for the workspace root."),
        limit: number("Maximum entries."),
        page: string("Opaque page token."),
      },
      ["path"],
    ),
  },
  {
    name: "plan",
    description: "Manage plan mode for this session: create, inspect, update, approve, pause, resume, or drop a plan.",
    permission: "read",
    parameters: objectSchema(
      {
        op: stringEnum("Plan operation.", ["create", "get", "update", "approve", "pause", "resume", "drop"]),
        objective: string("Plan objective. Required for op=create when no active plan exists; optional replacement for op=update."),
        body: string("Self-contained markdown plan body for op=create, update, or approve."),
        summary: string("Concise plan summary or approval summary."),
      },
      ["op"],
    ),
  },
  {
    name: "log_experiment",
    description: "Log the latest pending research run. Use keep for accepted improvements, discard/crash/checks_failed for failed runs. Records the primary metric, description, secondary metrics, and ASI metadata.",
    permission: "read",
    parameters: objectSchema(
      {
        status: stringEnum("Run outcome.", ["keep", "discard", "crash", "checks_failed"]),
        experiment_status: stringEnum("Optional lifecycle status for the experiment after this run.", ["active", "completed", "rejected"]),
        metric: number("Primary metric value to record. Optional when the pending run parsed the primary metric."),
        description: string("Short description of what changed or what the run measured."),
        metrics: jsonObject("Optional secondary metric values."),
        reward_hack_check: string("Optional check that the run did not only exploit the metric or evaluator."),
        variance_check: string("Optional variance/reproducibility/confounder check for this run."),
        asi: jsonObject("Optional structured autoresearch metadata."),
      },
      ["status", "description"],
    ),
  },
  {
    name: "lsp",
    description: "Run read-only code-intelligence actions such as status, diagnostics, symbols, hover, and references.",
    permission: "read",
    parameters: objectSchema(
      {
        action: stringEnum("Read-only LSP action.", ["status", "diagnostics", "definition", "references", "hover", "symbols", "code_actions"]),
        path: string("Workspace-relative path."),
        line: number("1-based line."),
        character: number("1-based character."),
        symbol: string("Symbol name."),
        query: string("Search query."),
        timeout_ms: number("Timeout in milliseconds."),
      },
      ["action"],
    ),
  },
  {
    name: "lsp_rename",
    description: "Rename a symbol in one workspace file using the lightweight code-intelligence fallback.",
    permission: "write",
    parameters: objectSchema(
      {
        path: string("Workspace-relative path."),
        symbol: string("Symbol to rename."),
        new_name: string("Rename target."),
        line: number("Optional 1-based line hint."),
        character: number("Optional 1-based character hint."),
      },
      ["path", "symbol", "new_name"],
    ),
  },
  {
    name: "read_file",
    description: "Read a bounded window from a workspace-relative or absolute local file path.",
    permission: "read",
    parameters: objectSchema(
      {
        path: string("Workspace-relative path, absolute local path, or file:// URL."),
        start_line: number("1-based start line."),
        line_count: number("Number of lines."),
      },
      ["path"],
    ),
  },
  {
    name: "read_process",
    description: "Read bounded output from a background process started by run_command with background=true. Poll with since_seq/next_seq; keep max_bytes small unless the user asks for full logs.",
    permission: "read",
    parameters: objectSchema(
      {
        process_id: string("Session-scoped process id."),
        since_seq: number("Read output after this sequence."),
        max_bytes: number("Maximum bytes to return. Prefer 12000 or less for readable output."),
      },
      ["process_id"],
    ),
  },
  {
    name: "read_resource",
    description: "Read a bounded page from a managed resource URI. Use uri='list' to discover current-session resources; unique short suffixes are accepted.",
    permission: "read",
    parameters: objectSchema(
      {
        uri: string("Managed resource URI, 'list', or a unique suffix of a current-session resource URI."),
        page: string("Opaque page token or numeric offset."),
        line_count: number("Number of lines to read."),
      },
      ["uri"],
    ),
  },
  {
    name: "export_resource",
    description: "Export a managed resource URI to a local file for preview or manual validation. Media bytes are exported when available; text and JSON resources are written as UTF-8.",
    permission: "write",
    parameters: objectSchema(
      {
        uri: string("Managed resource URI or a unique suffix of a current-session resource URI."),
        path: string("Optional workspace-relative output path. Defaults to .inferoa/exports/<resource-id>.<ext>."),
        media_index: number("Optional zero-based media index when an evidence resource contains multiple media items."),
      },
      ["uri"],
    ),
  },
  {
    name: "run_command",
    description: "Run a bounded shell command. Use background=false or omit it for short synchronous commands that should finish quickly. Use background=true for long-running, polling, watch, dev-server, test-suite, or command-log jobs; it returns a stable process_id immediately so the session is not blocked, then read output with read_process and stop it with stop_process. Command output is bounded; full large output is stored as a managed resource.",
    permission: "shell",
    parameters: objectSchema(
      {
        command: string("Shell command to run."),
        cwd: string("Optional workspace-relative cwd."),
        timeout_ms: number("Timeout in milliseconds for synchronous commands. Prefer short timeouts for foreground calls; use background=true instead of very long timeouts."),
        env: jsonObject("Additional environment variables."),
        background: boolean("Run asynchronously in background and return process_id immediately. Use for commands likely to take more than a short foreground turn."),
      },
      ["command"],
    ),
  },
  {
    name: "run_experiment",
    description: "Run the active research benchmark harness with `bash autoresearch.sh`, capture output as a resource, and parse METRIC and ASI lines.",
    permission: "shell",
    parameters: objectSchema({
      experiment_name: string("Optional experiment name. Defaults to the active experiment."),
      timeout_ms: number("Timeout in milliseconds. Defaults to 600000."),
    }),
  },
  {
    name: "subagent",
    description: "Delegate a scoped task to a child sub-agent from the current session. If a loop is active, loop context is attached; otherwise the sub-agent runs as a focused child session and returns concrete evidence to this run.",
    permission: "read",
    parameters: objectSchema(
      {
        task: string("Concrete delegated task. Include enough context, expected evidence, and boundaries for the child sub-agent to work independently."),
        isolation: stringEnum("Optional isolation. Use session by default; use worktree only when the delegated task may edit files independently.", ["session", "worktree"]),
      },
      ["task"],
    ),
  },
  {
    name: "skill",
    description: "List or read skills, or persistently enable/disable skill ids. op=read requires id; op=enable/disable require ids. Read a skill body before relying on it.",
    permission: "write",
    parameters: objectSchema(
      {
        op: stringEnum("Skill operation: list discovers skills; read requires id; enable and disable require ids.", ["list", "read", "enable", "disable"]),
        id: string("Required for op=read. Skill id or exact skill name."),
        ids: { type: "array", items: string("Required for op=enable or op=disable. Skill id or exact skill name.") },
        query: string("For op=list, optional case-insensitive filter over id, name, or description."),
        include_disabled: boolean("For op=list, include skills that are not enabled in config. Defaults to true."),
        limit: number("For op=list, maximum skills."),
        line_count: number("For op=read, maximum lines to return."),
      },
      ["op"],
    ),
  },
  {
    name: "stop_process",
    description: "Stop a background process.",
    permission: "shell",
    parameters: objectSchema(
      {
        process_id: string("Session-scoped process id."),
        signal: string("Signal name. Defaults to SIGTERM."),
      },
      ["process_id"],
    ),
  },
  {
    name: "todo_write",
    description: "Replace the durable task list for this session.",
    permission: "read",
    parameters: objectSchema(
      {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
      },
      ["items"],
    ),
  },
  {
    name: "speech_generation",
    description: "Generate speech through a configured vLLM-Omni Speech endpoint.",
    permission: "network",
    parameters: objectSchema(
      {
        input: string("Text to synthesize."),
        voice: string("Optional voice name."),
        instructions: string("Optional voice style or emotion instructions."),
        response_format: stringEnum("Optional response format.", ["wav", "pcm", "flac", "mp3", "aac", "opus"]),
        speed: number("Optional speed multiplier."),
        task_type: stringEnum("Optional Qwen3-TTS task type.", ["CustomVoice", "VoiceDesign", "Base"]),
        language: string("Optional language name or Auto."),
        ref_audio: string("Optional reference audio URL, file path, data URI, or resource:// URI."),
        ref_text: string("Optional reference transcript."),
        seed: number("Optional seed."),
        max_new_tokens: number("Optional maximum tokens to generate."),
        extra_params: jsonObject("Optional model-specific extra parameters."),
      },
      ["input"],
    ),
  },
  {
    name: "speech_voices",
    description: "List voices exposed by a configured vLLM-Omni Speech endpoint.",
    permission: "network",
    parameters: objectSchema({}),
  },
  {
    name: "update_experiment",
    description: "Update the active research experiment lifecycle, notes, or active selection. Use this to mark experiment lines active, completed, or rejected.",
    permission: "read",
    parameters: objectSchema({
      experiment_name: string("Optional experiment name. Defaults to the active experiment."),
      status: stringEnum("Optional experiment lifecycle status.", ["active", "completed", "rejected"]),
      notes: string("Optional replacement notes for the experiment."),
      append_idea: string("Optional idea to append under an Ideas section."),
      set_active: boolean("Whether to make this the active experiment. Defaults to true."),
    }),
  },
  {
    name: "video_generation",
    description: "Generate videos through a configured endpoint-backed Omni tool.",
    permission: "network",
    parameters: objectSchema(
      {
        prompt: string("Video generation prompt."),
        mode: stringEnum("Optional mode.", ["async", "sync"]),
        duration: number("Optional duration in seconds."),
        image_reference: string("Optional image reference URL, file path, data URI, or resource:// URI. Sent as vLLM-Omni image_reference JSON payload."),
        input_reference: string("Optional multipart input reference file path, data URI, or resource:// URI."),
        video_reference: string("Optional video reference URL, file path, data URI, or resource:// URI. Sent as vLLM-Omni video_reference JSON payload."),
        size: string("Optional size."),
        width: number("Optional video width."),
        height: number("Optional video height."),
        num_frames: number("Optional frame count."),
        fps: number("Optional frames per second."),
        num_inference_steps: number("Optional diffusion step count."),
        guidance_scale: number("Optional guidance scale."),
        guidance_scale_2: number("Optional secondary guidance scale."),
        boundary_ratio: number("Optional boundary ratio."),
        flow_shift: number("Optional flow shift."),
        true_cfg_scale: number("Optional true CFG scale."),
        negative_prompt: string("Optional negative prompt."),
        enable_frame_interpolation: boolean("Optionally enable frame interpolation."),
        frame_interpolation_exp: number("Optional frame interpolation exponent."),
        frame_interpolation_scale: number("Optional frame interpolation scale."),
        frame_interpolation_model_path: string("Optional frame interpolation model path."),
        lora: string("Optional LoRA adapter."),
        extra_params: jsonObject("Optional model-specific parameters."),
        seed: number("Optional seed."),
        timeout_ms: number("Optional job timeout in milliseconds."),
        poll_ms: number("Optional polling interval in milliseconds."),
      },
      ["prompt"],
    ),
  },
  {
    name: "video_understanding",
    description: "Analyze video inputs through a configured endpoint-backed Omni tool.",
    permission: "network",
    parameters: objectSchema(
      {
        inputs: { type: "array", items: string("Video URL, file path, data URI, or resource:// URI.") },
        prompt: string("Question or instruction."),
        detail: string("Optional detail level."),
      },
      ["inputs", "prompt"],
    ),
  },
  {
    name: "vision_understanding",
    description: "Analyze images or screenshots through a configured multimodal endpoint.",
    permission: "network",
    parameters: objectSchema(
      {
        inputs: { type: "array", items: string("Image URL, file path, data URI, or resource:// URI.") },
        prompt: string("Question or instruction."),
        detail: string("Optional detail level."),
      },
      ["inputs", "prompt"],
    ),
  },
  {
    name: "web_open",
    description: "Open an HTTP/HTTPS URL and return readable page text or raw HTML. This does not require a web_search provider.",
    permission: "network",
    parameters: objectSchema(
      {
        url: string("HTTP or HTTPS URL to open, surface, and preview."),
        note: string("Optional reason or instruction for the opened URL."),
        max_bytes: number("Maximum response bytes to read for the preview. Defaults to 500000."),
        timeout_ms: number("Request timeout in milliseconds. Defaults to 20000."),
        format: stringEnum("Response extraction format.", ["text", "html"]),
      },
      ["url"],
    ),
  },
  {
    name: "web_search",
    description: "Search the web for keyword queries through the configured provider or the default zero-key HTTP fallback chain. Use web_open for direct HTTP/HTTPS URLs.",
    permission: "network",
    parameters: objectSchema(
      {
        query: string("Search query."),
        limit: number("Maximum results."),
        recency_days: number("Optional recency filter in days."),
      },
      ["query"],
    ),
  },
  {
    name: "write_file",
    description: "Create or replace a workspace file, or an absolute local file when workspace access is full.",
    permission: "write",
    parameters: objectSchema(
      {
        path: string("Workspace-relative path, or absolute local path when access is full."),
        content: string("Full file content."),
        overwrite: boolean("Allow replacing an existing file."),
      },
      ["path", "content"],
    ),
  },
  {
    name: "write_process",
    description: "Write stdin to a background process.",
    permission: "shell",
    parameters: objectSchema(
      {
        process_id: string("Session-scoped process id."),
        input: string("Input to write."),
        close_stdin: boolean("Close stdin after writing."),
      },
      ["process_id", "input"],
    ),
  },
] satisfies ToolDefinition[];

export const CORE_TOOL_DEFINITIONS: ToolDefinition[] = DEFINITIONS.slice().sort((a, b) => a.name.localeCompare(b.name));

const OMNI_TOOL_CAPABILITY: Record<string, keyof VllmAgentConfig["omni"]["endpoints"]> = {
  audio_generation: "audio_generation",
  audio_understanding: "audio_understanding",
  image_edit: "image_edit",
  image_generation: "image_generation",
  speech_generation: "speech",
  speech_voices: "speech",
  video_generation: "video_generation",
  video_understanding: "video_understanding",
  vision_understanding: "vision",
};

export function configuredToolDefinitions(config: VllmAgentConfig): ToolDefinition[] {
  return CORE_TOOL_DEFINITIONS.filter((tool) => {
    const capability = OMNI_TOOL_CAPABILITY[tool.name];
    if (!capability) {
      return true;
    }
    if (!config.omni.enabled) {
      return false;
    }
    const endpoint = config.omni.endpoints[capability];
    return Boolean(endpoint?.base_url && endpoint.model);
  });
}
