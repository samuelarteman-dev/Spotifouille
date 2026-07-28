/**
 * Client de la Netlify Function.
 *
 * La prose s'affiche au fil de l'eau ; le bloc <propositions> est masqué
 * pendant qu'il arrive et parsé à la fin.
 */

import { ErreurLisible, type Candidat, type Trouvaille } from '../types'

const OUVERTURE = '<propositions>'
const FERMETURE = '</propositions>'

export interface DemandeFouille {
  message: string
  historique: { role: 'user' | 'assistant'; content: string }[]
  profil: string
  angle: string
  consigneAngle: string
  exploration: number
  terrain: 'incognita' | 'connu'
  journal: string[]
  topCourt: string[]
  topLong: string[]
  cible: 'titres' | 'album'
  /** Relance après échec de résolution : la liste des candidats fantômes. */
  echecs?: string[]
}

export interface Fouille {
  prose: string
  candidats: Candidat[]
  /** Vrai si le bloc était présent mais illisible : on propose « Relancer ». */
  jsonCasse: boolean
}

/**
 * Prose affichable à partir du texte reçu jusqu'ici.
 * Coupe au marqueur, y compris quand il n'est arrivé qu'à moitié, sinon on
 * verrait « <propos » clignoter à l'écran.
 */
export function proseVisible(accumule: string): string {
  const index = accumule.indexOf(OUVERTURE)
  if (index !== -1) return accumule.slice(0, index).trimEnd()

  // Marqueur partiel en fin de flux : on retient le suffixe suspect.
  for (let n = OUVERTURE.length - 1; n > 0; n--) {
    if (accumule.endsWith(OUVERTURE.slice(0, n))) {
      return accumule.slice(0, accumule.length - n).trimEnd()
    }
  }
  return accumule
}

function extraireCandidats(texte: string): { candidats: Candidat[]; casse: boolean } {
  const debut = texte.indexOf(OUVERTURE)
  if (debut === -1) return { candidats: [], casse: false }

  const apres = debut + OUVERTURE.length
  const fin = texte.indexOf(FERMETURE, apres)
  // Bloc tronqué par max_tokens : on repêche jusqu'au dernier crochet fermant.
  const brut = (fin === -1 ? texte.slice(apres) : texte.slice(apres, fin)).trim()
  const dernier = brut.lastIndexOf(']')
  const json = dernier === -1 ? brut : brut.slice(0, dernier + 1)

  try {
    const analyse = JSON.parse(json) as unknown
    if (!Array.isArray(analyse)) return { candidats: [], casse: true }

    const candidats: Candidat[] = []
    for (const item of analyse.slice(0, 8)) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const artiste = typeof o.artiste === 'string' ? o.artiste.trim() : ''
      const titre = typeof o.titre === 'string' ? o.titre.trim() : ''
      const album = typeof o.album === 'string' ? o.album.trim() : ''
      if (!artiste || (!titre && !album)) continue
      candidats.push({
        artiste,
        ...(titre ? { titre } : {}),
        ...(album ? { album } : {}),
        ...(typeof o.annee === 'number' ? { annee: o.annee } : {}),
        ...(typeof o.pourquoi === 'string' ? { pourquoi: o.pourquoi.slice(0, 200) } : {}),
      })
    }
    return { candidats, casse: candidats.length === 0 }
  } catch {
    return { candidats: [], casse: true }
  }
}

/** Appelle /api/chat et diffuse la prose au fur et à mesure. */
export async function fouiller(
  demande: DemandeFouille,
  auFilDeLEau: (prose: string) => void,
  signal?: AbortSignal,
): Promise<Fouille> {
  const reponse = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(demande),
    ...(signal ? { signal } : {}),
  })

  if (reponse.status === 429) {
    throw new ErreurLisible('Trop de fouilles sur cette heure. Reviens dans un moment.')
  }
  if (!reponse.ok || !reponse.body) {
    const detail = await reponse.json().catch(() => null)
    const message =
      detail && typeof detail === 'object' && 'erreur' in detail
        ? String((detail as { erreur: unknown }).erreur)
        : 'La fouille n’a pas abouti.'
    throw new ErreurLisible(message)
  }

  const lecteur = reponse.body.getReader()
  const decodeur = new TextDecoder()
  let accumule = ''
  let derniereProse = ''

  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    accumule += decodeur.decode(value, { stream: true })
    const prose = proseVisible(accumule)
    if (prose !== derniereProse) {
      derniereProse = prose
      auFilDeLEau(prose)
    }
  }
  accumule += decodeur.decode()

  const { candidats, casse } = extraireCandidats(accumule)
  return { prose: proseVisible(accumule), candidats, jsonCasse: casse }
}

/** Fiche détaillée à la demande, générée par Haiku. */
export async function demanderFiche(trouvaille: Trouvaille): Promise<string> {
  const reponse = await fetch('/api/fiche', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artiste: trouvaille.piste.artists.map((a) => a.name).join(', '),
      titre: trouvaille.piste.name,
      album: trouvaille.piste.album?.name ?? '',
      annee: trouvaille.piste.album?.release_date?.slice(0, 4) ?? '',
    }),
  })
  if (!reponse.ok) throw new ErreurLisible('La fiche n’est pas revenue.')
  const donnees = (await reponse.json()) as { fiche?: string }
  return donnees.fiche ?? ''
}

/** Réécriture du profil appris, à la fin d'un échange. */
export async function reecrireProfil(
  profil: string,
  reactions: string[],
  angle: string,
): Promise<string> {
  const reponse = await fetch('/api/profil', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profil, reactions, angle }),
  })
  if (!reponse.ok) return profil
  const donnees = (await reponse.json()) as { profil?: string }
  return donnees.profil ?? profil
}
