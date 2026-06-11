import test from "node:test";
import assert from "node:assert/strict";
import * as appModule from "../src/tui/app.js";
import { SLASH_COMMANDS } from "../src/tui/slash.js";

type SelectOptionWindow = <T>(options: readonly T[], selected: number, pageSize: number) => {
  items: T[];
  pageIndex: number;
  totalPages: number;
};

type MoveSelectOptionPage = (selected: number, totalItems: number, pageSize: number, delta: number) => number;
type SelectOption = { value: string; label: string; description?: string };
type GoalSetupChoiceState = { selectedIndex: number };
type ApplyGoalSetupChoiceToken = <T extends string>(
  state: GoalSetupChoiceState,
  options: Array<SelectOption & { value: T }>,
  key: string,
) => {
  state: GoalSetupChoiceState;
  value?: T;
  cancelled?: boolean;
};
type RenderGoalSetupChoicePanel = <T extends string>(
  title: string,
  options: Array<SelectOption & { value: T }>,
  selectedIndex: number,
  footer?: string[],
  width?: number,
) => string[];

test("slash command picker pagination can reveal doctor command", () => {
  const selectOptionWindow = (appModule as Record<string, unknown>).selectOptionWindow as SelectOptionWindow | undefined;
  const moveSelectOptionPage = (appModule as Record<string, unknown>).moveSelectOptionPage as MoveSelectOptionPage | undefined;
  if (typeof selectOptionWindow !== "function") {
    assert.fail("selectOptionWindow export is required");
  }
  if (typeof moveSelectOptionPage !== "function") {
    assert.fail("moveSelectOptionPage export is required");
  }

  const commands = SLASH_COMMANDS.map((command) => `/${command.name}`);
  const firstPage = selectOptionWindow(commands, 0, 12);
  assert.equal(firstPage.pageIndex, 0);
  assert.equal(firstPage.totalPages, 2);
  assert.equal(firstPage.items.includes("/doctor"), false);

  const secondPageIndex = moveSelectOptionPage(0, commands.length, 12, 1);
  const secondPage = selectOptionWindow(commands, secondPageIndex, 12);
  assert.equal(secondPage.pageIndex, 1);
  assert.equal(secondPage.items.includes("/doctor"), true);
});

test("loop setup choices use arrow navigation and enter selection", () => {
  const applyGoalSetupChoiceToken = (appModule as Record<string, unknown>).applyGoalSetupChoiceToken as ApplyGoalSetupChoiceToken | undefined;
  if (typeof applyGoalSetupChoiceToken !== "function") {
    assert.fail("applyGoalSetupChoiceToken export is required");
  }
  const options = [
    { value: "auto", label: "Auto", description: "Inferoa decides." },
    { value: "focus", label: "Focus", description: "Finish current goal." },
    { value: "timebox", label: "Timebox", description: "Use a checkpoint." },
  ] as const;

  let result = applyGoalSetupChoiceToken({ selectedIndex: 0 }, options.slice(), "\u001b[B");
  assert.equal(result.state.selectedIndex, 1);
  assert.equal(result.value, undefined);

  result = applyGoalSetupChoiceToken(result.state, options.slice(), "\u001b[B");
  assert.equal(result.state.selectedIndex, 2);

  result = applyGoalSetupChoiceToken(result.state, options.slice(), "\r");
  assert.equal(result.value, "timebox");
});

test("loop setup choice panel renders selected row without numeric input affordance", () => {
  const renderGoalSetupChoicePanel = (appModule as Record<string, unknown>).renderGoalSetupChoicePanel as RenderGoalSetupChoicePanel | undefined;
  if (typeof renderGoalSetupChoicePanel !== "function") {
    assert.fail("renderGoalSetupChoicePanel export is required");
  }
  const lines = renderGoalSetupChoicePanel(
    "Timebox",
    [
      { value: "auto", label: "Auto", description: "Inferoa picks the checkpoint time." },
      { value: "2h", label: "2h", description: "2h focused run." },
    ],
    1,
    [],
    100,
  );
  const plain = lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");

  assert.match(plain, /↑\/↓ choose · enter select · esc cancels/);
  assert.match(plain, /› 2h · 2h · selected · 2h focused run\./);
  assert.doesNotMatch(plain, /type a value or number|1\.|2\./);
});
