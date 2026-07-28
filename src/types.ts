/** Types partagés de Spotifouille. */

/* ---------------------------------------------------------------- */
/* Empreinte (statique, produite par scripts/build-profile.mjs)       */
/* ---------------------------------------------------------------- */

export interface Empreinte {
  genere_le: string
  volume_total: number
  artistes_uniques: number
  artistes_recurrents: { nom: string; titres: number; genres: string[] }[]
  genres_dominants: { nom: string; part: number }[]
  labels_recurrents: { nom: string; titres: number }[]
  repartition_decennies: Record<string, number>
  indices_linguistiques: Record<string, string | number>
  rythme_ajouts: Record<string, number>
  titres_signature: string[]
  titres_de_marge: string[]
  profil_sonore?: Record<string, unknown>
}

/** Index local du mode Terra incognita. Ne part jamais vers l'API Anthropic. */
export interface Bibliotheque {
  genere_le: string
  volume: number
  ids: string[]
  cles: string[]
}

/* ---------------------------------------------------------------- */
/* Spotify                                                            */
/* ---------------------------------------------------------------- */

export interface Jetons {
  acces: string
  rafraichissement: string
  expireLe: number
}

export interface Image {
  url: string
  width: number | null
  height: number | null
}

/** Objet Track réduit à ce que l'API renvoie encore en 2026. */
export interface Piste {
  id: string
  uri: string
  name: string
  artists: { id: string; name: string }[]
  album: { id: string; name: string; images: Image[]; release_date?: string }
  duration_ms: number
  explicit: boolean
  external_urls: { spotify: string }
}

export interface Profil {
  id: string
  display_name: string | null
  images?: Image[]
}

/* ---------------------------------------------------------------- */
/* Moteur de recommandation                                           */
/* ---------------------------------------------------------------- */

/** Ce que Claude propose, avant toute vérification. */
export interface Candidat {
  artiste: string
  titre?: string
  album?: string
  annee?: number
  pourquoi?: string
}

/** Un candidat résolu par la recherche Spotify. Seul type qui atteint l'écran. */
export interface Trouvaille {
  candidat: Candidat
  piste: Piste
  /** Ce que la carte met en avant : le morceau, ou l'album qui le contient. */
  cible: 'titre' | 'album'
  angle: string
  proposeLe: string
}

export type Verdict = 'adore' | 'connais' | 'refus' | 'creuser'

export interface EntreeJournal {
  uri: string
  artiste: string
  titre: string
  date: string
  angle: string
  verdict: Verdict | null
}

export type Terrain = 'incognita' | 'connu'

export interface Reglages {
  terrain: Terrain
  exploration: number
}

export interface Message {
  role: 'moi' | 'agent'
  texte: string
  angle?: string
  /** Identifiants des trouvailles rattachées à ce tour, pour l'historique. */
  uris?: string[]
}

/** Erreur applicative avec un libellé déjà rédigé pour l'écran. */
export class ErreurLisible extends Error {
  readonly detail: unknown
  /** Vrai quand le serveur a rejeté l'octroi lui-même (400/401), et pas quand
   *  il s'agit d'une panne réseau ou d'un 5xx passager. */
  octroiInvalide = false

  constructor(message: string, detail?: unknown) {
    super(message)
    this.name = 'ErreurLisible'
    this.detail = detail
  }
}
