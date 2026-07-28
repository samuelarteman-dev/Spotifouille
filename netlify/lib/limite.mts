/**
 * Limitation de débit sur /api/*, via Netlify Blobs.
 *
 * Le site est public même s'il n'a qu'un seul utilisateur, et une clé d'API
 * derrière une fonction ouverte finit toujours par être trouvée.
 *
 * Deux garde-fous superposés :
 *  - 40 appels par heure et par adresse IP, fenêtre fixe ;
 *  - 300 appels par jour, tous appelants confondus. C'est celui qui compte
 *    vraiment : n'importe quelle connexion résidentielle moderne dispose d'un
 *    préfixe IPv6 /64, donc d'un nombre illimité de quotas par IP.
 *
 * L'incrément passe par une écriture conditionnelle. Une simple séquence
 * lire-incrémenter-écrire ne suffit pas : deux allers-retours réseau séparent
 * la lecture de l'écriture, donc N requêtes lancées ensemble lisent la même
 * valeur et le compteur n'avance que d'une unité par salve.
 */

import { createHmac } from 'node:crypto'
import { getStore } from '@netlify/blobs'

const PLAFOND_IP = 40
const FENETRE_IP_MS = 60 * 60 * 1000
const PLAFOND_GLOBAL = Number(process.env.PLAFOND_GLOBAL_QUOTIDIEN ?? '300')
const FENETRE_GLOBALE_MS = 24 * 60 * 60 * 1000
/** Tentatives d'écriture conditionnelle avant d'abandonner. */
const ESSAIS = 5

interface Compteur {
  debut: number
  compte: number
}

/** Vrai en production Netlify. En local, Blobs n'existe pas. */
const enProduction = (): boolean => process.env.CONTEXT === 'production'

/** Adresse IP du client, telle que Netlify la fournit. */
export function adresse(req: Request, context: { ip?: string }): string {
  const brut =
    context.ip ||
    req.headers.get('x-nf-client-connection-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'inconnue'
  return condense(brut)
}

/**
 * HMAC et pas un simple condensé : l'espace IPv4 fait 2^32, une table complète
 * d'un hachage non clé se calcule en quelques secondes. Sans SEL_DEBIT le
 * secret est faible, mais le magasin n'est de toute façon lisible que par toi.
 */
function condense(valeur: string): string {
  const sel = process.env.SEL_DEBIT ?? 'spotifouille'
  return createHmac('sha256', sel).update(valeur).digest('base64url').slice(0, 22)
}

export interface Verdict {
  autorise: boolean
  restant: number
  reprendDans: number
}

const refus = (reprendDans: number): Verdict => ({ autorise: false, restant: 0, reprendDans })

async function incrementer(
  store: ReturnType<typeof getStore>,
  cle: string,
  plafond: number,
  fenetre: number,
): Promise<Verdict> {
  const maintenant = Date.now()

  for (let essai = 0; essai < ESSAIS; essai++) {
    const entree = await store.getWithMetadata(cle, { type: 'json', consistency: 'strong' })
    const existant = (entree?.data ?? null) as Compteur | null

    const dansLaFenetre =
      existant && typeof existant.debut === 'number' && maintenant - existant.debut < fenetre
    const compteur: Compteur = dansLaFenetre
      ? { debut: existant.debut, compte: (existant.compte ?? 0) + 1 }
      : { debut: maintenant, compte: 1 }

    if (compteur.compte > plafond) {
      return refus(Math.ceil((compteur.debut + fenetre - maintenant) / 1000))
    }

    // onlyIfMatch quand l'entrée existe, onlyIfNew sinon : dans les deux cas
    // l'écriture échoue si quelqu'un est passé entre la lecture et nous.
    const conditions = entree?.etag ? { onlyIfMatch: entree.etag } : { onlyIfNew: true as const }
    const ecriture = await store.set(cle, JSON.stringify(compteur), conditions)

    if (ecriture.modified) {
      return { autorise: true, restant: plafond - compteur.compte, reprendDans: 0 }
    }
    // modified === false : quelqu'un a écrit entre-temps. On relit et on refait.
  }

  // Contention persistante : on refuse. Sous charge, refuser est la bonne
  // réponse, c'est précisément la situation que la limite doit couvrir.
  return refus(60)
}

export async function consommer(cle: string): Promise<Verdict> {
  let store: ReturnType<typeof getStore>
  try {
    store = getStore({ name: 'spotifouille-debit', consistency: 'strong' })
  } catch {
    // En production, pas de compteur veut dire pas de protection de la clé
    // Anthropic : on ferme. En local, l'application doit tourner sans Blobs.
    return enProduction() ? refus(60) : { autorise: true, restant: PLAFOND_IP, reprendDans: 0 }
  }

  try {
    // Le plafond global d'abord : c'est lui qui borne réellement la facture.
    const global = await incrementer(store, 'global', PLAFOND_GLOBAL, FENETRE_GLOBALE_MS)
    if (!global.autorise) return global
    return await incrementer(store, cle, PLAFOND_IP, FENETRE_IP_MS)
  } catch {
    // Blobs a répondu mais mal. Surtout ne pas repartir d'un compteur neuf :
    // une lecture ratée effacerait le décompte en cours et rendrait le quota.
    return enProduction() ? refus(60) : { autorise: true, restant: PLAFOND_IP, reprendDans: 0 }
  }
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

/**
 * L'appel vient-il du site lui-même ?
 *
 * Sans ce contrôle, une page tierce fait consommer le quota par chacun de ses
 * visiteurs, sur l'adresse IP du visiteur : la limitation par IP se retourne
 * alors en multiplicateur. L'absence de CORS empêche de LIRE la réponse, mais
 * la requête a déjà été traitée et facturée.
 */
export function memeOrigine(req: Request): boolean {
  const origine = req.headers.get('origin')
  // Pas d'en-tête Origin : appel hors navigateur. La limite de débit joue seule.
  if (!origine) return true
  try {
    return new URL(origine).host === new URL(req.url).host
  } catch {
    return false
  }
}
