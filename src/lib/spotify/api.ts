/**
 * Client de l'API Spotify, version 2026.
 *
 * Rappel des suppressions, parce que l'entraînement des modèles est périmé :
 * /recommendations, /audio-features, /audio-analysis, /related-artists,
 * /browse/*, /artists/{id}/top-tracks, /markets et tous les points multi-objets
 * renvoient 403 ou 404. Rien ici ne les appelle.
 */

import { ErreurLisible, type Piste, type Profil } from '../../types'
import { effacerJetons, jetonValide, rafraichir } from './auth'

const BASE = 'https://api.spotify.com/v1'
/** Le maximum de /search est 10 depuis 2026. Toute pagination en 50 échoue. */
export const LIMITE_RECHERCHE = 10
const CONCURRENCE_MAX = 3

/* ---------------------------------------------------------------- */
/* Limiteur de concurrence                                           */
/* ---------------------------------------------------------------- */

let enVol = 0
const fileAttente: (() => void)[] = []

async function creneau<T>(travail: () => Promise<T>): Promise<T> {
  if (enVol >= CONCURRENCE_MAX) {
    await new Promise<void>((resoudre) => fileAttente.push(resoudre))
  }
  enVol++
  try {
    return await travail()
  } finally {
    enVol--
    fileAttente.shift()?.()
  }
}

const patienter = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ---------------------------------------------------------------- */
/* Appel générique                                                   */
/* ---------------------------------------------------------------- */

interface Options {
  methode?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  corps?: unknown
  /** Interne : empêche la boucle de rafraîchissement sur 401. */
  dejaRafraichi?: boolean
}

export async function appel<T>(chemin: string, options: Options = {}): Promise<T> {
  const { methode = 'GET', corps, dejaRafraichi = false } = options

  return creneau(async () => {
    const jeton = await jetonValide()
    const reponse = await fetch(`${BASE}${chemin}`, {
      method: methode,
      headers: {
        Authorization: `Bearer ${jeton}`,
        ...(corps !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}),
    })

    if (reponse.status === 429) {
      // On respecte Retry-After à la seconde près, plafonné pour ne pas geler l'écran.
      const attente = Math.min(Number(reponse.headers.get('Retry-After') ?? '2') || 2, 30)
      await patienter(attente * 1000)
      return appel<T>(chemin, options)
    }

    if (reponse.status === 401) {
      if (dejaRafraichi) {
        effacerJetons()
        throw new ErreurLisible('Session Spotify expirée. Reconnecte-toi.')
      }
      await rafraichir()
      return appel<T>(chemin, { ...options, dejaRafraichi: true })
    }

    if (reponse.status === 204) return undefined as T

    if (!reponse.ok) {
      const detail = await reponse.text().catch(() => '')
      throw new ErreurLisible(`Spotify a répondu ${reponse.status} sur ${chemin}.`, detail)
    }

    const texte = await reponse.text()
    return (texte ? JSON.parse(texte) : undefined) as T
  })
}

/* ---------------------------------------------------------------- */
/* Points encore disponibles                                         */
/* ---------------------------------------------------------------- */

export function moi(): Promise<Profil> {
  return appel<Profil>('/me')
}

interface ReponseRecherche {
  tracks?: { items: Piste[] }
}

/** Recherche de pistes. limit plafonné à 10, ce n'est pas négociable. */
export async function rechercherPistes(requete: string, limite = 5): Promise<Piste[]> {
  const params = new URLSearchParams({
    q: requete,
    type: 'track',
    limit: String(Math.min(limite, LIMITE_RECHERCHE)),
  })
  const r = await appel<ReponseRecherche>(`/search?${params.toString()}`)
  return r.tracks?.items ?? []
}

export type Periode = 'short_term' | 'medium_term' | 'long_term'

interface Page<T> {
  items: T[]
}

export async function mesTopArtistes(periode: Periode, limite = 20): Promise<{ name: string }[]> {
  const params = new URLSearchParams({ time_range: periode, limit: String(limite) })
  const r = await appel<Page<{ name: string }>>(`/me/top/artists?${params.toString()}`)
  return r.items ?? []
}

export async function mesTopPistes(periode: Periode, limite = 20): Promise<Piste[]> {
  const params = new URLSearchParams({ time_range: periode, limit: String(limite) })
  const r = await appel<Page<Piste>>(`/me/top/tracks?${params.toString()}`)
  return r.items ?? []
}

/* ---------------------------------------------------------------- */
/* Playlists                                                         */
/* ---------------------------------------------------------------- */

interface PlaylistCreee {
  id: string
  name: string
  external_urls: { spotify: string }
}

/**
 * Création de playlist.
 * POST /users/{id}/playlists est mort depuis février 2026, c'est POST /me/playlists.
 * Et l'ajout passe par /items, plus par /tracks.
 */
export async function creerPlaylist(
  nom: string,
  description: string,
  uris: string[],
): Promise<PlaylistCreee> {
  const playlist = await appel<PlaylistCreee>('/me/playlists', {
    methode: 'POST',
    corps: { name: nom, description, public: false },
  })

  // Par lots de 100, la limite d'un POST d'items.
  for (let i = 0; i < uris.length; i += 100) {
    await appel(`/playlists/${playlist.id}/items`, {
      methode: 'POST',
      corps: { uris: uris.slice(i, i + 100) },
    })
  }
  return playlist
}

/* ---------------------------------------------------------------- */
/* Utilitaires d'affichage                                           */
/* ---------------------------------------------------------------- */

/** Plus grande pochette disponible. Jamais recadrée, jamais recouverte. */
export function pochette(piste: Piste): Image | undefined {
  const images = piste.album?.images ?? []
  return [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
}

export function anneeDe(piste: Piste): number | undefined {
  const brut = piste.album?.release_date
  if (!brut) return undefined
  const an = Number.parseInt(brut.slice(0, 4), 10)
  return Number.isFinite(an) ? an : undefined
}

export function artistesDe(piste: Piste): string {
  return (piste.artists ?? []).map((a) => a.name).join(', ')
}

type Image = { url: string; width: number | null; height: number | null }
