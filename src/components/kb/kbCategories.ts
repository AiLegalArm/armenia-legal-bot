import type { Database } from '@/integrations/supabase/types';

export type KbCategory = Database['public']['Enums']['kb_category'];

// Filtered list of categories to display in the UI
export const allowedCategories: KbCategory[] = [
  'civil_code',
  'administrative_code',
  'judicial_code',
  'constitutional_law',
  'family_code',
  'criminal_code',
  'labor_code',
  'tax_code',
  'land_code',
  'water_code',
  'real_estate_code',
  'administrative_procedure_code',
  'civil_procedure_code',
  'housing_code',
  'criminal_procedure_code',
  'criminal_economic_code',
  'justice_ministry_code',
  'economic_code',
  'cassation_criminal',
  'cassation_civil',
  'cassation_administrative',
];

export const kbCategoryOptions = allowedCategories.map((value) => ({
  value,
  labelKey: `category_${value}`,
}));
