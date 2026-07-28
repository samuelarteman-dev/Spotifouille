import { useEffect, useState } from 'react'
import { LONGUEUR_MAX } from '../lib/memoire/profil'
import { bilanParAngle } from '../lib/memoire/journal'
import type { EntreeJournal } from '../types'

interface Props {
  ouvert: boolean
  profil: string
  journal: EntreeJournal[]
  onFermer: () => void
  onProfil: (texte: string) => void
  onViderJournal: () => void
  onDeconnexion: () => void
}

/**
 * Le panneau ne rend rien tant qu'il est fermé. Le contenu vit donc dans un
 * composant à part : il se monte à l'ouverture, ce qui initialise le brouillon
 * du profil sans effet de synchronisation.
 */
export function Reglages(props: Props) {
  if (!props.ouvert) return null
  return <PanneauReglages {...props} />
}

function PanneauReglages({
  profil,
  journal,
  onFermer,
  onProfil,
  onViderJournal,
  onDeconnexion,
}: Props) {
  const [brouillon, setBrouillon] = useState(profil)
  const [confirmeVidage, setConfirmeVidage] = useState(false)

  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer()
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [onFermer])

  const bilan = bilanParAngle(journal)
  const angles = Object.entries(bilan).sort((a, b) => {
    const score = (v: Record<string, number>) => (v.adore ?? 0) - (v.refus ?? 0)
    return score(b[1]) - score(a[1])
  })

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-fond/80 backdrop-blur-sm"
      onClick={onFermer}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Réglages"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-surface"
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-white/5 bg-surface px-4 py-3">
          <h2 className="text-lg font-black tracking-tight uppercase">Réglages</h2>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer les réglages"
            className="size-11 rounded-full bg-surface-haute text-texte-doux transition-opacity hover:text-texte"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="space-y-6 p-4">
          <div>
            <label htmlFor="profil" className="text-[11px] font-bold tracking-[0.14em] uppercase">
              Profil appris
            </label>
            <p className="mt-1 text-[13px] text-texte-doux">
              Réécrit après chaque échange. Corrige à la main ce qui est faux.
            </p>
            <textarea
              id="profil"
              value={brouillon}
              maxLength={LONGUEUR_MAX}
              rows={10}
              onChange={(e) => setBrouillon(e.target.value)}
              className="mt-2 w-full resize-y rounded-lg bg-fond p-3 text-[13px] leading-relaxed focus:outline-none"
              placeholder="Vide pour l’instant. Il se remplira tout seul."
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-texte-doux tabular-nums">
                {brouillon.length} / {LONGUEUR_MAX}
              </span>
              <button
                type="button"
                onClick={() => onProfil(brouillon)}
                disabled={brouillon === profil}
                className="min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-fond transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Enregistrer
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-[11px] font-bold tracking-[0.14em] uppercase">
              Journal · {journal.length} titres
            </h3>
            {angles.length ? (
              <table className="mt-2 w-full text-[13px]">
                <caption className="sr-only">Réactions par angle de fouille</caption>
                <thead>
                  <tr className="text-[11px] text-texte-doux uppercase">
                    <th scope="col" className="py-1 text-left font-semibold">
                      Angle
                    </th>
                    <th scope="col" className="py-1 text-right font-semibold">
                      Adoré
                    </th>
                    <th scope="col" className="py-1 text-right font-semibold">
                      Connu
                    </th>
                    <th scope="col" className="py-1 text-right font-semibold">
                      Non
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {angles.map(([angle, v]) => (
                    <tr key={angle} className="border-t border-white/5">
                      <td className="py-1.5 pr-2">{angle}</td>
                      <td className="py-1.5 text-right tabular-nums">{v.adore}</td>
                      <td className="py-1.5 text-right tabular-nums">{v.connais}</td>
                      <td className="py-1.5 text-right tabular-nums">{v.refus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="mt-1 text-[13px] text-texte-doux">
                Aucune réaction pour l’instant. Le tableau se remplira dès que tu réagiras aux
                cartes.
              </p>
            )}

            {confirmeVidage ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onViderJournal()
                    setConfirmeVidage(false)
                  }}
                  className="min-h-11 flex-1 rounded-full bg-accent px-4 text-sm font-bold text-fond"
                >
                  Confirmer le vidage
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmeVidage(false)}
                  className="min-h-11 flex-1 rounded-full bg-surface-haute px-4 text-sm font-semibold text-texte-doux"
                >
                  Annuler
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmeVidage(true)}
                className="mt-3 min-h-11 w-full rounded-full bg-surface-haute px-4 text-sm font-semibold text-texte-doux transition-opacity hover:text-texte"
              >
                Vider le journal
              </button>
            )}
          </div>

          <div className="border-t border-white/5 pt-4">
            <button
              type="button"
              onClick={onDeconnexion}
              className="min-h-11 w-full rounded-full bg-surface-haute px-4 text-sm font-semibold text-texte-doux transition-opacity hover:text-texte"
            >
              Déconnecter Spotify
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
