/**
 * POST /api/fiche
 *
 * La couche culturelle : producteur, contexte, scène, ce qu'il faut écouter
 * précisément et à quel moment du morceau. C'est elle qui fait la différence
 * avec une simple liste.
 *
 * Haiku, 400 jetons, sans flux : la réponse est courte et s'affiche d'un bloc
 * au dépliage de la pochette.
 *
 * Note d'API : Haiku 4.5 n'accepte pas output_config.effort, qui provoque une
 * erreur. Ne l'ajoute pas ici.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Context } from '@netlify/functions'
import { adresse, consommer, reponseTropDeRequetes } from '../lib/limite.mts'
import { MAX_TOKENS_FICHE, MODELE_FICHE, texteCourt } from '../lib/prompt.mts'

function json(charge: unknown, statut = 200): Response {
  return new Response(JSON.stringify(charge), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export default async (req: Request, context: Context): Promise<Response> => {
  if (req.method !== 'POST') return json({ erreur: 'Méthode non autorisée.' }, 405)

  const cle = process.env.ANTHROPIC_API_KEY
  if (!cle) return json({ erreur: 'Le serveur n’a pas de clé Anthropic configurée.' }, 500)

  const debit = await consommer(adresse(req, context))
  if (!debit.autorise) return reponseTropDeRequetes(debit.reprendDans)

  let charge: Record<string, unknown>
  try {
    charge = (await req.json()) as Record<string, unknown>
  } catch {
    return json({ erreur: 'Corps de requête illisible.' }, 400)
  }

  const artiste = texteCourt(charge.artiste, 200).trim()
  const titre = texteCourt(charge.titre, 300).trim()
  const annee = texteCourt(charge.annee, 8).trim()
  const album = texteCourt(charge.album, 300).trim()
  if (!artiste || !titre) return json({ erreur: 'Artiste et titre requis.' }, 400)

  const client = new Anthropic({ apiKey: cle })

  try {
    const reponse = await client.messages.create({
      model: MODELE_FICHE,
      max_tokens: MAX_TOKENS_FICHE,
      system: `Tu es disquaire. On te montre un disque, tu racontes ce qu'il y a autour et dedans.

Quatre paragraphes courts, sans titre ni puce :
1. Qui fait quoi : producteur, ingénieur du son, musiciens de session, label.
2. Le contexte : l'année, la scène, ce qui se passait autour.
3. Ce qu'il faut écouter précisément, et à quel moment du morceau.
4. Une porte de sortie : par où continuer après celui-là.

Tutoie. Guillemets français « » uniquement. Aucun tiret cadratin. Aucun participe présent employé comme verbe. Ton direct, un peu disquaire, jamais corporate.

Si tu ne connais pas ce morceau, dis-le franchement en une phrase plutôt que d'inventer un producteur ou un studio. Une fiche courte et vraie vaut mieux qu'une fiche longue et fausse.`,
      messages: [
        {
          role: 'user',
          content: `${artiste} — ${titre}${album ? ` (album « ${album} »)` : ''}${annee ? `, ${annee}` : ''}`,
        },
      ],
    })

    if (reponse.stop_reason === 'refusal') {
      return json({ fiche: 'Rien à dire sur celui-là.' })
    }

    const texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    return json({ fiche: texte || 'Rien à dire sur celui-là.' })
  } catch (e) {
    console.error('fiche: échec', e instanceof Error ? e.message : 'inconnue')
    return json({ erreur: 'La fiche n’est pas revenue. Réessaie.' }, 502)
  }
}
