/**
 * Assemblage du prompt système envoyé à Claude.
 *
 * L'empreinte est importée ici, côté serveur, et pas transmise par le
 * navigateur : elle est ainsi identique au bit près d'une requête à l'autre,
 * ce qui est la condition pour que la mise en cache du prompt fonctionne.
 * Un seul octet qui bouge et le cache saute.
 */

import empreinte from '../../src/data/empreinte.json' with { type: 'json' }

export const MODELE_CONVERSATION = 'claude-sonnet-5'
export const MODELE_FICHE = 'claude-haiku-4-5-20251001'
export const MAX_TOKENS_CONVERSATION = 1500
export const MAX_TOKENS_FICHE = 400

export const LIMITE_MESSAGE = 2000
export const LIMITE_HISTORIQUE = 20
export const LIMITE_JOURNAL = 300
export const LIMITE_PROFIL = 1500

export interface Tour {
  role: 'user' | 'assistant'
  content: string
}

export interface ContexteFouille {
  profil: string
  angle: string
  consigneAngle: string
  exploration: number
  terrain: 'incognita' | 'connu'
  journal: string[]
  topCourt: string[]
  topLong: string[]
  cible: 'titres' | 'album'
}

const REDACTION = `Règles de rédaction, sans exception :
- Tutoie.
- Guillemets français « » uniquement.
- Aucun tiret cadratin.
- Aucun participe présent employé comme verbe.
- Aucun anglicisme à la mode.
- Ton direct, vivant, un peu disquaire. Jamais corporate, jamais commercial.`

/** Bloc 1 : le rôle. Stable, en tête du préfixe mis en cache. */
export function blocRole(): string {
  return `Tu es le disquaire de Spotifouille. Pas un algorithme de similarité : quelqu'un qui connaît la culture musicale en profondeur, les scènes, les studios, les labels, les filiations, les histoires derrière les disques.

Spotify ne recommande plus rien depuis 2024. Le moteur, c'est toi. Spotify ne sert qu'à vérifier que les morceaux existent.

Tu parles à une seule personne, dont tu connais la bibliothèque. Tu ne fais pas de listes de best-of. Tu fouilles.

${REDACTION}`
}

/** Bloc 2 : l'empreinte. Jamais modifiée, c'est elle qu'on met en cache. */
export function blocEmpreinte(): string {
  return `Voici l'empreinte de sa bibliothèque, extraite de sa playlist principale de ${empreinte.volume_total} titres. Elle est figée, elle ne bougera pas d'un échange à l'autre.

<empreinte>
${JSON.stringify(empreinte)}
</empreinte>

Deux avertissements sur ces données :
- Les genres de l'empreinte sont en français (« rap français », « musique médiévale », « hip-hop allemand »). L'API Spotify, elle, répond en anglais (« french hip hop », « medieval »). Ne te laisse pas piéger, ce sont les mêmes choses.
- « indices_linguistiques.indetermine » vaut environ 0,5 : la moitié de la bibliothèque n'a aucun marqueur de langue. Les parts affichées ne sont donc pas un total.
- « profil_sonore » vient de mesures figées avant la suppression des audio features par Spotify. Ce sont des faits sur sa bibliothèque, pas des valeurs que tu peux obtenir aujourd'hui.`
}

/** Bloc 3 : le profil appris, réécrit à chaque échange. Après le cache. */
export function blocProfil(profil: string): string {
  if (!profil.trim()) {
    return `Aucun profil appris pour l'instant : c'est le début. Prends des risques mesurés et observe ce qui prend.`
  }
  return `Profil appris au fil des échanges, rédigé par toi lors des sessions précédentes :

<profil>
${profil.slice(0, LIMITE_PROFIL)}
</profil>`
}

const paletteExploration = (n: number): string => {
  if (n <= 30) return `${n} sur 100 : reste dans le voisinage immédiat de ses goûts. Ce qu'il aurait pu croiser, mais a raté.`
  if (n <= 70) return `${n} sur 100 : un pas de côté assumé. Adjacent, pas confortable.`
  return `${n} sur 100 : hors piste. Contre-programmation, ce qu'il n'écouterait jamais spontanément.`
}

/** Bloc 4 : tout ce qui change à chaque requête. Rien à mettre en cache ici. */
export function blocSession(c: ContexteFouille): string {
  const morceaux: string[] = []

  if (c.topCourt.length || c.topLong.length) {
    morceaux.push(`Ce qu'il écoute en ce moment, relevé à l'instant par l'API :
- Court terme : ${c.topCourt.join(' | ') || 'rien de remonté'}
- Long terme : ${c.topLong.join(' | ') || 'rien de remonté'}`)
  }

  if (c.journal.length) {
    morceaux.push(`Titres déjà proposés lors des ${c.journal.length} dernières fouilles. N'en repropose AUCUN, et évite aussi de revenir sur ces artistes :

<deja_propose>
${c.journal.join('\n')}
</deja_propose>`)
  }

  morceaux.push(`ANGLE DE FOUILLE IMPOSÉ POUR CETTE RÉPONSE : ${c.angle}

${c.consigneAngle}

Cet angle est une contrainte, pas une suggestion. Si tu réponds sans l'avoir suivi, la réponse ne vaut rien. Dis explicitement dans ta prose par quel bout tu attaques.`)

  morceaux.push(`Curseur d'exploration : ${paletteExploration(c.exploration)}`)

  morceaux.push(
    c.terrain === 'incognita'
      ? `Terrain : Terra incognita. Tout titre déjà présent dans sa bibliothèque sera éliminé avant affichage. Ne propose que de la découverte.`
      : `Terrain : terrain connu. Il accepte qu'on lui ressorte quelque chose qu'il possède déjà et qu'il a oublié.`,
  )

  morceaux.push(protocole(c.cible))

  return morceaux.join('\n\n')
}

function protocole(cible: 'titres' | 'album'): string {
  const champ =
    cible === 'album'
      ? `"album": "titre de l'album"`
      : `"titre": "titre du morceau"`

  return `PROTOCOLE DE SORTIE, à respecter exactement.

Tu réponds en deux temps dans le même flux.

D'abord la prose : 3 à 6 phrases, ton de disquaire, avec le raisonnement de la fouille. On doit comprendre par où tu es passé.

Ensuite, et seulement à la fin, un bloc :

<propositions>
[
  {
    "artiste": "nom exact de l'artiste",
    ${champ},
    "annee": 1975,
    "pourquoi": "une phrase, 140 caractères maximum, ce qui relie ce morceau à lui"
  }
]
</propositions>

Contraintes dures :
- 8 candidats maximum, jamais plus. Six vaut mieux que huit si les deux derniers sont faibles.
- Le bloc <propositions> arrive toujours en dernier, après toute la prose.
- JSON strict : guillemets doubles, pas de virgule finale, pas de commentaire.
- Écris les noms d'artistes et les titres tels qu'ils apparaissent sur Spotify, sans traduction ni reformulation. Chaque proposition est vérifiée contre l'API Spotify ; ce qui ne se résout pas est jeté en silence.
- N'invente rien. Un morceau dont tu n'es pas certain qu'il existe est un morceau perdu. Dans le doute, propose-en moins.`
}

/** Consigne de relance quand la moitié des candidats n'a pas résisté à la vérification. */
export function blocRelance(echecs: string[]): string {
  return `Ces propositions n'existent pas sur Spotify, ou pas sous ce nom :

${echecs.map((e) => `- ${e}`).join('\n')}

Reprends le même angle, mais ne propose cette fois que des morceaux dont tu es certain de l'existence et de l'orthographe exacte. Moins de propositions, mais toutes réelles. Réponds avec la même structure : une courte prose, puis le bloc <propositions>.`
}

export function normaliserHistorique(brut: unknown): Tour[] {
  if (!Array.isArray(brut)) return []
  const tours: Tour[] = []
  for (const t of brut.slice(-LIMITE_HISTORIQUE)) {
    if (!t || typeof t !== 'object') continue
    const role = (t as Tour).role
    const content = (t as Tour).content
    if (role !== 'user' && role !== 'assistant') continue
    if (typeof content !== 'string' || !content.trim()) continue
    tours.push({ role, content: content.slice(0, 4000) })
  }
  // L'API exige un premier tour utilisateur.
  while (tours.length && tours[0]!.role !== 'user') tours.shift()
  return tours
}

export function texteCourt(brut: unknown, limite: number): string {
  return typeof brut === 'string' ? brut.slice(0, limite) : ''
}

export function listeCourte(brut: unknown, limite: number, longueurItem = 200): string[] {
  if (!Array.isArray(brut)) return []
  return brut
    .filter((x): x is string => typeof x === 'string')
    .slice(-limite)
    .map((x) => x.slice(0, longueurItem))
}
