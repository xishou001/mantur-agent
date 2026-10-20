/** Copy owned by the Mantur brand occupants. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  name: 'CUC漫创',
  headline: '故事起于一念，余下交给CUC漫创',
} satisfies Record<string, string>

/** Mantur brand dictionary key union. */
export type ManturBrandKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  name: 'CUC漫创',
  headline: 'Every story starts with an idea. CUC漫创 handles the rest.',
} satisfies Record<ManturBrandKey, string>
