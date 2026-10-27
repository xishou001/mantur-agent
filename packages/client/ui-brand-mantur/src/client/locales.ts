/** Copy owned by the Mantur brand occupants. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  name: '爱映工厂',
  wordmarkAlt: 'Aiying Works',
  headline: '故事起于一念，余下交给爱映工厂',
} satisfies Record<string, string>

/** Mantur brand dictionary key union. */
export type ManturBrandKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  name: '爱映工厂',
  wordmarkAlt: 'Aiying Works',
  headline: 'Every story starts with an idea. 爱映工厂 handles the rest.',
} satisfies Record<ManturBrandKey, string>
