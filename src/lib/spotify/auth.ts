/**
 * Cycle de vie des jetons Spotify.
 *
 * POINT CRITIQUE : en PKCE, Spotify fait tourner le jeton de rafraîchissement
 * à chaque usage. Si on ne réécrit pas celui que la réponse renvoie, la
 * session meurt au bout d'une heure et ne revient jamais. Toute la logique
 * d'écriture passe donc par ecrireJetons(), qui conserve l'ancien jeton de
 * rafraîchissement seulement quand la réponse n'en fournit pas de nouveau.
 *
 * Les jetons restent dans le navigateur. Ils ne sont jamais transmis à la
 * Netlify Function.
 */

import { ErreurLisible, type Jetons } from '../../types'
import { clientId, oublierVerifieur, uriRedirection, verifieurEnAttente } from './pkce'

const CLE_JETONS = 'spotifouille:jetons'
const POINT_JETON = 'https://accounts.spotify.com/api/token'
/** On rafraîchit dès qu'il reste moins de 5 minutes. */
const MARGE_MS = 5 * 60 * 1000

interface ReponseJeton {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export function lireJetons(): Jetons | null {
  try {
    const brut = localStorage.getItem(CLE_JETONS)
    if (!brut) return null
    const j = JSON.parse(brut) as Partial<Jetons>
    if (typeof j.acces !== 'string' || typeof j.rafraichissement !== 'string') return null
    if (typeof j.expireLe !== 'number') return null
    return { acces: j.acces, rafraichissement: j.rafraichissement, expireLe: j.expireLe }
  } catch {
    return null
  }
}

function ecrireJetons(reponse: ReponseJeton, ancienRafraichissement?: string): Jetons {
  // Le nouveau jeton de rafraîchissement gagne toujours. Sans ça, mort au bout d'une heure.
  const rafraichissement = reponse.refresh_token ?? ancienRafraichissement
  if (!rafraichissement) {
    throw new ErreurLisible('Spotify n’a pas renvoyé de jeton de rafraîchissement.')
  }
  const jetons: Jetons = {
    acces: reponse.access_token,
    rafraichissement,
    expireLe: Date.now() + reponse.expires_in * 1000,
  }
  localStorage.setItem(CLE_JETONS, JSON.stringify(jetons))
  return jetons
}

export function effacerJetons(): void {
  localStorage.removeItem(CLE_JETONS)
}

export function connecte(): boolean {
  return lireJetons() !== null
}

async function poster(corps: URLSearchParams): Promise<ReponseJeton> {
  const reponse = await fetch(POINT_JETON, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: corps,
  })
  if (!reponse.ok) {
    const detail = await reponse.text().catch(() => '')
    throw new ErreurLisible(`Spotify a refusé la demande de jeton (${reponse.status}).`, detail)
  }
  return (await reponse.json()) as ReponseJeton
}

/** Échange le code de la redirection contre un couple de jetons. */
export async function echangerCode(code: string): Promise<Jetons> {
  const verifieur = verifieurEnAttente()
  if (!verifieur) {
    throw new ErreurLisible('Le vérifieur PKCE a disparu. Relance la connexion.')
  }
  const reponse = await poster(
    new URLSearchParams({
      client_id: clientId(),
      grant_type: 'authorization_code',
      code,
      redirect_uri: uriRedirection(),
      code_verifier: verifieur,
    }),
  )
  oublierVerifieur()
  return ecrireJetons(reponse)
}

/** Une seule opération de rafraîchissement à la fois, quel que soit le nombre d'appels. */
let rafraichissementEnCours: Promise<Jetons> | null = null

export async function rafraichir(): Promise<Jetons> {
  if (rafraichissementEnCours) return rafraichissementEnCours

  const actuels = lireJetons()
  if (!actuels) throw new ErreurLisible('Pas de session Spotify.')

  rafraichissementEnCours = (async () => {
    try {
      const reponse = await poster(
        new URLSearchParams({
          client_id: clientId(),
          grant_type: 'refresh_token',
          refresh_token: actuels.rafraichissement,
        }),
      )
      return ecrireJetons(reponse, actuels.rafraichissement)
    } catch (e) {
      // Un refus de rafraîchissement est définitif : la session est perdue.
      effacerJetons()
      throw e
    } finally {
      rafraichissementEnCours = null
    }
  })()

  return rafraichissementEnCours
}

/** Jeton d'accès valide, rafraîchi automatiquement s'il expire bientôt. */
export async function jetonValide(): Promise<string> {
  const jetons = lireJetons()
  if (!jetons) throw new ErreurLisible('Pas de session Spotify.')
  if (jetons.expireLe - Date.now() > MARGE_MS) return jetons.acces
  const frais = await rafraichir()
  return frais.acces
}
