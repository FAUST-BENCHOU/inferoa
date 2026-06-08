import test from "node:test";
import assert from "node:assert/strict";
import { stripAnsi } from "../src/tui/ansi.js";
import { parseSlashCommand, slashCommandWithSubcommands, slashSubcommands } from "../src/tui/slash.js";
import { renderUnknownSlashCommandNotice } from "../src/tui/slash-notice.js";

test("slash parser uses clear as the fresh-session command", () => {
  const parsed = parseSlashCommand("/clear");
  assert.equal(parsed.command?.name, "clear");
  assert.equal(parsed.args, "");
  assert.equal(parsed.error, undefined);
});

test("slash parser supports goal and autoresearch chat commands", () => {
  const goal = parseSlashCommand("/goal ship the feature");
  assert.equal(goal.command?.name, "goal");
  assert.equal(goal.args, "ship the feature");
  assert.equal(goal.error, undefined);

  const plan = parseSlashCommand("/plan add offline retry support");
  assert.equal(plan.command?.name, "plan");
  assert.equal(plan.args, "add offline retry support");
  assert.equal(plan.error, undefined);

  const autoresearch = parseSlashCommand("/autoresearch reduce benchmark latency");
  assert.equal(autoresearch.command?.name, "autoresearch");
  assert.equal(autoresearch.args, "reduce benchmark latency");
  assert.equal(autoresearch.error, undefined);
});

test("slash parser exposes system command and keeps endpoint aliases", () => {
  const system = parseSlashCommand("/system");
  assert.equal(system.command?.name, "system");
  assert.equal(system.error, undefined);

  const endpoint = parseSlashCommand("/endpoint");
  assert.equal(endpoint.command?.name, "system");
  assert.equal(endpoint.error, undefined);

  const endpoints = parseSlashCommand("/endpoints");
  assert.equal(endpoints.command?.name, "system");
  assert.equal(endpoints.error, undefined);
});

test("slash parser exposes clear session commands and readable activity command", () => {
  const activity = parseSlashCommand("/activity");
  assert.equal(activity.command?.name, "activity");
  assert.equal(activity.error, undefined);

  const evidenceAlias = parseSlashCommand("/evidence");
  assert.equal(evidenceAlias.command?.name, "activity");
  assert.equal(evidenceAlias.error, undefined);

  const fresh = parseSlashCommand("/new");
  assert.equal(fresh.command, undefined);
  assert.equal(fresh.error, "Unrecognized command '/new'. Type '/' for commands.");

  const resume = parseSlashCommand("/resume s_123");
  assert.equal(resume.command?.name, "resume");
  assert.equal(resume.args, "s_123");
  assert.equal(resume.error, undefined);
});

test("unknown slash command notice is short and neutral", () => {
  const rendered = renderUnknownSlashCommandNotice("sdsdsdsd");
  const plain = stripAnsi(rendered);

  assert.equal(plain, "• Unrecognized command '/sdsdsdsd'. Type '/' for commands.");
  assert.match(rendered, /\x1b\[38;5;244m/);
  assert.doesNotMatch(rendered, /\x1b\[38;5;203m/);
});

test("slash registry exposes chat subcommands for completion", () => {
  assert.equal(slashCommandWithSubcommands("/tools"), "tools");
  assert.equal(slashCommandWithSubcommands("/jobs"), "jobs");
  assert.equal(slashCommandWithSubcommands("/acceptance"), "acceptance");
  assert.equal(slashCommandWithSubcommands("/goal"), "goal");
  assert.equal(slashCommandWithSubcommands("/plan"), "plan");
  assert.equal(slashCommandWithSubcommands("/autoresearch"), "autoresearch");
  assert.equal(slashCommandWithSubcommands("/sessions"), "sessions");
  assert.equal(slashCommandWithSubcommands("/clear"), undefined);
  assert.deepEqual(
    slashSubcommands("tools").map((item) => item.value),
    ["/tools", "/tools expand", "/tools compact", "/tools last"],
  );
  assert.ok(slashSubcommands("jobs").some((item) => item.value === "/jobs cancel"));
  assert.deepEqual(
    slashSubcommands("acceptance").map((item) => item.value),
    ["/acceptance status", "/acceptance run"],
  );
  assert.deepEqual(
    slashSubcommands("goal").map((item) => item.value),
    ["/goal show", "/goal set", "/goal plan", "/goal pause", "/goal resume", "/goal budget", "/goal complete", "/goal drop"],
  );
  assert.deepEqual(
    slashSubcommands("plan").map((item) => item.value),
    ["/plan show", "/plan set", "/plan pause", "/plan resume", "/plan approve", "/plan drop"],
  );
  assert.deepEqual(
    slashSubcommands("autoresearch").map((item) => item.value),
    ["/autoresearch status", "/autoresearch off", "/autoresearch clear"],
  );
  assert.deepEqual(
    slashSubcommands("sessions").map((item) => item.value),
    ["/sessions resume", "/sessions new", "/sessions all"],
  );
});
