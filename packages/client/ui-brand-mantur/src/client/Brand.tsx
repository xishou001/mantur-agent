/** Mantur visual identity and localized product copy. */
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/** Props shared by the two product-name occupants. */
type ManturNameProps = PropsLocale<'brand.mantur'>
const MANTUR_LOGO_SRC = './aiying-icon.png'

/** Render the approved Aiying square artwork at a host-owned size. */
function ManturLogo({ size, className }: { size: number; className?: string | undefined }) {
  return <img src={MANTUR_LOGO_SRC} width={size} height={size} className={className} alt="" />
}

/**
 * Render the transparent wordmark when expanded and the square icon in the rail.
 * @param props - Sidebar placement selected by the shell.
 * @returns the placement-specific brand artwork.
 */
export function ManturSidebarMark({ size, placement }: SidebarBrandMarkOwnerProps) {
  return placement === 'expanded'
    ? <img src="./aiying-wordmark.svg" width={Math.round(size * 13 / 3)} height={size}
      style={{ objectFit: 'contain', flexShrink: 0 }} alt="Aiying Works" />
    : <ManturLogo size={size} />
}

/**
 * Render the full Mantur product name in the sidebar.
 * @param props - Standard locale seat.
 * @returns localized product-name text.
 */
export function ManturSidebarName({ t }: ManturNameProps) {
  return <span>{t('name')}</span>
}

/**
 * Render the Mantur mark before the blank-session headline.
 * @param props - Hero placement selected by the conversation shell.
 * @returns the approved Mantur logo.
 */
export function ManturHeroBrand({ size, className }: HeroBrandMarkOwnerProps) {
  return <img src="./aiying-wordmark.svg" width={Math.round(size * 13 / 3)} height={size}
    className={className} style={{ maxWidth: '100%', objectFit: 'contain' }} alt="Aiying Works" />
}

/**
 * Render the Mantur blank-session headline.
 * @param props - Standard Mantur locale seat.
 * @returns the localized product promise.
 */
export function ManturHeroHeadline({ t }: ManturNameProps) {
  return <>{t('headline')}</>
}

/** @returns no preview badge in the Mantur composition. */
export function ManturHeroBadge() {
  return null
}
