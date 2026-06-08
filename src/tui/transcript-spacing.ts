export function withConversationGap(text: string): string {
  return `${text.replace(/\n+$/g, "")}\n\n`;
}
