import { useState } from 'react'
import type { Trouvaille, Verdict } from '../types'
import { anneeDe, artistesDe, pochette } from '../lib/spotify/api'
import { demanderFiche } from '../lib/chat'
import { LogoSpotify } from './LogoSpotify'

const REACTIONS: { cle: Verdict; libelle: string; aide: string }[] = [
  { cle: 'adore', libelle: 'J’adore', aide: 'Bon fond, bonne forme' },
  { cle: 'connais', libelle: 'Je connais déjà', aide: 'Direction juste, creuse plus loin' },
  { cle: 'refus', libelle: 'Pas pour moi', aide: 'Mauvaise direction' },
  { cle: 'creuser', libelle: 'À creuser', aide: 'Intéressant sans être immédiat' },
]

interface Props {
  trouvaille: Trouvaille
  verdict: Verdict | null
  dansLaPlatine: boolean
  onReagir: (verdict: Verdict) => void
  onBasculerPlatine: () => void
}

export function Carte({ trouvaille, verdict, dansLaPlatine, onReagir, onBasculerPlatine }: Props) {
  const [fiche, setFiche] = useState<string | null>(null)
  const [chargeFiche, setChargeFiche] = useState(false)
  const [depliee, setDepliee] = useState(false)

  const { piste, candidat, cible } = trouvaille
  const image = pochette(piste)
  const annee = candidat.annee ?? anneeDe(piste)
  const titrePrincipal = cible === 'album' ? (piste.album?.name ?? piste.name) : piste.name
  const lien =
    cible === 'album' && piste.album?.id
      ? `https://open.spotify.com/album/${piste.album.id}`
      : piste.external_urls.spotify

  async function basculerFiche() {
    const ouvre = !depliee
    setDepliee(ouvre)
    if (!ouvre || fiche || chargeFiche) return
    setChargeFiche(true)
    try {
      setFiche(await demanderFiche(trouvaille))
    } catch {
      setFiche('La fiche n’est pas revenue. Réessaie en repliant puis en rouvrant.')
    } finally {
      setChargeFiche(false)
    }
  }

  return (
    <article className="surface-carte remontee overflow-hidden">
      <div className="flex gap-3 p-3">
        {/* Pochette : jamais recadrée, jamais recouverte, jamais de logo dessus. */}
        <button
          type="button"
          onClick={basculerFiche}
          aria-expanded={depliee}
          aria-label={`${depliee ? 'Replier' : 'Déplier'} la fiche de ${titrePrincipal}`}
          className="shrink-0 cursor-pointer transition-opacity hover:opacity-85"
        >
          {image ? (
            <img
              src={image.url}
              alt={`Pochette de ${piste.album?.name ?? titrePrincipal}`}
              width={96}
              height={96}
              loading="lazy"
              className="pochette size-20 sm:size-24"
            />
          ) : (
            <span className="pochette flex size-20 items-center justify-center text-texte-doux sm:size-24">
              <LogoSpotify taille={22} />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] leading-tight font-bold" title={titrePrincipal}>
            {titrePrincipal}
          </h3>
          <p className="truncate text-sm text-texte-doux" title={artistesDe(piste)}>
            {artistesDe(piste)}
          </p>
          <p className="mt-0.5 text-xs text-texte-doux/80">
            {annee ? <span>{annee}</span> : null}
            {annee && cible === 'album' ? <span> · </span> : null}
            {cible === 'album' ? <span>album</span> : null}
          </p>

          {candidat.pourquoi ? (
            <p className="mt-2 text-[13px] leading-snug text-texte/90">{candidat.pourquoi}</p>
          ) : null}

          <a
            href={lien}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex min-h-11 items-center gap-2 text-[11px] font-semibold tracking-wide text-spotify-vert uppercase transition-opacity hover:opacity-80"
          >
            <LogoSpotify taille={16} />
            Écouter sur Spotify
          </a>
        </div>
      </div>

      {depliee ? (
        <div className="border-t border-white/5 px-3 py-3 text-[13px] leading-relaxed text-texte/90">
          {chargeFiche ? (
            <p className="text-texte-doux">On sort la fiche…</p>
          ) : (
            (fiche ?? '').split(/\n{2,}/).map((paragraphe, i) => (
              <p key={i} className={i > 0 ? 'mt-2' : undefined}>
                {paragraphe}
              </p>
            ))
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-t border-white/5 p-2">
        {REACTIONS.map((r) => {
          const actif = verdict === r.cle
          return (
            <button
              key={r.cle}
              type="button"
              title={r.aide}
              aria-pressed={actif}
              onClick={() => onReagir(r.cle)}
              className={`min-h-11 flex-1 rounded-full px-2 text-[11px] font-semibold whitespace-nowrap transition-opacity ${
                actif
                  ? 'bg-accent text-fond'
                  : 'bg-surface-haute text-texte-doux hover:text-texte'
              }`}
            >
              {r.libelle}
            </button>
          )
        })}
        <button
          type="button"
          onClick={onBasculerPlatine}
          aria-pressed={dansLaPlatine}
          className={`min-h-11 w-full rounded-full px-3 text-[11px] font-semibold transition-opacity ${
            dansLaPlatine
              ? 'bg-accent-clair text-fond'
              : 'bg-surface-haute text-texte-doux hover:text-texte'
          }`}
        >
          {dansLaPlatine ? 'Retirer de la playlist' : 'Ajouter à la playlist'}
        </button>
      </div>
    </article>
  )
}
