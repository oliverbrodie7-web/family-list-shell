export const CATEGORIES = [
  "produce",
  "bakery",
  "deli",
  "meat",
  "dairy",
  "frozen",
  "lollies_chocolate",
  "pantry",
  "household",
  "misc",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  produce: "Fruit and Vegetables",
  bakery: "Bakery",
  deli: "Deli",
  meat: "Meat",
  dairy: "Dairy",
  frozen: "Frozen",
  lollies_chocolate: "Lollies & chocolate",
  pantry: "Pantry",
  household: "Household",
  misc: "Misc",
};
