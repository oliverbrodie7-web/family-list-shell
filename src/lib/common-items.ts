export interface CommonAisle {
  label: string;
  items: string[];
}

export const COMMON_AISLES: CommonAisle[] = [
  {
    label: "Fruit & Vegetables",
    items: [
      "Bananas",
      "Apples",
      "Avocados",
      "Tomatoes",
      "Baby spinach",
      "Carrots",
      "Potatoes",
      "Onions",
    ],
  },
  {
    label: "Bakery",
    items: ["Bread", "Sourdough", "Wraps", "Croissants"],
  },
  {
    label: "Dairy",
    items: ["Milk", "Butter", "Eggs", "Greek yoghurt", "Cheese"],
  },
  {
    label: "Meat",
    items: ["Chicken breast", "Beef mince", "Bacon", "Sausages"],
  },
  {
    label: "Pantry",
    items: [
      "Pasta",
      "Rice",
      "Olive oil",
      "Tinned tomatoes",
      "Cereal",
      "Coffee",
    ],
  },
  {
    label: "Frozen",
    items: ["Frozen peas", "Ice cream", "Frozen berries"],
  },
  {
    label: "Household",
    items: ["Toilet paper", "Paper towel", "Dishwashing liquid", "Bin bags"],
  },
];

export const ALL_COMMON_ITEMS: string[] = Array.from(
  new Set(COMMON_AISLES.flatMap((a) => a.items)),
);
