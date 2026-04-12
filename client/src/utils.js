export function formatMoney(amount) {
  if (amount == null) return '$0';
  if (amount >= 1_000_000_000_000) return `$${(amount / 1_000_000_000_000).toFixed(1)}T`;
  if (amount >= 1_000_000_000)     return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000)         return `$${(amount / 1_000_000).toFixed(0)}M`;
  if (amount >= 1_000)             return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount}`;
}

export const GROUP_COLORS = {
  brown:        '#8B4513',
  light_blue:   '#87CEEB',
  pink:         '#FF69B4',
  orange:       '#FF8C00',
  red:          '#DC143C',
  yellow:       '#DAA520',
  green:        '#228B22',
  dark_blue:    '#00008B',
  bowl_game:    '#8B008B',
  tv_contract:  '#2F4F4F',
};

export const GROUP_LABELS = {
  brown:        'The Founding Era (1890s-1900s)',
  light_blue:   'Early Growth Era (1910s-1920s)',
  pink:         'Depression & Wartime Era (1930s-1940s)',
  orange:       'Integration Era (1950s-1960s)',
  red:          "The Bear Bryant Era (1960s-1970s)",
  yellow:       'Conference Expansion Era (1980s-1990s)',
  green:        'BCS/Playoff Era (2000s-2010s)',
  dark_blue:    'NIL/Modern Era (2010s-Present)',
  bowl_game:    'Bowl Games',
  tv_contract:  'TV Contracts',
};
