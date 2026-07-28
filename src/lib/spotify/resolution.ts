/**
 * GARDE-FOU ANTI-HALLUCINATION.
 *
 * C'est le point de défaillance numéro un de ce type d'application. Un modèle
 * de langage invente des morceaux qui n'existent pas, avec un aplomb total :
 * titre crédible, artiste réel, morceau fictif.
 *
 * Règle absolue : aucun titre ne s'affiche s'il n'a pas été résolu par la
 * recherche Spotify, et si l'artiste ET le titre du meilleur résultat ne
 * correspondent pas raisonnablement à ce que Claude a proposé.
 *
 * Élimination silencieuse : rien n'apparaît à l'écran pour un candidat écarté.
 */

import type { Candidat, Piste, Terrain, Trouvaille } from '../../types'
import { artisteCorrespond, cleComparaison, cleTitreNue, correspondanceRaisonnable } from '../texte'
import { dejaPossede } from '../memoire/bibliotheque'
import { rechercherPistes } from './api'

/** Signature de la recherche, injectable pour que le garde-fou soit testable. */
export type Rechercher = (requete: string, limite: number) => Promise<Piste[]>

export interface ContexteResolution {
  angle: string
  terrain: Terrain
  index: { ids: Set<string>; cles: Set<string> }
  urisBannies: Set<string>
  artistesBloques: Set<string>
  /** Par défaut la vraie recherche Spotify. Le script de test en fournit une autre. */
  rechercher?: Rechercher
}

export interface Resolution {
  trouvailles: Trouvaille[]
  /** Candidats qu'aucune recherche n'a pu confirmer : hallucinations probables. */
  echecs: Candidat[]
  /** Écartés parce que déjà proposés, déjà bannis, ou déjà dans la bibliothèque. */
  filtres: number
}

/** Les guillemets casseraient la syntaxe de champ track:"..." . */
const nettoyer = (s: string) => s.replace(/["]/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Le meilleur résultat dont l'artiste ET le titre correspondent vraiment.
 *
 * On classe au lieu de prendre le premier venu : sur « Laisse pas traîner ton
 * fils », Spotify remonte volontiers la version live de Bercy avant
 * l'originale de 1998. Un titre exact doit toujours battre un titre qui
 * contient simplement le texte cherché.
 */
function meilleurAccord(
  resultats: Piste[],
  artisteAttendu: string,
  nomAttendu: string,
  cible: 'titre' | 'album',
): Piste | undefined {
  const attenduExact = cleComparaison(nomAttendu)
  const attenduNu = cleTitreNue(nomAttendu)

  let meilleur: { piste: Piste; note: number } | undefined

  for (const p of resultats) {
    if (!artisteCorrespond(artisteAttendu, p.artists ?? [])) continue
    const compare = cible === 'album' ? (p.album?.name ?? '') : p.name
    if (!correspondanceRaisonnable(nomAttendu, compare)) continue

    let note = 1
    if (cleComparaison(compare) === attenduExact) note = 3
    else if (attenduNu && cleTitreNue(compare) === attenduNu) note = 2

    if (!meilleur || note > meilleur.note) meilleur = { piste: p, note }
    if (note === 3) break
  }

  return meilleur?.piste
}

/** Résout un candidat, ou renvoie undefined s'il ne tient pas debout. */
export async function resoudreUn(
  candidat: Candidat,
  rechercher: Rechercher = rechercherPistes,
): Promise<{ piste: Piste; cible: 'titre' | 'album' } | undefined> {
  const artiste = nettoyer(candidat.artiste ?? '')
  const cible: 'titre' | 'album' = candidat.titre ? 'titre' : 'album'
  const nom = nettoyer((candidat.titre ?? candidat.album ?? '') as string)
  if (!artiste || !nom) return undefined

  // 1. Recherche par champs, la plus précise.
  const champ = cible === 'album' ? 'album' : 'track'
  let resultats = await rechercher(`${champ}:"${nom}" artist:"${artiste}"`, 5)
  let accord = meilleurAccord(resultats, artiste, nom, cible)

  // 2. Deuxième tentative en requête libre, plus tolérante à l'orthographe.
  if (!accord) {
    resultats = await rechercher(`${artiste} ${nom}`, 5)
    accord = meilleurAccord(resultats, artiste, nom, cible)
  }

  // 3. Rien de convaincant : le candidat est éliminé, en silence.
  return accord ? { piste: accord, cible } : undefined
}

export async function resoudreCandidats(
  candidats: Candidat[],
  contexte: ContexteResolution,
): Promise<Resolution> {
  const maintenant = new Date().toISOString()

  // La concurrence est plafonnée à 3 dans le client Spotify, on peut tout lancer.
  const resolus = await Promise.all(
    candidats.map(async (candidat) => ({
      candidat,
      accord: await resoudreUn(candidat, contexte.rechercher).catch(() => undefined),
    })),
  )

  const trouvailles: Trouvaille[] = []
  const echecs: Candidat[] = []
  const urisDuLot = new Set<string>()
  const artistesDuLot = new Set<string>()
  let filtres = 0

  for (const { candidat, accord } of resolus) {
    if (!accord) {
      echecs.push(candidat)
      continue
    }
    const { piste, cible } = accord

    // Doublon à l'intérieur du même lot.
    if (urisDuLot.has(piste.uri)) {
      filtres++
      continue
    }

    // Journal : titre banni, ou artiste revu trop récemment.
    const cleArtiste = cleComparaison(piste.artists[0]?.name ?? candidat.artiste)
    if (contexte.urisBannies.has(piste.uri)) {
      filtres++
      continue
    }
    if (contexte.artistesBloques.has(cleArtiste) || artistesDuLot.has(cleArtiste)) {
      filtres++
      continue
    }

    // Terra incognita : tout titre déjà présent dans ma bibliothèque dégage.
    if (
      contexte.terrain === 'incognita' &&
      dejaPossede(contexte.index, piste.id, piste.artists[0]?.name ?? candidat.artiste, piste.name)
    ) {
      filtres++
      continue
    }

    urisDuLot.add(piste.uri)
    artistesDuLot.add(cleArtiste)
    trouvailles.push({ candidat, piste, cible, angle: contexte.angle, proposeLe: maintenant })
  }

  return { trouvailles, echecs, filtres }
}
