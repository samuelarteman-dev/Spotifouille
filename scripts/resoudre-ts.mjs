/**
 * Crochet de résolution pour les scripts de test.
 *
 * Node exige une extension explicite dans les spécificateurs ESM ; Vite, non.
 * Plutôt que d'imposer « ../lib/texte.ts » à toute l'application pour faire
 * tourner un script, on ajoute l'extension ici, au moment de la résolution.
 * Ce fichier ne part jamais dans le bundle.
 *
 * Usage : node --import ./scripts/resoudre-ts.mjs scripts/test-resolution.mts
 */

import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve as joindre } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const EXTENSIONS = ['.ts', '.tsx', '.mts']

registerHooks({
  resolve(specificateur, contexte, suivant) {
    const relatif = specificateur.startsWith('.')
    const sansExtension = !/\.[a-z0-9]+$/i.test(specificateur)

    if (relatif && sansExtension && contexte.parentURL?.startsWith('file:')) {
      const base = dirname(fileURLToPath(contexte.parentURL))
      for (const extension of EXTENSIONS) {
        const candidat = joindre(base, specificateur + extension)
        // On ne fixe pas « format » : Node doit déduire du suffixe .ts qu'il
        // faut retirer les types, au lieu de traiter le fichier en JavaScript.
        if (existsSync(candidat)) {
          return { url: pathToFileURL(candidat).href, shortCircuit: true }
        }
      }
    }
    return suivant(specificateur, contexte)
  },
})
