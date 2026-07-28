/**
 * Le profil appris : texte libre de 1500 caractères maximum, réécrit par
 * Haiku à la fin de chaque échange, modifiable à la main dans les réglages.
 */

import { ecrire, effacer, lire } from './stockage'

const CLE = 'spotifouille:profil'
export const LONGUEUR_MAX = 1500

export function lireProfil(): string {
  return lire<string>(CLE, '')
}

export function ecrireProfil(texte: string): string {
  const tronque = texte.slice(0, LONGUEUR_MAX)
  ecrire(CLE, tronque)
  return tronque
}

export function effacerProfil(): void {
  effacer(CLE)
}
