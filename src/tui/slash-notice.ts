import { fg256 } from "./ansi.js";

export function unknownSlashCommandMessage(commandName: string): string {
  const normalized = commandName.startsWith("/") ? commandName : `/${commandName}`;
  return `Unrecognized command '${normalized}'. Type '/' for commands.`;
}

export function renderUnknownSlashCommandNotice(commandName: string): string {
  return fg256(244, `• ${unknownSlashCommandMessage(commandName)}`);
}
