#!/usr/bin/env node
/**
 * Preuve du garde-fou anti-hallucination.
 *
 * Cinq titres réels, trois titres volontairement inventés. Le script appelle
 * la VRAIE fonction resoudreCandidats de l'application, pas une copie : la
 * recherche Spotify est simplement injectée.
 *
 * Deux modes :
 *   - hors ligne (par défaut) : rejoue des réponses relevées sur l'API Spotify
 *   - en direct : node scripts/test-resolution.mts --direct
 *     nécessite SPOTIFY_CLIENT_ID et SPOTIFY_CLIENT_SECRET. La recherche passe
 *     par le flux « client credentials », qui n'exige aucun scope utilisateur.
 *
 * Usage : node scripts/test-resolution.mts [--direct]
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resoudreCandidats, type Rechercher } from '../src/lib/spotify/resolution.ts'
import { cleBibliotheque } from '../src/lib/texte.ts'
import type { Candidat, Piste } from '../src/types.ts'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const direct = process.argv.includes('--direct')

/* ------------------------------------------------------------------ */
/* Le jeu d'essai                                                      */
/* ------------------------------------------------------------------ */

interface Cas {
  candidat: Candidat
  attendu: 'resolu' | 'elimine'
  pourquoi: string
}

const CAS: Cas[] = [
  {
    candidat: { artiste: 'Vitalic', titre: 'Poney Part 1', annee: 2005 },
    attendu: 'resolu',
    pourquoi: 'Titre exact. « Poney Part 2 » est dans les résultats : ne pas le prendre.',
  },
  {
    candidat: { artiste: 'Supreme NTM', titre: 'Laisse pas trainer ton fils', annee: 1998 },
    attendu: 'resolu',
    pourquoi: 'Accents absents des deux côtés. La recherche par champs échoue, la requête libre rattrape.',
  },
  {
    candidat: { artiste: 'Jean-Baptiste Lully', titre: 'Marche pour la cérémonie des Turcs' },
    attendu: 'resolu',
    pourquoi: 'Spotify le publie sous quatre graphies dont une préfixée du nom de l’œuvre.',
  },
  {
    candidat: { artiste: 'Gerry Rafferty', titre: 'Baker Street', annee: 1978 },
    attendu: 'resolu',
    pourquoi: 'Présent dans la bibliothèque : doit être écarté en Terra incognita.',
  },
  {
    candidat: { artiste: 'Peter Fox', titre: 'Haus am See', annee: 2008 },
    attendu: 'resolu',
    pourquoi: 'Présent dans la bibliothèque : doit être écarté en Terra incognita.',
  },
  {
    candidat: { artiste: 'Booba', titre: 'Le Cri du Zinc', annee: 2006 },
    attendu: 'elimine',
    pourquoi: 'INVENTÉ. Spotify renvoie d’autres morceaux de Booba, pas une liste vide.',
  },
  {
    candidat: { artiste: 'Vitalic', titre: 'Nébuleuse Ferroviaire', annee: 2009 },
    attendu: 'elimine',
    pourquoi: 'INVENTÉ. L’artiste existe, le morceau non.',
  },
  {
    candidat: { artiste: 'Jean-Baptiste Lully', titre: 'Sarabande pour les Machines Volantes' },
    attendu: 'elimine',
    pourquoi: 'INVENTÉ. Titre crédible pour du baroque de cour, mais fictif.',
  },
]

/** Les deux titres du jeu d'essai réellement présents dans la bibliothèque. */
const DANS_LA_BIBLIOTHEQUE = [
  { id: '5gOd6zDC8vhlYjqbQdJVWP', artiste: 'Gerry Rafferty', titre: 'Baker Street' },
  { id: '4qcctSwC6l8BLc8n8e72X7', artiste: 'Peter Fox', titre: 'Haus am See' },
]

/* ------------------------------------------------------------------ */
/* Les deux sources de recherche                                       */
/* ------------------------------------------------------------------ */

let appels = 0

function rechercheHorsLigne(): Rechercher {
  const chemin = resolve(RACINE, 'scripts/fixtures/recherches.json')
  const fixtures = JSON.parse(readFileSync(chemin, 'utf8')) as Record<string, Piste[]>
  return async (requete) => {
    appels++
    const trouve = fixtures[requete]
    if (trouve === undefined && !requete.startsWith('_')) {
      console.warn(`  (aucune réponse enregistrée pour : ${requete})`)
    }
    return Array.isArray(trouve) ? trouve : []
  }
}

async function rechercheEnDirect(): Promise<Rechercher> {
  const id = process.env.SPOTIFY_CLIENT_ID
  const secret = process.env.SPOTIFY_CLIENT_SECRET
  if (!id || !secret) {
    console.error('\nMode direct : SPOTIFY_CLIENT_ID et SPOTIFY_CLIENT_SECRET sont requis.\n')
    process.exit(1)
  }

  const reponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  })
  if (!reponse.ok) {
    console.error(`\nSpotify a refusé les identifiants (${reponse.status}).\n`)
    process.exit(1)
  }
  const { access_token } = (await reponse.json()) as { access_token: string }

  return async (requete, limite) => {
    appels++
    // limit plafonné à 10 : le maximum de /search depuis 2026.
    const params = new URLSearchParams({
      q: requete,
      type: 'track',
      limit: String(Math.min(limite, 10)),
    })
    const r = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    if (!r.ok) return []
    const donnees = (await r.json()) as { tracks?: { items: Piste[] } }
    return donnees.tracks?.items ?? []
  }
}

/* ------------------------------------------------------------------ */
/* Exécution                                                           */
/* ------------------------------------------------------------------ */

const rechercher = direct ? await rechercheEnDirect() : rechercheHorsLigne()

const index = {
  ids: new Set(DANS_LA_BIBLIOTHEQUE.map((t) => t.id)),
  cles: new Set(DANS_LA_BIBLIOTHEQUE.map((t) => cleBibliotheque(t.artiste, t.titre))),
}

const base = {
  angle: 'test',
  index,
  urisBannies: new Set<string>(),
  artistesBloques: new Set<string>(),
  rechercher,
}

console.log('')
console.log(`  GARDE-FOU ANTI-HALLUCINATION — mode ${direct ? 'DIRECT (API Spotify)' : 'hors ligne (réponses enregistrées)'}`)
console.log('  ' + '-'.repeat(74))

// Passe 1 : terrain connu, rien n'est filtré par la bibliothèque.
const connu = await resoudreCandidats(
  CAS.map((c) => c.candidat),
  { ...base, terrain: 'connu' },
)

const resolus = new Map(connu.trouvailles.map((t) => [`${t.candidat.artiste}|${t.candidat.titre}`, t]))
let echecs = 0

for (const cas of CAS) {
  const cle = `${cas.candidat.artiste}|${cas.candidat.titre}`
  const t = resolus.get(cle)
  const obtenu = t ? 'resolu' : 'elimine'
  const ok = obtenu === cas.attendu
  if (!ok) echecs++

  const marque = ok ? '  OK  ' : ' RATÉ '
  const etiquette = `${cas.candidat.artiste} — ${cas.candidat.titre}`
  console.log(`\n [${marque}] ${etiquette}`)
  console.log(`          attendu : ${cas.attendu.padEnd(8)} obtenu : ${obtenu}`)
  if (t) {
    console.log(`          → ${t.piste.artists.map((a) => a.name).join(', ')} — ${t.piste.name}`)
    console.log(`          → ${t.piste.uri}`)
  } else {
    console.log(`          → aucun résultat ne correspond, éliminé en silence`)
  }
  console.log(`          ${cas.pourquoi}`)
}

// Passe 2 : Terra incognita, la bibliothèque filtre en plus.
const incognita = await resoudreCandidats(
  CAS.map((c) => c.candidat),
  { ...base, terrain: 'incognita' },
)

console.log('')
console.log('  ' + '-'.repeat(74))
console.log('  BILAN')
console.log('  ' + '-'.repeat(74))
console.log(`  Candidats soumis                    ${CAS.length}  (5 réels, 3 inventés)`)
console.log(`  Requêtes Spotify émises             ${appels}`)
console.log(`  Terrain connu, résolus              ${connu.trouvailles.length} / 5 attendus`)
console.log(`  Terrain connu, éliminés             ${connu.echecs.length} / 3 attendus`)
console.log(`  Terra incognita, résolus            ${incognita.trouvailles.length} / 3 attendus`)
console.log(`  Terra incognita, filtrés en plus    ${incognita.filtres} / 2 attendus (déjà dans la bibliothèque)`)

const bilanOk =
  echecs === 0 &&
  connu.trouvailles.length === 5 &&
  connu.echecs.length === 3 &&
  incognita.trouvailles.length === 3 &&
  incognita.filtres === 2

console.log('')
console.log(
  bilanOk
    ? '  RÉSULTAT : les 5 vrais titres sont résolus, les 3 inventés sont éliminés,\n             et Terra incognita écarte en plus les 2 titres déjà possédés.\n'
    : `  RÉSULTAT : ÉCHEC, ${echecs} cas ne se comportent pas comme attendu.\n`,
)

process.exit(bilanOk ? 0 : 1)
