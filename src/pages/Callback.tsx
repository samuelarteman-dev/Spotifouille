import { useEffect, useState } from 'react'
import { echangerCode } from '../lib/spotify/auth'
import { etatAttendu, oublierVerifieur } from '../lib/spotify/pkce'

/**
 * Contrôle du retour de Spotify, fait au premier rendu et pas dans un effet :
 * il ne dépend que de l'URL, qui ne bouge plus une fois la page chargée.
 */
function inspecterRetour(): { code: string } | { erreur: string } {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const etat = params.get('state')

  if (params.get('error')) return { erreur: 'Connexion refusée côté Spotify.' }
  if (!code) return { erreur: 'Spotify n’a pas renvoyé de code.' }
  if (!etat || etat !== etatAttendu()) {
    return { erreur: 'Jeton d’état invalide. Recommence la connexion.' }
  }
  return { code }
}

/** Route /callback : échange le code puis renvoie sur la racine. */
export function Callback() {
  const [retour] = useState(inspecterRetour)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if ('erreur' in retour) {
      oublierVerifieur()
      return
    }
    let annule = false
    echangerCode(retour.code)
      .then(() => {
        if (!annule) window.location.replace('/')
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof Error ? e.message : 'L’échange du code a échoué.')
      })
    return () => {
      annule = true
    }
  }, [retour])

  const probleme = 'erreur' in retour ? retour.erreur : erreur

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="max-w-sm text-center">
        {probleme ? (
          <>
            <h1 className="text-2xl font-black tracking-tight uppercase">Raté</h1>
            <p className="mt-2 text-[15px] text-texte-doux">{probleme}</p>
            <a
              href="/"
              className="mt-6 inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-bold text-fond"
            >
              Revenir au début
            </a>
          </>
        ) : (
          <p className="text-[15px] text-texte-doux">On branche la platine…</p>
        )}
      </div>
    </main>
  )
}
