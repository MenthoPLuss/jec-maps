const KEBAB_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** True for ids like `main-gate` or `ee-dept-204`. */
export function isKebabId(value: string): boolean {
  return KEBAB_ID.test(value);
}

/**
 * Turns a display name into a kebab-case id: "EE Dept." becomes "ee-dept".
 * Returns an empty string when the name has no letters or digits.
 */
export function toKebabId(name: string): string {
  return name
    .normalize("NFKD") // split accented letters into letter + accent...
    .replace(/[̀-ͯ]/g, "") // ...and drop the accent
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
