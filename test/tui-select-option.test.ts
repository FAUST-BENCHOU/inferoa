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
