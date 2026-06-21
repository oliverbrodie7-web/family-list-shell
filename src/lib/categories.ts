export const CATEGORIES = [
  "produce",
  "bakery",
  "deli",
  "meat",
  "dairy",
  "frozen",
  "pantry",
  "household",
  "misc",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  produce: "Produce",
  bakery: "Bakery",
  deli: "Deli",
  meat: "Meat",
  dairy: "Dairy",
  frozen: "Frozen",
  pantry: "Pantry",
  household: "Household",
  misc: "Misc",
};
