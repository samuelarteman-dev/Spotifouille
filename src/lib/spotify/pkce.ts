/**
 * Authorization Code + PKCE. Le flux implicite est mort depuis février 2026.
 * Aucun secret client n'intervient : PKCE est conçu pour les clients publics.
 */

const CLE_VERIFIEUR = 'spotifouille:verifieur'
const CLE_ETAT = 'spotifouille:etat'

export const SCOPES = [
  'user-top-read',
  'user-read-recently-played',
  'user-library-read',
  'playlist-read-private',
  'playlist-modify-private',
].join(' ')

export function clientId(): string {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID
  if (!id) throw new Error('VITE_SPOTIFY_CLIENT_ID absent de l’environnement.')
  return id
}

export function uriRedirection(): string {
  const uri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI
  if (!uri) throw new Error('VITE_SPOTIFY_REDIRECT_URI absent de l’environnement.')
  return uri
}

function base64url(octets: Uint8Array): string {
  let binaire = ''
  for (const o of octets) binaire += String.fromCharCode(o)
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function aleatoire(longueur: number): string {
  const octets = new Uint8Array(longueur)
  crypto.getRandomValues(octets)
  return base64url(octets).slice(0, longueur)
}

async function defi(verifieur: string): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifieur))
  return base64url(new Uint8Array(empreinte))
}

/**
 * Construit l'URL d'autorisation et range le verifieur en sessionStorage,
 * le temps de l'aller-retour seulement.
 */
export async function urlAutorisation(): Promise<string> {
  const verifieur = aleatoire(96)
  const etat = aleatoire(24)
  sessionStorage.setItem(CLE_VERIFIEUR, verifieur)
  sessionStorage.setItem(CLE_ETAT, etat)

  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    redirect_uri: uriRedirection(),
    code_challenge_method: 'S256',
    code_challenge: await defi(verifieur),
    scope: SCOPES,
    state: etat,
  })
  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

export function verifieurEnAttente(): string | null {
  return sessionStorage.getItem(CLE_VERIFIEUR)
}

export function etatAttendu(): string | null {
  return sessionStorage.getItem(CLE_ETAT)
}

export function oublierVerifieur(): void {
  sessionStorage.removeItem(CLE_VERIFIEUR)
  sessionStorage.removeItem(CLE_ETAT)
}
