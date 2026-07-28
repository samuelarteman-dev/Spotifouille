/**
 * Accès à localStorage, avec dégradation propre.
 * Navigation privée, quota plein, stockage désactivé : on ne plante pas,
 * on perd juste la mémoire entre deux sessions.
 */

export function lire<T>(cle: string, defaut: T): T {
  try {
    const brut = localStorage.getItem(cle)
    if (brut === null) return defaut
    return JSON.parse(brut) as T
  } catch {
    return defaut
  }
}

export function ecrire(cle: string, valeur: unknown): void {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur))
  } catch {
    // Quota dépassé ou stockage refusé : tant pis, on continue.
  }
}

export function effacer(cle: string): void {
  try {
    localStorage.removeItem(cle)
  } catch {
    // idem
  }
}
