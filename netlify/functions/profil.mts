/**
 * POST /api/profil
 *
 * Réécriture du profil appris à la fin de chaque échange, en tenant compte
 * des réactions. Appel léger : Haiku, 400 jetons.
 *
 * Le profil décrit des tendances, jamais une liste de titres : le journal
 * s'occupe déjà des titres, et le dupliquer ferait grossir chaque prompt
 * pour rien.
 *
 * Note d'API : Haiku 4.5 n'accepte pas output_config.effort.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Context } from '@netlify/functions'
import { adresse, consommer, reponseTropDeRequetes } from '../lib/limite.mts'
import {
  LIMITE_PROFIL,
  MAX_TOKENS_FICHE,
  MODELE_FICHE,
  listeCourte,
  texteCourt,
} from '../lib/prompt.mts'

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

  const ancien = texteCourt(charge.profil, LIMITE_PROFIL)
  const reactions = listeCourte(charge.reactions, 40, 300)
  const angle = texteCourt(charge.angle, 120)
  if (!reactions.length) return json({ profil: ancien })

  const client = new Anthropic({ apiKey: cle })

  try {
    const reponse = await client.messages.create({
      model: MODELE_FICHE,
      max_tokens: MAX_TOKENS_FICHE,
      system: `Tu tiens la fiche d'un client de disquaire. On te donne son ancienne fiche et ses réactions du jour. Tu réécris la fiche entière.

Contraintes :
- 1500 caractères maximum. C'est une limite dure.
- En français, à la deuxième personne du singulier.
- Décris des tendances, jamais une liste de titres : un autre système s'occupe déjà des titres.
- Oriente le contenu : ce qui marche, ce qui ne marche pas, les angles de fouille productifs, les zones déjà couvertes.
- Aucun tiret cadratin, guillemets français « » uniquement, aucun participe présent employé comme verbe.
- Ne recopie pas l'ancienne fiche : intègre, corrige, resserre. Ce qui n'est plus confirmé peut disparaître.

Sens des réactions, la nuance compte :
- « adore » : bon fond, bonne forme.
- « connais déjà » : la direction était juste mais inutile. Signal le plus précieux du lot : creuse plus loin dans cette veine, pas ailleurs.
- « pas pour moi » : mauvaise direction.
- « à creuser » : intéressant sans être immédiat.

Réponds avec la fiche seule. Pas d'introduction, pas de commentaire.`,
      messages: [
        {
          role: 'user',
          content: `Ancienne fiche :
${ancien || '(vide, c’est le premier échange)'}

Angle de fouille de la séance : ${angle || 'non précisé'}

Réactions du jour :
${reactions.join('\n')}`,
        },
      ],
    })

    if (reponse.stop_reason === 'refusal') return json({ profil: ancien })

    const texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    return json({ profil: (texte || ancien).slice(0, LIMITE_PROFIL) })
  } catch (e) {
    console.error('profil: échec', e instanceof Error ? e.message : 'inconnue')
    // On renvoie l'ancien profil : perdre une mise à jour vaut mieux que
    // perdre le profil.
    return json({ profil: ancien })
  }
}
