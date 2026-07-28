import { useEffect, useRef } from 'react'
import type { Message } from '../types'

const AMORCES = [
  'Je suis d’humeur à me faire secouer',
  'Trouve-moi un album entier pour ce soir',
  'Un morceau que j’aurais dû connaître',
]

interface Props {
  messages: Message[]
  enCours: boolean
  onAmorce: (texte: string) => void
}

export function Conversation({ messages, enCours, onAmorce }: Props) {
  const bas = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bas.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, enCours])

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center px-4 py-8">
        <h1 className="text-3xl leading-none font-black tracking-tighter uppercase sm:text-4xl">
          On fouille
          <span className="text-accent">.</span>
        </h1>
        <p className="mt-3 max-w-md text-[15px] text-texte-doux">
          Pas de recommandation automatique. Un disquaire qui connaît tes 5 086 titres, tire un
          angle au hasard et attaque le catalogue par ce bord.
        </p>
        <ul className="mt-6 space-y-2">
          {AMORCES.map((a) => (
            <li key={a}>
              <button
                type="button"
                onClick={() => onAmorce(a)}
                className="min-h-11 w-full rounded-full bg-surface px-4 text-left text-sm text-texte transition-opacity hover:bg-surface-haute"
              >
                {a}
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 py-4">
      {messages.map((m, i) => (
        <div key={i} className={m.role === 'moi' ? 'flex justify-end' : undefined}>
          {m.role === 'moi' ? (
            <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-surface-haute px-3.5 py-2 text-[15px] break-words">
              {m.texte}
            </p>
          ) : (
            <div className="max-w-[95%]">
              {m.angle ? (
                <p className="mb-1 text-[11px] tracking-[0.12em] text-accent uppercase">
                  Angle : {m.angle}
                </p>
              ) : null}
              {m.texte
                .split(/\n{2,}/)
                .filter(Boolean)
                .map((paragraphe, j) => (
                  <p key={j} className={`text-[15px] leading-relaxed ${j > 0 ? 'mt-2' : ''}`}>
                    {paragraphe}
                  </p>
                ))}
            </div>
          )}
        </div>
      ))}
      {enCours ? (
        <p className="text-[13px] text-texte-doux" aria-live="polite">
          On fouille<span className="animate-pulse">…</span>
        </p>
      ) : null}
      <div ref={bas} />
    </div>
  )
}
