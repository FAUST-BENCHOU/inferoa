import { resumeSessionPage, type ResumeSessionPage } from "./session-picker.js";
import { fg256 } from "./ansi.js";
import type { ExternalProviderSetupOption } from "../model/providers.js";

export const PROVIDER_PICKER_PAGE_SIZE = 5;

export function providerPickerPage(
  options: readonly ExternalProviderSetupOption[],
  pageIndex: number,
): ResumeSessionPage<ExternalProviderSetupOption> {
  return resumeSessionPage(prioritizeProviderSetupOptions(options), pageIndex, PROVIDER_PICKER_PAGE_SIZE);
}

export function filterProviderPickerOptions(
  options: readonly ExternalProviderSetupOption[],
  query: string,
): ExternalProviderSetupOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...options];
  }
  return options.filter((option) => {
    const provider = option.provider;
    return [
      provider.id,
      provider.label,
      provider.description,
      provider.base_url ?? "",
      provider.default_model ?? "",
      provider.provider_kind,
      provider.model_hints.join(" "),
      option.description,
    ].join(" ").toLowerCase().includes(normalized);
  });
}

export function prioritizeProviderSetupOptions(
  options: readonly ExternalProviderSetupOption[],
): ExternalProviderSetupOption[] {
  return [...options].sort((a, b) => {
    const rank = providerSetupOptionRank(a) - providerSetupOptionRank(b);
    if (rank !== 0) {
      return rank;
    }
    return a.provider.listing_priority - b.provider.listing_priority || a.provider.label.localeCompare(b.provider.label);
  });
}

export function renderProviderSetupOptionLine(option: ExternalProviderSetupOption, active: boolean): string {
  const marker = active ? fg256(75, "›") : fg256(238, " ");
  const nameColor = active ? 252 : 248;
  const prefix = providerSetupOptionPrefix(option, nameColor);
  const name = fg256(nameColor, option.provider.label);
  const detail = option.description ? `  ${fg256(244, option.description)}` : "";
  return `${marker} ${prefix} ${name}${detail}`;
}

function providerSetupOptionRank(option: ExternalProviderSetupOption): number {
  if (option.inUse) {
    return 0;
  }
  if (option.connected || option.discovered) {
    return 1;
  }
  return 2;
}

function providerSetupOptionPrefix(option: ExternalProviderSetupOption, nameColor: number): string {
  if (option.inUse) {
    return `${fg256(48, "●")} ${fg256(nameColor, "[in-use]")}`;
  }
  if (option.connected || option.discovered) {
    return `${fg256(48, "●")} ${fg256(nameColor, "[connected]")}`;
  }
  return fg256(244, option.provider.auth_type === "none" ? "[open]" : "[key]");
}
