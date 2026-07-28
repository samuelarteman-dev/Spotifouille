/**
 * Journal anti-répétition.
 *
 * Règles :
 *  - les 300 derniers titres partent dans chaque prompt
 *  - blocage au niveau de l'artiste sur les 20 dernières propositions
 *  - « Pas pour moi » bannit le titre définitivement
 *  - « À creuser » redevient éligible après 30 jours
 */

import type { EntreeJournal, Trouvaille, Verdict } from '../../types'
import { cleComparaison } from '../texte'
import { ecrire, effacer, lire } from './stockage'

const CLE = 'spotifouille:journal'
const TAILLE_PROMPT = 300
const BLOCAGE_ARTISTE = 20
const JOURS_CREUSER = 30
const PLAFOND = 2000

export function lireJournal(): EntreeJournal[] {
  return lire<EntreeJournal[]>(CLE, [])
}

function ecrireJournal(entrees: EntreeJournal[]): void {
  // On garde les plus récentes, le journal ne doit pas gonfler indéfiniment.
  ecrire(CLE, entrees.slice(-PLAFOND))
}

export function viderJournal(): void {
  effacer(CLE)
}

/** Enregistre les titres proposés. Un titre déjà présent n'est pas dupliqué. */
export function consigner(trouvailles: Trouvaille[]): EntreeJournal[] {
  const journal = lireJournal()
  const connus = new Set(journal.map((e) => e.uri))
  for (const t of trouvailles) {
    if (connus.has(t.piste.uri)) continue
    connus.add(t.piste.uri)
    journal.push({
      uri: t.piste.uri,
      artiste: t.piste.artists[0]?.name ?? t.candidat.artiste,
      titre: t.piste.name,
      date: t.proposeLe,
      angle: t.angle,
      verdict: null,
    })
  }
  ecrireJournal(journal)
  return journal
}

export function noterVerdict(uri: string, verdict: Verdict): EntreeJournal[] {
  const journal = lireJournal()
  const entree = journal.find((e) => e.uri === uri)
  if (entree) {
    entree.verdict = verdict
    entree.date = new Date().toISOString()
  }
  ecrireJournal(journal)
  return journal
}

const joursDepuis = (iso: string): number => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return Infinity
  return (Date.now() - t) / 86_400_000
}

/**
 * URI à ne plus proposer.
 * Un « Pas pour moi » est définitif. Un « À creuser » repasse éligible à 30 jours.
 * Le reste est bloqué tant qu'il est dans la fenêtre du prompt.
 */
export function urisBannies(journal = lireJournal()): Set<string> {
  const bannies = new Set<string>()
  const recentes = journal.slice(-TAILLE_PROMPT)
  for (const e of journal) {
    if (e.verdict === 'refus') bannies.add(e.uri)
    else if (e.verdict === 'creuser' && joursDepuis(e.date) < JOURS_CREUSER) bannies.add(e.uri)
  }
  for (const e of recentes) {
    if (e.verdict !== 'creuser') bannies.add(e.uri)
  }
  return bannies
}

/**
 * Artistes bloqués : ceux des 20 dernières propositions.
 * Un artiste qui revient trop vite est aussi lassant qu'un titre.
 */
export function artistesBloques(journal = lireJournal()): Set<string> {
  return new Set(
    journal.slice(-BLOCAGE_ARTISTE).map((e) => cleComparaison(e.artiste)).filter(Boolean),
  )
}

/** Les 300 derniers titres, au format « Artiste — Titre », pour le prompt. */
export function listeAntiRepetition(journal = lireJournal()): string[] {
  return journal.slice(-TAILLE_PROMPT).map((e) => `${e.artiste} — ${e.titre}`)
}

/** Comptage par angle : on saura vite quels angles fonctionnent. */
export function bilanParAngle(journal = lireJournal()): Record<string, Record<Verdict, number>> {
  const bilan: Record<string, Record<Verdict, number>> = {}
  for (const e of journal) {
    if (!e.verdict) continue
    const angle = e.angle || 'inconnu'
    bilan[angle] ??= { adore: 0, connais: 0, refus: 0, creuser: 0 }
    bilan[angle][e.verdict]++
  }
  return bilan
}
