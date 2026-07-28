import { useCallback, useEffect, useRef, useState } from 'react'
import type { EntreeJournal, Message, Reglages as TypeReglages, Trouvaille, Verdict } from './types'
import { tirerAngle, type Angle } from './lib/angles'
import { fouiller, reecrireProfil } from './lib/chat'
import { connecte, effacerJetons } from './lib/spotify/auth'
import { mesTopArtistes, mesTopPistes } from './lib/spotify/api'
import { resoudreCandidats } from './lib/spotify/resolution'
import { chargerBibliotheque } from './lib/memoire/bibliotheque'
import {
  artistesBloques,
  consigner,
  listeAntiRepetition,
  lireJournal,
  noterVerdict,
  urisBannies,
  viderJournal,
} from './lib/memoire/journal'
import { ecrireProfil, lireProfil } from './lib/memoire/profil'
import { ecrire, effacer, lire } from './lib/memoire/stockage'
import { Connexion } from './composants/Connexion'
import { Conversation } from './composants/Conversation'
import { Platine } from './composants/Platine'
import { Reglages } from './composants/Reglages'
import { Saisie } from './composants/Saisie'

const CLE_CONVERSATION = 'spotifouille:conversation'
const CLE_REGLAGES = 'spotifouille:reglages'
const REGLAGES_DEFAUT: TypeReglages = { terrain: 'incognita', exploration: 45 }
/** Jamais plus de 20 éléments dans un même ensemble de contenu. */
const PLAFOND_PANIER = 20

const LIBELLES: Record<Verdict, string> = {
  adore: 'adoré',
  connais: 'déjà connu',
  refus: 'pas pour lui',
  creuser: 'à creuser',
}

export function App() {
  const [session, setSession] = useState(() => connecte())
  const [messages, setMessages] = useState<Message[]>(() => lire<Message[]>(CLE_CONVERSATION, []))
  const [reglages, setReglages] = useState<TypeReglages>(() =>
    lire<TypeReglages>(CLE_REGLAGES, REGLAGES_DEFAUT),
  )
  const [profil, setProfil] = useState(() => lireProfil())
  const [journal, setJournal] = useState<EntreeJournal[]>(() => lireJournal())
  const [trouvailles, setTrouvailles] = useState<Trouvaille[]>([])
  const [panier, setPanier] = useState<Trouvaille[]>([])
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({})
  const [angle, setAngle] = useState<Angle | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [onglet, setOnglet] = useState<'conversation' | 'platine'>('conversation')
  const [nouvelles, setNouvelles] = useState(0)
  const [reglagesOuverts, setReglagesOuverts] = useState(false)
  const [alerte, setAlerte] = useState<string | null>(null)

  const tops = useRef<{ court: string[]; long: string[] } | null>(null)
  const reactionsEnAttente = useRef<string[]>([])
  const dernierAngle = useRef<string | undefined>(undefined)

  useEffect(() => ecrire(CLE_CONVERSATION, messages.slice(-40)), [messages])
  useEffect(() => ecrire(CLE_REGLAGES, reglages), [reglages])

  // L'index d'exclusion se charge en tâche de fond dès l'ouverture.
  useEffect(() => {
    if (session) void chargerBibliotheque()
  }, [session])

  /* ---------------------------------------------------------------- */
  /* Le top Spotify, relevé une fois par session                       */
  /* ---------------------------------------------------------------- */

  const relverTops = useCallback(async () => {
    if (tops.current) return tops.current
    try {
      const [artistesCourt, pistesCourt, pistesLong] = await Promise.all([
        mesTopArtistes('short_term').catch(() => []),
        mesTopPistes('short_term').catch(() => []),
        mesTopPistes('long_term').catch(() => []),
      ])
      tops.current = {
        court: [
          ...artistesCourt.map((a) => a.name),
          ...pistesCourt.map((p) => `${p.artists[0]?.name ?? '?'} — ${p.name}`),
        ],
        long: pistesLong.map((p) => `${p.artists[0]?.name ?? '?'} — ${p.name}`),
      }
    } catch {
      tops.current = { court: [], long: [] }
    }
    return tops.current
  }, [])

  /* ---------------------------------------------------------------- */
  /* La fouille                                                        */
  /* ---------------------------------------------------------------- */

  const lancer = useCallback(
    async (texte: string) => {
      if (enCours) return
      setEnCours(true)
      setAlerte(null)
      setTrouvailles([])
      setNouvelles(0)

      const tire = tirerAngle(dernierAngle.current)
      dernierAngle.current = tire.cle
      setAngle(tire)

      const historique = messages.slice(-20).map((m) => ({
        role: m.role === 'moi' ? ('user' as const) : ('assistant' as const),
        content: m.texte,
      }))

      setMessages((prec) => [
        ...prec,
        { role: 'moi', texte },
        { role: 'agent', texte: '', angle: tire.libelle },
      ])

      const majProse = (prose: string) => {
        setMessages((prec) => {
          const copie = [...prec]
          const dernier = copie[copie.length - 1]
          if (dernier && dernier.role === 'agent') {
            copie[copie.length - 1] = { ...dernier, texte: prose }
          }
          return copie
        })
      }

      try {
        const [index, top] = await Promise.all([chargerBibliotheque(), relverTops()])
        const journalCourant = lireJournal()

        const socle = {
          historique,
          profil,
          angle: tire.libelle,
          consigneAngle: tire.consigne,
          exploration: reglages.exploration,
          terrain: reglages.terrain,
          journal: listeAntiRepetition(journalCourant),
          topCourt: top.court,
          topLong: top.long,
          cible: /\balbums?\b|compilation/i.test(texte) ? ('album' as const) : ('titres' as const),
        }

        const contexte = {
          angle: tire.libelle,
          terrain: reglages.terrain,
          index,
          urisBannies: urisBannies(journalCourant),
          artistesBloques: artistesBloques(journalCourant),
        }

        let fouille = await fouiller({ ...socle, message: texte }, majProse)
        let resolution = await resoudreCandidats(fouille.candidats, contexte)

        // Une seule relance, quand plus de la moitié des candidats n'a pas tenu.
        const seuil = Math.max(1, Math.ceil(fouille.candidats.length / 2))
        if (fouille.candidats.length > 0 && resolution.trouvailles.length < seuil) {
          const fantomes = resolution.echecs.map(
            (c) => `${c.artiste} — ${c.titre ?? c.album ?? ''}`,
          )
          if (fantomes.length) {
            const seconde = await fouiller(
              { ...socle, message: texte, echecs: fantomes },
              () => {
                /* La prose de la relance ne remplace pas la première. */
              },
            )
            const bis = await resoudreCandidats(seconde.candidats, {
              ...contexte,
              urisBannies: new Set([
                ...contexte.urisBannies,
                ...resolution.trouvailles.map((t) => t.piste.uri),
              ]),
            })
            resolution = {
              trouvailles: [...resolution.trouvailles, ...bis.trouvailles].slice(0, 8),
              echecs: [...resolution.echecs, ...bis.echecs],
              filtres: resolution.filtres + bis.filtres,
            }
            fouille = { ...fouille, jsonCasse: fouille.jsonCasse && seconde.jsonCasse }
          }
        }

        if (fouille.jsonCasse && resolution.trouvailles.length === 0) {
          setAlerte('Réponse mal formée. Relance, ça repart en général.')
        } else if (resolution.trouvailles.length < 3) {
          majProse(
            `${fouille.prose}\n\nFouille infructueuse sur cet angle, je retente autrement.`.trim(),
          )
        }

        setTrouvailles(resolution.trouvailles)
        setNouvelles(resolution.trouvailles.length)
        setMessages((prec) => {
          const copie = [...prec]
          const dernier = copie[copie.length - 1]
          if (dernier && dernier.role === 'agent') {
            copie[copie.length - 1] = {
              ...dernier,
              uris: resolution.trouvailles.map((t) => t.piste.uri),
            }
          }
          return copie
        })

        if (resolution.trouvailles.length) setJournal(consigner(resolution.trouvailles))
      } catch (e) {
        setAlerte(e instanceof Error ? e.message : 'La fouille a calé.')
        majProse('La fouille a calé en route. Relance.')
      } finally {
        setEnCours(false)
      }
    },
    [enCours, messages, profil, reglages, relverTops],
  )

  /* ---------------------------------------------------------------- */
  /* Réactions et mise à jour du profil                                */
  /* ---------------------------------------------------------------- */

  function reagir(uri: string, verdict: Verdict) {
    setVerdicts((prec) => ({ ...prec, [uri]: verdict }))
    setJournal(noterVerdict(uri, verdict))

    const t = trouvailles.find((x) => x.piste.uri === uri)
    if (t) {
      reactionsEnAttente.current.push(
        `${t.piste.artists[0]?.name ?? t.candidat.artiste} — ${t.piste.name} : ${LIBELLES[verdict]}`,
      )
    }
    // Un titre rejeté quitte la playlist en construction.
    if (verdict === 'refus') setPanier((prec) => prec.filter((p) => p.piste.uri !== uri))
  }

  // Le profil se réécrit peu après les réactions, pour qu'on le voie bouger
  // entre deux échanges sans rallonger le temps de réponse de la fouille.
  useEffect(() => {
    if (!journal.length) return
    const minuteur = setTimeout(() => {
      const lot = reactionsEnAttente.current
      if (!lot.length) return
      reactionsEnAttente.current = []
      void reecrireProfil(profil, lot, angle?.libelle ?? '').then((neuf) => {
        if (neuf && neuf !== profil) setProfil(ecrireProfil(neuf))
      })
    }, 2500)
    return () => clearTimeout(minuteur)
  }, [verdicts, journal.length, profil, angle])

  /* ---------------------------------------------------------------- */

  function basculerPanier(t: Trouvaille) {
    setPanier((prec) => {
      if (prec.some((p) => p.piste.uri === t.piste.uri)) {
        return prec.filter((p) => p.piste.uri !== t.piste.uri)
      }
      if (prec.length >= PLAFOND_PANIER) return prec
      return [...prec, t]
    })
  }

  function nouvelleFouille() {
    setMessages([])
    setTrouvailles([])
    setVerdicts({})
    setPanier([])
    setAngle(null)
    setNouvelles(0)
    setAlerte(null)
    effacer(CLE_CONVERSATION)
  }

  function deconnecter() {
    effacerJetons()
    setSession(false)
    setReglagesOuverts(false)
  }

  if (!session) return <Connexion />

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* Deux rangées sous 768 px : à une seule rangée, les onglets poussaient
          « Nouvelle fouille » et les réglages hors de l'écran à 375 px. */}
      <header className="shrink-0 border-b border-white/5 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg leading-none font-black tracking-tighter uppercase">
            Spoti<span className="text-accent">fouille</span>
          </h1>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={nouvelleFouille}
              className="min-h-11 rounded-full px-3 text-[11px] font-bold tracking-wide text-texte-doux uppercase transition-opacity hover:text-texte"
            >
              Nouvelle fouille
            </button>
            <button
              type="button"
              onClick={() => setReglagesOuverts(true)}
              aria-label="Ouvrir les réglages"
              className="size-11 rounded-full text-texte-doux transition-opacity hover:text-texte"
            >
              <span aria-hidden="true">⚙</span>
            </button>
          </div>
        </div>

        <nav aria-label="Panneaux" className="mt-1 flex gap-1 md:hidden">
          <button
            type="button"
            onClick={() => setOnglet('conversation')}
            aria-current={onglet === 'conversation'}
            className={`min-h-11 flex-1 rounded-full px-3 text-[11px] font-bold tracking-wide uppercase ${
              onglet === 'conversation' ? 'bg-surface-haute text-texte' : 'text-texte-doux'
            }`}
          >
            Conversation
          </button>
          <button
            type="button"
            onClick={() => {
              setOnglet('platine')
              setNouvelles(0)
            }}
            aria-current={onglet === 'platine'}
            className={`relative min-h-11 flex-1 rounded-full px-3 text-[11px] font-bold tracking-wide uppercase ${
              onglet === 'platine' ? 'bg-surface-haute text-texte' : 'text-texte-doux'
            }`}
          >
            Platine
            {nouvelles > 0 && onglet !== 'platine' ? (
              <span className="absolute top-1 right-2 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-fond tabular-nums">
                {nouvelles}
              </span>
            ) : null}
          </button>
        </nav>
      </header>

      {alerte ? (
        <p role="status" className="shrink-0 bg-accent/15 px-4 py-2 text-[13px] text-accent-clair">
          {alerte}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Conversation : 60 % en desktop, onglet en mobile. */}
        <main
          className={`min-h-0 flex-col md:flex md:w-3/5 md:border-r md:border-white/5 ${
            onglet === 'conversation' ? 'flex w-full' : 'hidden'
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Conversation messages={messages} enCours={enCours} onAmorce={lancer} />
          </div>
          <Saisie
            reglages={reglages}
            angle={angle?.libelle ?? ''}
            enCours={enCours}
            onEnvoyer={lancer}
            onReglages={setReglages}
          />
        </main>

        {/* Platine : 40 % en desktop, onglet en mobile. */}
        <aside
          aria-label="Platine"
          className={`min-h-0 md:flex md:w-2/5 md:flex-col ${
            onglet === 'platine' ? 'flex w-full flex-col' : 'hidden'
          }`}
        >
          <Platine
            trouvailles={trouvailles}
            verdicts={verdicts}
            panier={panier}
            angle={angle?.libelle ?? ''}
            enCours={enCours}
            onReagir={reagir}
            onBasculerPanier={basculerPanier}
            onViderPanier={() => setPanier([])}
          />
        </aside>
      </div>

      <Reglages
        ouvert={reglagesOuverts}
        profil={profil}
        journal={journal}
        onFermer={() => setReglagesOuverts(false)}
        onProfil={(t) => setProfil(ecrireProfil(t))}
        onViderJournal={() => {
          viderJournal()
          setJournal([])
          setVerdicts({})
        }}
        onDeconnexion={deconnecter}
      />
    </div>
  )
}
