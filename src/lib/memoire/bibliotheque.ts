/**
 * Index local des 5 086 titres possédés, pour le mode Terra incognita.
 *
 * Chargé par fetch depuis public/data/, jamais importé dans le bundle et
 * JAMAIS envoyé à l'API Anthropic. 259 Ko côté navigateur, zéro token côté
 * facture. L'empreinte, elle, ne nomme que 90 titres : sans ce fichier,
 * Terra incognita reproposerait des morceaux déjà présents chez moi.
 */

import type { Bibliotheque } from '../../types'
import { cleBibliotheque } from '../texte'

const CHEMIN = '/data/bibliotheque.json'

let cache: { ids: Set<string>; cles: Set<string> } | null = null
let chargement: Promise<{ ids: Set<string>; cles: Set<string> }> | null = null

export async function chargerBibliotheque(): Promise<{ ids: Set<string>; cles: Set<string> }> {
  if (cache) return cache
  if (chargement) return chargement

  chargement = (async () => {
    try {
      const reponse = await fetch(CHEMIN)
      if (!reponse.ok) throw new Error(String(reponse.status))
      const donnees = (await reponse.json()) as Bibliotheque
      cache = {
        ids: new Set(donnees.ids ?? []),
        cles: new Set(donnees.cles ?? []),
      }
    } catch {
      // Dégradation propre : sans index, Terra incognita ne filtre plus,
      // mais l'application continue de fonctionner.
      cache = { ids: new Set(), cles: new Set() }
    } finally {
      chargement = null
    }
    return cache
  })()

  return chargement
}

/** Ce titre est-il déjà dans ma bibliothèque ? Test par identifiant puis par nom. */
export function dejaPossede(
  index: { ids: Set<string>; cles: Set<string> },
  idPiste: string,
  artiste: string,
  titre: string,
): boolean {
  if (index.ids.has(idPiste)) return true
  return index.cles.has(cleBibliotheque(artiste, titre))
}

export function tailleIndex(): number {
  return cache ? cache.ids.size : 0
}
