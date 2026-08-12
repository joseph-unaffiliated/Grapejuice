import type { AgeGroup, CatalogItem } from '../types/pilot';
import { getCurationTags } from './catalogCuration';
import {
  isKidsDreidel,
  isKidsMenorah,
  itemHasCategory,
} from './storefrontCategories';

export type AgeFilterKey = AgeGroup | 'all';

export type FilterChip = {
  key: string;
  label: string;
};

export type ContextualFilterGroup = {
  id: string;
  label: string;
  options: FilterChip[];
};

/** Known materials we surface when present in `materials` or product name. */
const MATERIAL_KEYWORDS: { key: string; label: string; pattern: RegExp }[] = [
  { key: 'brass', label: 'Brass', pattern: /\bbrass\b/i },
  { key: 'bronze', label: 'Bronze', pattern: /\bbronze\b/i },
  { key: 'copper', label: 'Copper', pattern: /\bcopper\b/i },
  { key: 'silver', label: 'Silver', pattern: /\bsilver\b/i },
  { key: 'gold', label: 'Gold', pattern: /\bgold\b/i },
  { key: 'pewter', label: 'Pewter', pattern: /\bpewter\b/i },
  { key: 'steel', label: 'Steel', pattern: /\bsteel\b|\bstainless\b/i },
  { key: 'iron', label: 'Iron', pattern: /\biron\b/i },
  { key: 'marble', label: 'Marble', pattern: /\bmarble\b/i },
  { key: 'stone', label: 'Stone', pattern: /\bstone\b|\bgranite\b|\balabaster\b/i },
  { key: 'ceramic', label: 'Ceramic', pattern: /\bceramic\b|\bporcelain\b|\bslipcast\b|\bclay\b/i },
  { key: 'glass', label: 'Glass', pattern: /\bglass\b/i },
  { key: 'wood', label: 'Wood', pattern: /\bwood\b|\bolive\b/i },
  { key: 'acrylic', label: 'Acrylic', pattern: /\bacrylic\b|\bresin\b/i },
  { key: 'plastic', label: 'Plastic', pattern: /\bplastic\b/i },
  { key: 'beeswax', label: 'Beeswax', pattern: /\bbeeswax\b/i },
  { key: 'wax', label: 'Wax', pattern: /\bwax\b/i },
  { key: 'cotton', label: 'Cotton', pattern: /\bcotton\b/i },
  { key: 'linen', label: 'Linen', pattern: /\blinen\b/i },
  { key: 'wool', label: 'Wool', pattern: /\bwool\b/i },
  { key: 'plush', label: 'Plush', pattern: /\bplush\b|\bstuff/i },
];

const AGE_OPTIONS: FilterChip[] = [
  { key: 'all', label: 'All ages' },
  { key: '0-2', label: '0–2' },
  { key: '3-5', label: '3–5' },
  { key: '6-8', label: '6–8' },
  { key: '9-12', label: '9–12' },
];

function itemHaystack(item: CatalogItem): string {
  return `${item.materials ?? ''} ${item.name} ${item.description ?? ''}`;
}

function materialsOnItem(item: CatalogItem): string[] {
  const hay = itemHaystack(item);
  return MATERIAL_KEYWORDS.filter((m) => m.pattern.test(hay)).map((m) => m.key);
}

function materialOptionsFromItems(items: CatalogItem[]): FilterChip[] {
  const present = new Set<string>();
  for (const item of items) {
    for (const key of materialsOnItem(item)) present.add(key);
  }
  const chips = MATERIAL_KEYWORDS.filter((m) => present.has(m.key)).map((m) => ({
    key: m.key,
    label: m.label,
  }));
  if (chips.length < 2) return [];
  return [{ key: 'all', label: 'All materials' }, ...chips];
}

/** True when age bands actually differ across the aisle (not every item tagged all ages). */
function ageFilterIsUseful(items: CatalogItem[]): boolean {
  if (items.length < 2) return false;
  const signatures = new Set(
    items.map((item) => [...(item.ageGroups ?? [])].sort().join(','))
  );
  if (signatures.size <= 1) return false;
  // Also require at least one item that isn't open to every band.
  return items.some((item) => (item.ageGroups?.length ?? 0) > 0 && (item.ageGroups?.length ?? 0) < 4);
}

function styleOptionsForMenorahs(items: CatalogItem[]): FilterChip[] {
  const hasKids = items.some(isKidsMenorah);
  const hasCollection = items.some((i) => !isKidsMenorah(i));
  if (!hasKids || !hasCollection) return [];
  return [
    { key: 'all', label: 'All styles' },
    { key: 'collection', label: 'Keepsake' },
    { key: 'kids', label: 'For kids' },
  ];
}

function styleOptionsForDreidels(items: CatalogItem[]): FilterChip[] {
  const hasKids = items.some(isKidsDreidel);
  const hasCollection = items.some((i) => !isKidsDreidel(i));
  if (!hasKids || !hasCollection) return [];
  return [
    { key: 'all', label: 'All styles' },
    { key: 'collection', label: 'Keepsake' },
    { key: 'kids', label: 'For kids' },
  ];
}

function giftTypeOptions(items: CatalogItem[]): FilterChip[] {
  const types: FilterChip[] = [];
  const hasApparel = items.some((i) => getCurationTags(i).includes('apparel'));
  const hasDecor = items.some((i) => getCurationTags(i).includes('decorations'));
  const hasActivity = items.some((i) => itemHasCategory(i, 'Activity'));
  if (hasApparel) types.push({ key: 'apparel', label: 'Apparel' });
  if (hasDecor) types.push({ key: 'decorations', label: 'Table & decor' });
  if (hasActivity) types.push({ key: 'activity', label: 'Activities' });
  if (types.length < 2) return [];
  return [{ key: 'all', label: 'All types' }, ...types];
}

function foodTypeOptions(items: CatalogItem[]): FilterChip[] {
  const defs: { key: string; label: string; test: (i: CatalogItem) => boolean }[] = [
    { key: 'gelt', label: 'Gelt', test: (i) => /gelt/i.test(i.name) },
    {
      key: 'latke',
      label: 'Latkes',
      test: (i) => /latke/i.test(i.name),
    },
    {
      key: 'sufgan',
      label: 'Sufganiyot',
      test: (i) => /sufgan|donut|doughnut/i.test(i.name),
    },
    {
      key: 'baking',
      label: 'Baking',
      test: (i) => /cookie|cutter|applesauce|mix/i.test(i.name),
    },
    {
      key: 'table',
      label: 'Table',
      test: (i) => /napkin|plate|runner/i.test(i.name),
    },
  ];
  const present = defs.filter((d) => items.some(d.test));
  if (present.length < 2) return [];
  return [
    { key: 'all', label: 'All types' },
    ...present.map((d) => ({ key: d.key, label: d.label })),
  ];
}

/**
 * Build aisle-specific filter groups from the live category items.
 * Sort is handled separately by the screen (always shown).
 */
export function contextualFiltersForCategory(
  slug: string,
  items: CatalogItem[]
): ContextualFilterGroup[] {
  const groups: ContextualFilterGroup[] = [];

  switch (slug) {
    case 'books': {
      if (ageFilterIsUseful(items)) {
        groups.push({ id: 'age', label: 'Age', options: AGE_OPTIONS });
      }
      break;
    }
    case 'menorahs': {
      const styles = styleOptionsForMenorahs(items);
      if (styles.length) groups.push({ id: 'style', label: 'Style', options: styles });
      const materials = materialOptionsFromItems(items);
      if (materials.length) groups.push({ id: 'material', label: 'Material', options: materials });
      break;
    }
    case 'dreidels': {
      const styles = styleOptionsForDreidels(items);
      if (styles.length) groups.push({ id: 'style', label: 'Style', options: styles });
      const materials = materialOptionsFromItems(items);
      if (materials.length) groups.push({ id: 'material', label: 'Material', options: materials });
      break;
    }
    case 'candles': {
      const materials = materialOptionsFromItems(items);
      if (materials.length) groups.push({ id: 'material', label: 'Material', options: materials });
      break;
    }
    case 'food': {
      const types = foodTypeOptions(items);
      if (types.length) groups.push({ id: 'type', label: 'Type', options: types });
      break;
    }
    case 'gifts': {
      const types = giftTypeOptions(items);
      if (types.length) groups.push({ id: 'type', label: 'Type', options: types });
      const materials = materialOptionsFromItems(items);
      if (materials.length) groups.push({ id: 'material', label: 'Material', options: materials });
      break;
    }
    case 'collection':
    default:
      break;
  }

  return groups;
}

export function applyContextualFilters(
  items: CatalogItem[],
  slug: string,
  selected: Record<string, string>
): CatalogItem[] {
  let list = items;

  const age = selected.age;
  if (age && age !== 'all') {
    list = list.filter((item) => item.ageGroups?.includes(age as AgeGroup));
  }

  const material = selected.material;
  if (material && material !== 'all') {
    const def = MATERIAL_KEYWORDS.find((m) => m.key === material);
    if (def) {
      list = list.filter((item) => def.pattern.test(itemHaystack(item)));
    }
  }

  const style = selected.style;
  if (style && style !== 'all') {
    if (slug === 'menorahs') {
      list = list.filter((item) =>
        style === 'kids' ? isKidsMenorah(item) : !isKidsMenorah(item)
      );
    } else if (slug === 'dreidels') {
      list = list.filter((item) =>
        style === 'kids' ? isKidsDreidel(item) : !isKidsDreidel(item)
      );
    }
  }

  const type = selected.type;
  if (type && type !== 'all') {
    if (slug === 'gifts') {
      list = list.filter((item) => {
        const tags = getCurationTags(item);
        if (type === 'apparel') return tags.includes('apparel');
        if (type === 'decorations') return tags.includes('decorations');
        if (type === 'activity') return itemHasCategory(item, 'Activity');
        return true;
      });
    } else if (slug === 'food') {
      list = list.filter((item) => {
        switch (type) {
          case 'gelt':
            return /gelt/i.test(item.name);
          case 'latke':
            return /latke/i.test(item.name);
          case 'sufgan':
            return /sufgan|donut|doughnut/i.test(item.name);
          case 'baking':
            return /cookie|cutter|applesauce|mix/i.test(item.name);
          case 'table':
            return /napkin|plate|runner/i.test(item.name);
          default:
            return true;
        }
      });
    }
  }

  return list;
}
