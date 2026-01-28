import type { Database } from '@/integrations/supabase/types';
import { Constants } from '@/integrations/supabase/types';

export type KbCategory = Database['public']['Enums']['kb_category'];

export const kbCategoryOptions = ([...Constants.public.Enums.kb_category] as KbCategory[]).map((value) => ({
  value,
  labelKey: `category_${value}`,
}));
