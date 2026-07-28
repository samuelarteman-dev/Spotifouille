/**
 * Limitation de débit sur /api/*, via Netlify Blobs.
 *
 * Le site est public même s'il n'a qu'un seul utilisateur, et une clé d'API
 * derrière une fonction ouverte finit toujours par être trouvée.
 * 40 appels par heure et par adresse IP, fenêtre fixe.
 */

import { getStore } from '@netlify/blobs'

const PLAFOND = 40
const FENETRE_MS = 60 * 60 * 1000

interface Compteur {
  debut: number
  compte: number
}

/** Adresse IP du client, telle que Netlify la fournit. */
export function adresse(req: Request, context: { ip?: string }): string {
  const brut =
    context.ip ||
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'inconnue'
  // Clé de stockage : on ne garde qu'un condensé, pas l'adresse en clair.
  return condense(brut)
}

function condense(valeur: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < valeur.length; i++) {
    h1 ^= valeur.charCodeAt(i)
    h1 = Math.imul(h1, 0x01000193)
    h2 = Math.imul(h2 ^ valeur.charCodeAt(i), 0x85ebca6b)
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

export interface Verdict {
  autorise: boolean
  restant: number
  reprendDans: number
}

export async function consommer(cle: string): Promise<Verdict> {
  let store: ReturnType<typeof getStore>
  try {
    store = getStore({ name: 'spotifouille-debit', consistency: 'strong' })
  } catch {
    // Blobs indisponible (dev local sans contexte) : on n'ouvre pas la porte
    // en grand, mais on ne casse pas l'application non plus.
    return { autorise: true, restant: PLAFOND, reprendDans: 0 }
  }

  const maintenant = Date.now()
  let compteur: Compteur = { debut: maintenant, compte: 0 }

  try {
    const existant = (await store.get(cle, { type: 'json' })) as Compteur | null
    if (existant && maintenant - existant.debut < FENETRE_MS) compteur = existant
  } catch {
    // Lecture impossible : on repart d'un compteur neuf.
  }

  compteur.compte++

  if (compteur.compte > PLAFOND) {
    return {
      autorise: false,
      restant: 0,
      reprendDans: Math.ceil((compteur.debut + FENETRE_MS - maintenant) / 1000),
    }
  }

  try {
    await store.setJSON(cle, compteur)
  } catch {
    // Écriture impossible : on laisse passer, la limite est un garde-fou, pas un péage.
  }

  return { autorise: true, restant: PLAFOND - compteur.compte, reprendDans: 0 }
}

export function reponseTropDeRequetes(reprendDans: number): Response {
  return new Response(
    JSON.stringify({
      erreur: 'Trop de fouilles sur cette heure. Reviens dans un moment.',
      reprendDans,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(Math.max(reprendDans, 1)),
      },
    },
  )
}
