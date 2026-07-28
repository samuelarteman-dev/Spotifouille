/**
 * Normalisation de texte. Sert au garde-fou anti-hallucination et à
 * l'exclusion Terra incognita, donc la moindre approximation ici laisse
 * passer un titre inventé ou rejette un vrai titre.
 *
 * Les règles doivent rester identiques à celles de scripts/build-profile.mjs,
 * sinon les clés du fichier bibliotheque.json ne correspondront à rien.
 */

/** Ramène tirets et apostrophes Unicode vers leurs équivalents ASCII. */
export function normaliserAffichage(s: string): string {
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

/** Clé de comparaison : sans accents, sans ponctuation, en minuscules. */
export function cleComparaison(s: string): string {
  return normaliserAffichage(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Clé de titre « nue » : retire les suffixes de version.
 * « Baker Street - Remastered 2011 » et « Baker Street » doivent tomber sur
 * la même clé, sinon Terra incognita laisse passer un titre déjà possédé.
 */
export function cleTitreNue(titre: string): string {
  let t = normaliserAffichage(titre)
  t = t.replace(/\s+-\s+.*$/, '')
  t = t.replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ')
  return cleComparaison(t) || cleComparaison(titre)
}

/** Clé d'exclusion « artiste::titre », alignée sur build-profile.mjs. */
export function cleBibliotheque(artiste: string, titre: string): string {
  return `${cleComparaison(artiste)}::${cleTitreNue(titre)}`
}

/**
 * Deux chaînes désignent-elles raisonnablement la même chose ?
 *
 * Un modèle de langage se trompe souvent sur un accent, un « feat. », un
 * « The » ou une majuscule. Il n'invente en revanche pas un titre qui
 * ressemble à 90 % au vrai : la tolérance ci-dessous accepte les variantes
 * d'écriture sans laisser passer une hallucination.
 */
export function correspondanceRaisonnable(attendu: string, obtenu: string): boolean {
  const a = cleComparaison(attendu)
  const b = cleComparaison(obtenu)
  if (!a || !b) return false
  if (a === b) return true

  // L'un contient l'autre : « Africa » face à « Africa - 2015 Remaster ».
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true

  const nu = (s: string) => cleTitreNue(s)
  if (nu(attendu) && nu(attendu) === nu(obtenu)) return true

  return distanceRelative(a, b) <= 0.18
}

/** Distance de Levenshtein rapportée à la longueur de la plus longue chaîne. */
export function distanceRelative(a: string, b: string): number {
  const max = Math.max(a.length, b.length)
  if (max === 0) return 0
  return levenshtein(a, b) / max
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  let precedente = new Array<number>(b.length + 1)
  let courante = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) precedente[j] = j

  for (let i = 1; i <= a.length; i++) {
    courante[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1
      courante[j] = Math.min(
        (courante[j - 1] ?? 0) + 1,
        (precedente[j] ?? 0) + 1,
        (precedente[j - 1] ?? 0) + cout,
      )
    }
    const tampon = precedente
    precedente = courante
    courante = tampon
  }
  return precedente[b.length] ?? 0
}

/**
 * Un artiste de la réponse Spotify correspond-il au candidat ?
 * On accepte si n'importe quel artiste crédité colle : Claude cite souvent
 * l'artiste principal d'un morceau en featuring, ou l'inverse.
 */
export function artisteCorrespond(attendu: string, artistes: { name: string }[]): boolean {
  return artistes.some((a) => correspondanceRaisonnable(attendu, a.name))
}
