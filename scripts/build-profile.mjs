#!/usr/bin/env node
/**
 * Spotifouille — construction de l'empreinte musicale.
 *
 * Lit data/playlist.csv (export Exportify enrichi) et produit :
 *   - src/data/empreinte.json      profil condensé, envoyé à Claude à chaque appel, cible < 25 Ko
 *   - public/data/bibliotheque.json  index complet des titres possédés, jamais envoyé à l'API,
 *                                    sert au mode Terra incognita côté navigateur
 *
 * Le script est déterministe : aucun tirage aléatoire, aucune dépendance à l'horloge
 * hors du champ genere_le. Deux exécutions sur le même CSV donnent le même octet.
 *
 * Usage : node scripts/build-profile.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CSV = resolve(RACINE, 'data/playlist.csv')
const SORTIE_EMPREINTE = resolve(RACINE, 'src/data/empreinte.json')
const SORTIE_BIBLIOTHEQUE = resolve(RACINE, 'public/data/bibliotheque.json')

const NB_ARTISTES = 80
const NB_GENRES = 40
const NB_LABELS = 30
const NB_SIGNATURE = 60
const NB_MARGE = 30
const CIBLE_OCTETS = 25 * 1024

/* ------------------------------------------------------------------ */
/* Lecture CSV                                                         */
/* ------------------------------------------------------------------ */

/** Parseur RFC 4180 : gère les guillemets doublés et les retours à la ligne encadrés. */
function parseCSV(texte) {
  const lignes = []
  let ligne = []
  let champ = ''
  let dansGuillemets = false

  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (dansGuillemets) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"'
          i++
        } else {
          dansGuillemets = false
        }
      } else {
        champ += c
      }
    } else if (c === '"') {
      dansGuillemets = true
    } else if (c === ',') {
      ligne.push(champ)
      champ = ''
    } else if (c === '\r') {
      // ignoré, le \n suivant termine la ligne
    } else if (c === '\n') {
      ligne.push(champ)
      lignes.push(ligne)
      ligne = []
      champ = ''
    } else {
      champ += c
    }
  }
  if (champ.length || ligne.length) {
    ligne.push(champ)
    lignes.push(ligne)
  }
  return lignes
}

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

/**
 * Ramène les tirets et apostrophes Unicode vers leurs équivalents ASCII.
 * Sans ça le même artiste compte deux fois selon la façon dont Spotify a
 * encodé son nom au moment de l'ajout.
 */
function normaliserAffichage(s) {
  return s
    .normalize('NFC')
    .replace(/[‘’ʼ‛`´]/g, "'")
    .replace(/[‐‑‒–—―−⁃]/g, '-')
    .replace(/[“”„«»]/g, '"')
    .replace(/…/g, '...')
    .replace(/\u00A0|\u202F|\u2007|\u200B|\u200C|\u200D|\uFEFF/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clé de regroupement : sans accents, sans ponctuation, en minuscules. */
function cleComparaison(s) {
  return normaliserAffichage(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Clé de titre « nue » : retire les suffixes de version qui font qu'un même
 * morceau existe sous quinze URI différentes. « Baker Street - Remastered 2011 »
 * et « Baker Street » doivent tomber sur la même clé, sinon Terra incognita
 * laisse passer des titres déjà présents dans la bibliothèque.
 */
function cleTitreNue(titre) {
  let t = normaliserAffichage(titre)
  t = t.replace(/\s+-\s+.*$/, '')
  t = t.replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ')
  const nue = cleComparaison(t)
  return nue || cleComparaison(titre)
}

/* ------------------------------------------------------------------ */
/* Outils statistiques                                                 */
/* ------------------------------------------------------------------ */

const compter = (iterable) => {
  const m = new Map()
  for (const v of iterable) m.set(v, (m.get(v) || 0) + 1)
  return m
}

/** Tri décroissant par valeur, puis alphabétique : garantit un ordre stable. */
const parFrequence = (map) =>
  [...map.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

const arrondir = (n, d = 3) => Number(n.toFixed(d))

function quantile(triees, q) {
  if (!triees.length) return null
  const pos = (triees.length - 1) * q
  const bas = Math.floor(pos)
  const haut = Math.ceil(pos)
  if (bas === haut) return triees[bas]
  return triees[bas] + (triees[haut] - triees[bas]) * (pos - bas)
}

function resumeNumerique(valeurs, decimales = 2) {
  const t = valeurs.filter(Number.isFinite).sort((a, b) => a - b)
  if (!t.length) return null
  return {
    q1: arrondir(quantile(t, 0.25), decimales),
    median: arrondir(quantile(t, 0.5), decimales),
    q3: arrondir(quantile(t, 0.75), decimales),
  }
}

/* ------------------------------------------------------------------ */
/* Marqueurs linguistiques, déduits des seules chaînes de genres        */
/* ------------------------------------------------------------------ */

const MARQUEURS_LANGUE = {
  fr: /fran[çc]ais|fran[çc]aise|^chanson$|variét[ée]|qu[ée]b[ée]cois|coup[ée] d[ée]cal[ée]|auteurs-compositeurs/i,
  de: /allemand|allemande|deutsch|neue deutsche/i,
  nl: /n[ée]erlandais|n[ée]erlandaise|dutch|schlager/i,
  ar: /arabe|ra[iï]|maghreb|arabesk/i,
  es: /espagnol|latino|latin|reggaeton|flamenco|urbano|en espa[ñn]ol/i,
  it: /italien|italienne|italo/i,
  uk: /\buk\b|british|grime/i,
}

/* ------------------------------------------------------------------ */
/* Échantillonnage stratifié                                           */
/* ------------------------------------------------------------------ */

/**
 * Réordonne une liste de titres pour alterner les décennies au lieu de les
 * prendre dans l'ordre du fichier. Tri interne stable pour rester déterministe.
 */
function alternerDecennies(titres, poidsArtiste) {
  const parDecennie = new Map()
  for (const t of titres) {
    const d = t.decennie ?? 0
    if (!parDecennie.has(d)) parDecennie.set(d, [])
    parDecennie.get(d).push(t)
  }
  const decennies = [...parDecennie.keys()].sort((a, b) => a - b)
  for (const d of decennies) {
    parDecennie.get(d).sort(
      (a, b) =>
        (poidsArtiste.get(b.cleArtiste) || 0) - (poidsArtiste.get(a.cleArtiste) || 0) ||
        (a.uri < b.uri ? -1 : 1),
    )
  }
  const sortie = []
  let reste = true
  while (reste) {
    reste = false
    for (const d of decennies) {
      const file = parDecennie.get(d)
      if (file.length) {
        sortie.push(file.shift())
        reste = true
      }
    }
  }
  return sortie
}

/**
 * Répartit `total` places entre des poids, à la plus forte moyenne, avec
 * plancher et plafond. Sert à donner au rap français le poids qu'il a vraiment
 * sans pour autant lui laisser dévorer les soixante places.
 */
function repartirPlaces(poids, total, plancher, plafond) {
  const cles = [...poids.keys()]
  const somme = cles.reduce((s, k) => s + poids.get(k), 0) || 1
  const places = new Map(
    cles.map((k) => [k, Math.min(plafond, Math.max(plancher, Math.round((total * poids.get(k)) / somme)))]),
  )
  const compte = () => cles.reduce((s, k) => s + places.get(k), 0)

  // ordre de correction : les plus gros poids d'abord, départage alphabétique
  const ordre = [...cles].sort((a, b) => poids.get(b) - poids.get(a) || (a < b ? -1 : 1))
  let garde = 0
  while (compte() > total && garde++ < 10000) {
    const cible = [...ordre].reverse().find((k) => places.get(k) > plancher)
    if (!cible) break
    places.set(cible, places.get(cible) - 1)
  }
  garde = 0
  while (compte() < total && garde++ < 10000) {
    const cible = ordre.find((k) => places.get(k) < plafond)
    if (!cible) break
    places.set(cible, places.get(cible) + 1)
  }
  return places
}

/**
 * Tire `n` titres dans des seaux de genre.
 *
 * `quotas` fixe d'abord un nombre de places par genre dominant, pour que la
 * liste reflète le poids réel de chaque famille. Les places restantes partent
 * en tourniquet sur la queue de distribution, ce qui fait entrer les genres
 * rares et étale les décennies. Contrainte d'artiste unique en première passe,
 * relâchée seulement si le compte n'est pas atteint.
 */
function echantillonnerParSeaux(seaux, ordreSeaux, n, options = {}) {
  const { quotas = new Map(), exclure = new Set() } = options
  const files = new Map(
    ordreSeaux.map((k) => [k, seaux.get(k).filter((t) => !exclure.has(t.uri))]),
  )
  const choisis = []
  const artistesPris = new Set()
  const urisPris = new Set(exclure)

  const prendre = (cle, artisteUnique) => {
    const file = files.get(cle)
    while (file && file.length) {
      const t = file.shift()
      if (urisPris.has(t.uri)) continue
      if (artisteUnique && artistesPris.has(t.cleArtiste)) continue
      choisis.push(t)
      artistesPris.add(t.cleArtiste)
      urisPris.add(t.uri)
      return true
    }
    return false
  }

  // 1. les quotas des genres dominants
  for (const [cle, places] of quotas) {
    for (let i = 0; i < places && choisis.length < n; i++) {
      if (!prendre(cle, true)) break
    }
  }

  // 2. tourniquet sur tout le reste, puis relâchement de l'artiste unique
  for (const artisteUnique of [true, false]) {
    let progression = true
    while (choisis.length < n && progression) {
      progression = false
      for (const cle of ordreSeaux) {
        if (choisis.length >= n) break
        if (prendre(cle, artisteUnique)) progression = true
      }
    }
    if (choisis.length >= n) break
    // on rouvre les seaux vidés pour la passe suivante
    for (const cle of ordreSeaux) {
      files.set(cle, seaux.get(cle).filter((t) => !urisPris.has(t.uri)))
    }
  }
  return choisis
}

/* ------------------------------------------------------------------ */
/* Programme                                                           */
/* ------------------------------------------------------------------ */

if (!existsSync(CSV)) {
  console.error(`\nFichier introuvable : ${CSV}`)
  console.error('Dépose ton export Exportify dans data/playlist.csv puis relance.\n')
  process.exit(1)
}

let brut = readFileSync(CSV, 'utf8')
if (brut.charCodeAt(0) === 0xfeff) brut = brut.slice(1)

const lignes = parseCSV(brut)
const entete = lignes[0].map((h) => h.trim())
const corps = lignes.slice(1).filter((l) => l.length > 1 && l.some((c) => c.trim() !== ''))

const index = Object.fromEntries(entete.map((h, i) => [h, i]))
const champ = (l, nom) => (index[nom] === undefined ? '' : (l[index[nom]] ?? '').trim())

const COLONNE_GENRES = index['Artist Genres'] !== undefined ? 'Artist Genres' : 'Genres'
if (index[COLONNE_GENRES] === undefined) {
  console.error('\nAucune colonne de genres dans le CSV.')
  console.error('Refais l\'export Exportify avec l\'option « Include artists data » activée.\n')
  process.exit(1)
}

const NUMERIQUES = {
  energie: 'Energy',
  danse: 'Danceability',
  valence: 'Valence',
  tempo: 'Tempo',
  acoustique: 'Acousticness',
  instrumental: 'Instrumentalness',
  parole: 'Speechiness',
}
const audioDisponible = Object.values(NUMERIQUES).every((c) => index[c] !== undefined)

/* --- Normalisation ligne par ligne --- */

const titres = []
const urisVus = new Set()
let doublons = 0

for (const l of corps) {
  const uri = champ(l, 'Track URI')
  if (!/^spotify:track:[A-Za-z0-9]{22}$/.test(uri)) continue
  if (urisVus.has(uri)) {
    doublons++
    continue
  }
  urisVus.add(uri)

  const artistes = champ(l, 'Artist Name(s)')
    .split(';')
    .map((a) => normaliserAffichage(a))
    .filter(Boolean)
  if (!artistes.length) continue

  const nom = normaliserAffichage(champ(l, 'Track Name'))
  const genres = champ(l, COLONNE_GENRES)
    .split(',')
    .map((g) => normaliserAffichage(g).toLowerCase())
    .filter(Boolean)

  const anneeBrute = parseInt(champ(l, 'Release Date').slice(0, 4), 10)
  const annee = Number.isFinite(anneeBrute) && anneeBrute > 1900 && anneeBrute < 2100 ? anneeBrute : null

  const audio = {}
  if (audioDisponible) {
    for (const [cle, colonne] of Object.entries(NUMERIQUES)) {
      const v = parseFloat(champ(l, colonne))
      audio[cle] = Number.isFinite(v) ? v : null
    }
  }

  titres.push({
    uri,
    id: uri.slice('spotify:track:'.length),
    nom,
    artistes,
    artistePrincipal: artistes[0],
    cleArtiste: cleComparaison(artistes[0]),
    genres,
    annee,
    decennie: annee ? Math.floor(annee / 10) * 10 : null,
    ajouteEn: champ(l, 'Added At').slice(0, 4),
    label: normaliserAffichage(champ(l, 'Record Label')),
    audio,
  })
}

/* --- Artistes --- */

/** cleArtiste -> { affichages: Map<nom, n>, titres: n, genres: Map } */
const artistes = new Map()
for (const t of titres) {
  for (const a of t.artistes) {
    const cle = cleComparaison(a)
    if (!cle) continue
    if (!artistes.has(cle)) artistes.set(cle, { affichages: new Map(), titres: 0, genres: new Map() })
    const fiche = artistes.get(cle)
    fiche.affichages.set(a, (fiche.affichages.get(a) || 0) + 1)
    fiche.titres++
    for (const g of t.genres) fiche.genres.set(g, (fiche.genres.get(g) || 0) + 1)
  }
}
/** Orthographe retenue : la plus fréquente, départage alphabétique. */
const affichageArtiste = (cle) => parFrequence(artistes.get(cle).affichages)[0][0]

const poidsArtiste = new Map([...artistes].map(([cle, f]) => [cle, f.titres]))

const artistesRecurrents = [...artistes]
  .sort((a, b) => b[1].titres - a[1].titres || (a[0] < b[0] ? -1 : 1))
  .slice(0, NB_ARTISTES)
  .map(([cle, fiche]) => ({
    nom: affichageArtiste(cle),
    titres: fiche.titres,
    genres: parFrequence(fiche.genres)
      .slice(0, 3)
      .map(([g]) => g),
  }))

/* --- Genres --- */

const genresParTitre = compter(titres.flatMap((t) => [...new Set(t.genres)]))
const genresDominants = parFrequence(genresParTitre)
  .slice(0, NB_GENRES)
  .map(([nom, n]) => ({ nom, part: arrondir(n / titres.length) }))
const rangGenre = new Map(parFrequence(genresParTitre).map(([g], i) => [g, i]))

/* --- Décennies --- */

const avecAnnee = titres.filter((t) => t.decennie !== null)
const compteDecennies = compter(avecAnnee.map((t) => t.decennie))
const repartitionDecennies = Object.fromEntries(
  [...compteDecennies.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, n]) => [String(d), arrondir(n / avecAnnee.length)]),
)

/* --- Langues --- */

const indicesLinguistiques = { note: 'approximatif, deduit des genres' }
let sansMarqueur = 0
const compteurLangues = Object.fromEntries(Object.keys(MARQUEURS_LANGUE).map((k) => [k, 0]))
for (const t of titres) {
  let marque = false
  for (const [langue, motif] of Object.entries(MARQUEURS_LANGUE)) {
    if (t.genres.some((g) => motif.test(g))) {
      compteurLangues[langue]++
      marque = true
    }
  }
  if (!marque) sansMarqueur++
}
for (const [langue, n] of Object.entries(compteurLangues).sort((a, b) => b[1] - a[1])) {
  if (n > 0) indicesLinguistiques[langue] = arrondir(n / titres.length)
}
indicesLinguistiques.indetermine = arrondir(sansMarqueur / titres.length)

/* --- Rythme d'ajouts --- */

const rythmeAjouts = Object.fromEntries(
  [...compter(titres.map((t) => t.ajouteEn).filter(Boolean)).entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : 1,
  ),
)

/* --- Labels --- */

const labelsRecurrents = parFrequence(compter(titres.map((t) => t.label).filter(Boolean)))
  .slice(0, NB_LABELS)
  .map(([nom, n]) => ({ nom, titres: n }))

/* --- Profil sonore --- */

let profilSonore = null
if (audioDisponible) {
  profilSonore = { note: 'valeurs figées dans l export, l API ne les fournit plus' }
  for (const cle of Object.keys(NUMERIQUES)) {
    const r = resumeNumerique(
      titres.map((t) => t.audio[cle]),
      cle === 'tempo' ? 0 : 2,
    )
    // Un résumé plat (q1 = q3) ne dit rien et ressemble à une donnée cassée.
    if (r && r.q1 !== r.q3) profilSonore[cle] = r
  }
  const parDecennie = {}
  for (const [d, liste] of [...compteDecennies.keys()]
    .sort((a, b) => a - b)
    .map((d) => [d, avecAnnee.filter((t) => t.decennie === d)])) {
    if (liste.length < 30) continue
    parDecennie[String(d)] = {
      energie: resumeNumerique(liste.map((t) => t.audio.energie), 2).median,
      valence: resumeNumerique(liste.map((t) => t.audio.valence), 2).median,
      tempo: resumeNumerique(liste.map((t) => t.audio.tempo), 0).median,
    }
  }
  profilSonore.par_decennie = parDecennie
}

/* --- Titres signature : échantillonnés à travers genres et décennies --- */

const genrePrincipal = (t) => {
  if (!t.genres.length) return '(sans genre)'
  let meilleur = t.genres[0]
  let meilleurRang = rangGenre.get(meilleur) ?? Infinity
  for (const g of t.genres) {
    const r = rangGenre.get(g) ?? Infinity
    if (r < meilleurRang) {
      meilleurRang = r
      meilleur = g
    }
  }
  return meilleur
}

const seauxSignature = new Map()
for (const t of titres) {
  const g = genrePrincipal(t)
  if (!seauxSignature.has(g)) seauxSignature.set(g, [])
  seauxSignature.get(g).push(t)
}
const ordreSignature = [...seauxSignature.keys()].sort(
  (a, b) => seauxSignature.get(b).length - seauxSignature.get(a).length || (a < b ? -1 : 1),
)
for (const g of ordreSignature) {
  seauxSignature.set(g, alternerDecennies(seauxSignature.get(g), poidsArtiste))
}

// Deux tiers des places vont aux vingt genres dominants, au prorata de leur
// poids réel. Le tiers restant part en tourniquet sur la queue, sinon un genre
// à 21 % de la bibliothèque se retrouverait avec une seule place sur soixante.
const PLACES_DOMINANTES = Math.round(NB_SIGNATURE * (2 / 3))
const poidsDominants = new Map(
  genresDominants
    .slice(0, 20)
    .filter((g) => seauxSignature.has(g.nom))
    .map((g) => [g.nom, g.part]),
)
const quotasSignature = repartirPlaces(poidsDominants, PLACES_DOMINANTES, 1, 6)
const titresSignature = echantillonnerParSeaux(seauxSignature, ordreSignature, NB_SIGNATURE, {
  quotas: quotasSignature,
})

/* --- Titres de marge : artistes vus une seule fois, les plus atypiques --- */

const titresSolitaires = titres.filter(
  (t) => t.artistes.every((a) => (artistes.get(cleComparaison(a))?.titres ?? 0) === 1),
)

/** Plus le score est haut, plus le titre est loin des genres dominants. */
const atypicite = (t) => {
  if (!t.genres.length) return 0.5
  const rangs = t.genres.map((g) => rangGenre.get(g) ?? genresParTitre.size)
  return Math.min(...rangs) / Math.max(genresParTitre.size, 1)
}

const seauxMarge = new Map()
for (const t of titresSolitaires) {
  const g = genrePrincipal(t)
  if (!seauxMarge.has(g)) seauxMarge.set(g, [])
  seauxMarge.get(g).push(t)
}
for (const [g, liste] of seauxMarge) {
  seauxMarge.set(
    g,
    liste.sort((a, b) => atypicite(b) - atypicite(a) || (a.uri < b.uri ? -1 : 1)),
  )
}
const ordreMarge = [...seauxMarge.keys()].sort(
  (a, b) => seauxMarge.get(b).length - seauxMarge.get(a).length || (a < b ? -1 : 1),
)
// On exclut ce qui est déjà en signature : les deux listes doivent dire deux
// choses différentes, sinon la marge n'apporte rien.
const titresMarge = echantillonnerParSeaux(seauxMarge, ordreMarge, NB_MARGE, {
  exclure: new Set(titresSignature.map((t) => t.uri)),
})

const formater = (t) => `${t.artistePrincipal} — ${t.nom}`

/* --- Assemblage --- */

const empreinte = {
  genere_le: new Date().toISOString().slice(0, 10),
  volume_total: titres.length,
  artistes_uniques: artistes.size,
  artistes_recurrents: artistesRecurrents,
  genres_dominants: genresDominants,
  labels_recurrents: labelsRecurrents,
  repartition_decennies: repartitionDecennies,
  indices_linguistiques: indicesLinguistiques,
  rythme_ajouts: rythmeAjouts,
  titres_signature: titresSignature.map(formater),
  titres_de_marge: titresMarge.map(formater),
}
if (profilSonore) empreinte.profil_sonore = profilSonore

let json = JSON.stringify(empreinte, null, 2)
if (Buffer.byteLength(json) > CIBLE_OCTETS) json = JSON.stringify(empreinte)

mkdirSync(dirname(SORTIE_EMPREINTE), { recursive: true })
writeFileSync(SORTIE_EMPREINTE, json + '\n', 'utf8')

/* --- Bibliothèque : index d'exclusion, ne part jamais vers l'API --- */

const cles = new Set()
for (const t of titres) cles.add(`${cleComparaison(t.artistePrincipal)}::${cleTitreNue(t.nom)}`)

const bibliotheque = {
  genere_le: empreinte.genere_le,
  note: 'index local du mode Terra incognita, jamais envoye a l API Anthropic',
  volume: titres.length,
  ids: titres.map((t) => t.id).sort(),
  cles: [...cles].sort(),
}
mkdirSync(dirname(SORTIE_BIBLIOTHEQUE), { recursive: true })
writeFileSync(SORTIE_BIBLIOTHEQUE, JSON.stringify(bibliotheque) + '\n', 'utf8')

/* ------------------------------------------------------------------ */
/* Rapport                                                             */
/* ------------------------------------------------------------------ */

const ko = (n) => `${(n / 1024).toFixed(1)} Ko`
const octetsEmpreinte = Buffer.byteLength(json)
const octetsBibliotheque = Buffer.byteLength(JSON.stringify(bibliotheque))

console.log('')
console.log('  EMPREINTE MUSICALE')
console.log('  ' + '-'.repeat(58))
console.log(`  Titres lus                 ${titres.length}${doublons ? `  (${doublons} doublon(s) écarté(s))` : ''}`)
console.log(`  Artistes uniques           ${artistes.size}`)
console.log(`  Genres uniques             ${genresParTitre.size}`)
console.log(`  Labels uniques             ${compter(titres.map((t) => t.label).filter(Boolean)).size}`)
console.log(`  Couverture des genres      ${((titres.filter((t) => t.genres.length).length / titres.length) * 100).toFixed(1)} %`)
console.log(`  Titres signature           ${titresSignature.length} / ${NB_SIGNATURE}`)
console.log(`  Titres de marge            ${titresMarge.length} / ${NB_MARGE}  (réservoir : ${titresSolitaires.length})`)
console.log(`  Profil sonore              ${profilSonore ? 'inclus' : 'absent du CSV'}`)
console.log('')
console.log(`  src/data/empreinte.json       ${ko(octetsEmpreinte)}  ${octetsEmpreinte <= CIBLE_OCTETS ? 'sous la cible de 25 Ko' : 'AU DESSUS DE LA CIBLE'}`)
console.log(`  public/data/bibliotheque.json ${ko(octetsBibliotheque)}  ${bibliotheque.ids.length} identifiants, ${bibliotheque.cles.length} clés`)
console.log('')
console.log('  10 PREMIERS ARTISTES RÉCURRENTS')
console.log('  ' + '-'.repeat(58))
artistesRecurrents.slice(0, 10).forEach((a, i) => {
  const g = a.genres.length ? a.genres.join(', ') : 'sans genre'
  console.log(`  ${String(i + 1).padStart(2)}. ${a.nom.padEnd(24)} ${String(a.titres).padStart(3)} titres   ${g}`)
})
console.log('')
