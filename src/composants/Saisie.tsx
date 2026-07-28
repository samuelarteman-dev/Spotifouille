import { useRef, useState } from 'react'
import type { Reglages } from '../types'

interface Props {
  reglages: Reglages
  angle: string
  enCours: boolean
  onEnvoyer: (texte: string) => void
  onReglages: (reglages: Reglages) => void
}

export function Saisie({ reglages, angle, enCours, onEnvoyer, onReglages }: Props) {
  const [texte, setTexte] = useState('')
  const zone = useRef<HTMLTextAreaElement>(null)

  function envoyer() {
    const propre = texte.trim()
    if (!propre || enCours) return
    onEnvoyer(propre)
    setTexte('')
    if (zone.current) zone.current.style.height = 'auto'
  }

  return (
    <div className="border-t border-white/5 bg-fond px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-end gap-2">
        <label htmlFor="saisie" className="sr-only">
          Ce que tu cherches
        </label>
        <textarea
          id="saisie"
          ref={zone}
          rows={1}
          value={texte}
          placeholder="Dis-moi où tu veux aller…"
          onChange={(e) => {
            setTexte(e.target.value.slice(0, 2000))
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              envoyer()
            }
          }}
          className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl bg-surface px-3.5 py-2.5 text-[15px] text-texte placeholder:text-texte-doux/70 focus:outline-none"
        />
        <button
          type="button"
          onClick={envoyer}
          disabled={enCours || !texte.trim()}
          aria-label="Envoyer"
          className="size-11 shrink-0 rounded-full bg-accent text-lg font-bold text-fond transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <span aria-hidden="true">↑</span>
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Interrupteur de terrain, visible en permanence. */}
        <button
          type="button"
          role="switch"
          aria-checked={reglages.terrain === 'incognita'}
          onClick={() =>
            onReglages({
              ...reglages,
              terrain: reglages.terrain === 'incognita' ? 'connu' : 'incognita',
            })
          }
          className="flex min-h-11 items-center gap-2 text-[11px] font-semibold tracking-wide uppercase"
        >
          <span
            className={`flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
              reglages.terrain === 'incognita' ? 'bg-accent' : 'bg-surface-haute'
            }`}
          >
            <span
              className={`size-4 rounded-full bg-fond transition-transform ${
                reglages.terrain === 'incognita' ? 'translate-x-4' : ''
              }`}
            />
          </span>
          <span className={reglages.terrain === 'incognita' ? 'text-texte' : 'text-texte-doux'}>
            {reglages.terrain === 'incognita' ? 'Terra incognita' : 'Terrain connu'}
          </span>
        </button>

        <div className="flex min-h-11 flex-1 items-center gap-2 sm:min-w-52">
          <label
            htmlFor="exploration"
            className="text-[11px] font-semibold tracking-wide text-texte-doux uppercase"
          >
            Explo
          </label>
          <input
            id="exploration"
            type="range"
            min={0}
            max={100}
            step={5}
            value={reglages.exploration}
            onChange={(e) => onReglages({ ...reglages, exploration: Number(e.target.value) })}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-surface-haute accent-accent"
          />
          <output
            htmlFor="exploration"
            className="w-8 text-right text-[11px] text-texte-doux tabular-nums"
          >
            {reglages.exploration}
          </output>
        </div>
      </div>

      {angle ? (
        <p className="mt-1 truncate text-[11px] text-texte-doux/80">
          Angle en cours : <span className="text-accent">{angle}</span>
        </p>
      ) : null}
    </div>
  )
}
