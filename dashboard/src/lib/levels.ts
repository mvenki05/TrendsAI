// Friendly display names for taxonomy levels. The DB keeps the internal grammar
// (product / ingredient / behaviour / psychographic); the UI speaks plain language.
export const LEVEL_LABEL: Record<string, string> = {
  product: "what to make",
  ingredient: "what's in it",
  behaviour: "what people do",
  psychographic: "why they do it",
};

export const levelLabel = (level: string): string => LEVEL_LABEL[level] ?? level;
