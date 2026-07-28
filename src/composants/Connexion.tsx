import { useState } from 'react'
import { urlAutorisation } from '../lib/spotify/pkce'
import { LogoSpotify } from './LogoSpotify'

export function Connexion() {
  const [erreur, setErreur] = useState<string | null>(null)

  async function connecter() {
    try {
      window.location.href = await urlAutorisation()
    } catch (e) {
      setErreur(
        e instanceof Error
          ? e.message
          : 'La connexion n’a pas pu démarrer. Vérifie la configuration.',
      )
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-5xl leading-none font-black tracking-tighter uppercase">
          Spoti
          <span className="text-accent">fouille</span>
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-texte-doux">
          Un disquaire qui connaît ta bibliothèque, tire un angle au hasard et attaque le catalogue
          par ce bord. Spotify ne sert qu’à vérifier que les morceaux existent et à graver les
          playlists.
        </p>

        <button
          type="button"
          onClick={connecter}
          className="mt-8 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 font-bold text-fond transition-opacity hover:opacity-90"
        >
          Connecter mon compte Spotify
        </button>

        {erreur ? <p className="mt-3 text-[13px] text-accent-clair">{erreur}</p> : null}

        <p className="mt-6 text-[13px] leading-relaxed text-texte-doux">
          Rien n’est stocké ailleurs que dans ce navigateur. Les jetons Spotify ne quittent pas ta
          machine.
        </p>
      </div>

      <footer className="mt-10 flex items-center gap-2 text-[11px] text-texte-doux">
        <span>Métadonnées et lecture</span>
        <span className="text-spotify-vert">
          <LogoSpotify taille={16} />
        </span>
        <span>Spotify</span>
      </footer>
    </main>
  )
}
