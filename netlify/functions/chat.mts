/**
 * POST /api/chat
 *
 * Netlify Function v2, ESM, réponse en flux. Deux raisons au flux : le ressenti
 * de vitesse, et surtout le plafond d'exécution de Netlify autour de 10
 * secondes. Une réponse en flux commence à sortir immédiatement, donc elle ne
 * dépasse pas le délai. Sans flux, une réponse un peu longue coupe.
 *
 * La clé ANTHROPIC_API_KEY ne quitte jamais ce fichier. Aucun jeton Spotify
 * n'entre ici : ils restent dans le navigateur.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Context } from '@netlify/functions'
import { adresse, consommer, reponseTropDeRequetes } from '../lib/limite.mts'
import {
  blocEmpreinte,
  blocProfil,
  blocRelance,
  blocRole,
  blocSession,
  LIMITE_JOURNAL,
  LIMITE_MESSAGE,
  LIMITE_PROFIL,
  MAX_TOKENS_CONVERSATION,
  MODELE_CONVERSATION,
  listeCourte,
  normaliserHistorique,
  texteCourt,
  type Tour,
} from '../lib/prompt.mts'

const encodeur = new TextEncoder()

function erreur(message: string, statut: number): Response {
  return new Response(JSON.stringify({ erreur: message }), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export default async (req: Request, context: Context): Promise<Response> => {
  if (req.method !== 'POST') return erreur('Méthode non autorisée.', 405)

  const cle = process.env.ANTHROPIC_API_KEY
  if (!cle) return erreur('Le serveur n’a pas de clé Anthropic configurée.', 500)

  const debit = await consommer(adresse(req, context))
  if (!debit.autorise) return reponseTropDeRequetes(debit.reprendDans)

  let charge: Record<string, unknown>
  try {
    charge = (await req.json()) as Record<string, unknown>
  } catch {
    return erreur('Corps de requête illisible.', 400)
  }

  /* --- Validation stricte de l'entrée --- */

  const message = texteCourt(charge.message, LIMITE_MESSAGE).trim()
  const relance = Array.isArray(charge.echecs) ? listeCourte(charge.echecs, 12) : []
  if (!message && !relance.length) return erreur('Message vide.', 400)

  const angle = texteCourt(charge.angle, 120) || 'au fil de l’humeur'
  const consigneAngle = texteCourt(charge.consigneAngle, 600)
  const explorationBrute = Number(charge.exploration)
  const exploration = Number.isFinite(explorationBrute)
    ? Math.min(100, Math.max(0, Math.round(explorationBrute)))
    : 45
  const terrain = charge.terrain === 'connu' ? 'connu' : 'incognita'
  const cible = charge.cible === 'album' ? 'album' : 'titres'

  const systeme = [
    { type: 'text' as const, text: blocRole() },
    // Point de césure du cache : l'empreinte ne change jamais.
    {
      type: 'text' as const,
      text: blocEmpreinte(),
      cache_control: { type: 'ephemeral' as const },
    },
    // Deuxième césure : le profil ne change qu'entre deux échanges.
    {
      type: 'text' as const,
      text: blocProfil(texteCourt(charge.profil, LIMITE_PROFIL)),
      cache_control: { type: 'ephemeral' as const },
    },
    {
      type: 'text' as const,
      text: blocSession({
        profil: '',
        angle,
        consigneAngle,
        exploration,
        terrain,
        journal: listeCourte(charge.journal, LIMITE_JOURNAL),
        topCourt: listeCourte(charge.topCourt, 20),
        topLong: listeCourte(charge.topLong, 20),
        cible,
      }),
    },
  ]

  const messages: Tour[] = normaliserHistorique(charge.historique)
  messages.push({
    role: 'user',
    content: relance.length ? blocRelance(relance) : message,
  })

  /* --- Appel en flux --- */

  const client = new Anthropic({ apiKey: cle })

  const flux = new ReadableStream<Uint8Array>({
    async start(controleur) {
      try {
        const stream = client.messages.stream({
          model: MODELE_CONVERSATION,
          max_tokens: MAX_TOKENS_CONVERSATION,
          // Pas de réflexion : les 1500 jetons doivent aller à la prose et au
          // JSON, et le flux doit commencer tout de suite.
          thinking: { type: 'disabled' },
          system: systeme,
          messages,
        })

        for await (const evenement of stream) {
          if (
            evenement.type === 'content_block_delta' &&
            evenement.delta.type === 'text_delta'
          ) {
            controleur.enqueue(encodeur.encode(evenement.delta.text))
          }
        }

        const final = await stream.finalMessage()
        if (final.stop_reason === 'refusal') {
          controleur.enqueue(
            encodeur.encode('\n\nFouille interrompue sur cette demande. Reformule autrement.'),
          )
        }
      } catch (e) {
        const detail = e instanceof Error ? e.message : 'inconnue'
        console.error('chat: échec du flux', detail)
        controleur.enqueue(
          encodeur.encode('\n\nLa fouille a calé en route. Relance, ça repart en général.'),
        )
      } finally {
        controleur.close()
      }
    },
  })

  return new Response(flux, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
      'X-Debit-Restant': String(debit.restant),
    },
  })
}
