// Registry of individually toggleable advanced features. Each entry gets its
// own per-member toggle in Settings (under the master "Show advanced features"
// switch) and is checked at point of use via useAdvancedFeatures().isFeatureOn(id).
// Add future advanced features here and they appear in Settings automatically.
export type AdvancedFeature = { id: string; name: string };

export const ADVANCED_FEATURES: AdvancedFeature[] = [
  { id: "pricing", name: "Prices and totals" },
];
