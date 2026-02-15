

## Bug: Import Wizard sends wrong category to judicial practice

### Problem
When importing into "Judicial Practice" (legal_practice_kb), the category selector on Step 2 shows **KB legislation categories** (e.g., `civil_code`, `criminal_code`) instead of **practice categories** (`criminal`, `civil`, `administrative`, `echr`, `constitutional`). 

The selected KB category (e.g., `civil_code`) is then passed to `useBulkImport`, where line 220 does:
```
practice_category: options.category || 'criminal'
```
Since `civil_code` is not falsy, it gets sent to the edge function as-is, but the database enum expects values like `civil` -- so the edge function likely defaults to `criminal`.

### Fix

**1. Add practice category options in ImportWizard (Step 2)**

When `target === 'legal_practice_kb'`, show a different set of categories:
- `criminal` -- Уголовное
- `civil` -- Гражданское  
- `administrative` -- Административное
- `echr` -- ЕСПЧ
- `constitutional` -- Конституционное

When `target === 'knowledge_base'`, keep the existing `kbCategoryOptions`.

**2. Reset category when switching target (Step 1)**

When the user changes the target between `knowledge_base` and `legal_practice_kb`, reset the category to the appropriate default (`'other'` for KB, `'criminal'` for practice).

**3. Fix fallback in useBulkImport.ts**

Update line 220 to use a validated practice category from `options.category` directly, since the wizard will now guarantee a correct value. Keep the `'criminal'` fallback only as a safety net.

### Files to modify
- `src/components/kb/ImportWizard.tsx` -- Add conditional category selector based on target
- `src/hooks/useBulkImport.ts` -- Minor cleanup of category mapping (optional, since wizard fix resolves root cause)

