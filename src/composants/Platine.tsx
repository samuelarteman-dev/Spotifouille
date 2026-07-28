import { useState } from 'react'
import type { Trouvaille, Verdict } from '../types'
import { creerPlaylist } from '../lib/spotify/api'
import { Carte } from './Carte'
import { LogoSpotify } from './LogoSpotify'

/** Règle d'attribution Spotify : jamais plus de 20 éléments dans un ensemble. */
const PLAFOND_PLAYLIST = 20

interface Props {
  trouvailles: Trouvaille[]
  verdicts: Record<string, Verdict>
  panier: Trouvaille[]
  angle: string
  enCours: boolean
  onReagir: (uri: string, verdict: Verdict) => void
  onBasculerPanier: (trouvaille: Trouvaille) => void
  onViderPanier: () => void
}

export function Platine({
  trouvailles,
  verdicts,
  panier,
  angle,
  enCours,
  onReagir,
  onBasculerPanier,
  onViderPanier,
}: Props) {
  const [creation, setCreation] = useState(false)
  const [resultat, setResultat] = useState<{ nom: string; url: string } | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  async function creer() {
    if (!panier.length || creation) return
    setCreation(true)
    setErreur(null)
    setResultat(null)
    try {
      const date = new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      const nom = `Fouille du ${date} · ${angle || 'au fil de l’humeur'}`.slice(0, 100)
      const playlist = await creerPlaylist(
        nom,
        `Fouillé avec Spotifouille. Angle : ${angle || 'libre'}.`.slice(0, 300),
        panier.slice(0, PLAFOND_PLAYLIST).map((t) => t.piste.uri),
      )
      setResultat({ nom: playlist.name, url: playlist.external_urls.spotify })
      onViderPanier()
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La playlist n’est pas partie.')
    } finally {
      setCreation(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* La playlist en construction, en haut du panneau. */}
      <section
        aria-label="Playlist en construction"
        className="border-b border-white/5 bg-surface/40 px-3 py-3"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-bold tracking-[0.14em] text-texte-doux uppercase">
            Playlist en construction
          </h2>
          <span className="text-[11px] text-texte-doux tabular-nums">
            {panier.length} / {PLAFOND_PLAYLIST}
          </span>
        </div>

        {panier.length === 0 ? (
          <p className="mt-1.5 text-[13px] text-texte-doux">
            Rien dedans. Ajoute des morceaux depuis les cartes.
          </p>
        ) : (
          <>
            <ul className="mt-2 space-y-1">
              {panier.slice(0, PLAFOND_PLAYLIST).map((t) => (
                <li key={t.piste.uri} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onBasculerPanier(t)}
                    aria-label={`Retirer ${t.piste.name} de la playlist`}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-haute text-texte-doux transition-opacity hover:text-accent"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    <span className="text-texte-doux">{t.piste.artists[0]?.name}</span>
                    <span className="text-texte-doux/50"> · </span>
                    <span>{t.piste.name}</span>
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={creer}
              disabled={creation}
              className="mt-3 min-h-11 w-full rounded-full bg-accent px-4 text-sm font-bold text-fond transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {creation ? 'On grave…' : 'Créer dans Spotify'}
            </button>
          </>
        )}

        {resultat ? (
          <p className="mt-2 text-[13px]">
            <span className="text-texte-doux">Playlist privée créée. </span>
            <a
              href={resultat.url}
              target="_blank"
              rel="noreferrer noopener"
              className="font-semibold text-spotify-vert underline underline-offset-2"
            >
              Ouvrir dans Spotify
            </a>
          </p>
        ) : null}
        {erreur ? <p className="mt-2 text-[13px] text-accent-clair">{erreur}</p> : null}
      </section>

      {/* Les cartes de la proposition en cours. */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {trouvailles.length === 0 ? (
          <p className="mt-8 text-center text-[13px] text-texte-doux">
            {enCours ? 'On fouille…' : 'Les trouvailles apparaîtront ici.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {trouvailles.map((t) => (
              <li key={t.piste.uri}>
                <Carte
                  trouvaille={t}
                  verdict={verdicts[t.piste.uri] ?? null}
                  dansLaPlatine={panier.some((p) => p.piste.uri === t.piste.uri)}
                  onReagir={(v) => onReagir(t.piste.uri, v)}
                  onBasculerPlatine={() => onBasculerPanier(t)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-center gap-2 border-t border-white/5 py-2.5 text-[11px] text-texte-doux">
        <span>Métadonnées et lecture</span>
        <span className="text-spotify-vert">
          <LogoSpotify taille={16} />
        </span>
        <span>Spotify</span>
      </footer>
    </div>
  )
}
