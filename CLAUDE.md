# Projet : Spotifouille

Assistant de découverte musicale personnel. Usage strictement personnel, un seul
utilisateur. Claude est le moteur de recommandation, Spotify ne sert qu'à vérifier
l'existence des morceaux et à écrire les playlists.

## Commandes

- Build : `npm run build`
- Dev : `npm run dev`
- Lint : `npm run lint`
- Profil : `node scripts/build-profile.mjs`

## Stack

- React + Vite + TypeScript
- Tailwind v4 : PAS de `tailwind.config.js`. Config en CSS via `@theme`.
  Import unique `@import "tailwindcss";`. Plugin `@tailwindcss/vite`.
- Netlify. Functions en ESM v2, réponse en flux.
- Aucune bibliothèque de composants tierce.

## API Spotify : IMPORTANT, ton entraînement est périmé

- `/recommendations`, `/audio-features`, `/audio-analysis`, `/related-artists`,
  `/browse/featured-playlists`, `/browse/categories/{id}/playlists` :
  SUPPRIMÉS depuis novembre 2024. 403. Aucun remplacement. Ne les appelle jamais.
- Supprimés en février 2026 : `/artists/{id}/top-tracks`, `/browse/new-releases`,
  `/markets`, `/users/{id}`, `/users/{id}/playlists`.
- `POST /users/{id}/playlists` est devenu `POST /me/playlists`
- `/playlists/{id}/tracks` est devenu `/playlists/{id}/items` (GET, POST, DELETE)
- Objet Playlist : `tracks` -> `items`, `tracks.items.track` -> `items.items.item`
- `PUT /me/tracks`, `/me/albums`, `/me/following` -> `PUT /me/library` (liste d'URI).
  Idem `DELETE /me/library` et `GET /me/library/contains`.
- `GET /search` : limit maximum **10**, défaut 5. Toute pagination en limit=50 échoue.
- Champs disparus des réponses : `popularity`, `available_markets`, `followers`,
  `linked_from`, et sur User : `country`, `email`, `product`, `explicit_content`.
  Impossible de détecter Premium par API. `external_ids` est disponible.
- Pas d'endpoint multi-objets : `/tracks`, `/artists`, `/albums` au pluriel sont
  supprimés. Un objet à la fois.
- `genres` sur Artist existe encore. Code une dégradation propre s'il arrive vide.
- Auth : Authorization Code + PKCE uniquement. Le flux implicite est mort.
- Le refresh token tourne à chaque usage : TU DOIS réécrire le nouveau, sinon la
  session meurt au bout d'une heure et ne revient jamais.
- Redirection locale : `http://127.0.0.1:5173/callback`. JAMAIS `localhost`, refusé.

## Données

- `data/playlist.csv` : export Exportify enrichi, 24 colonnes, 5 087 lignes,
  BOM UTF-8. Colonne de genres nommée `Genres` et pas `Artist Genres`.
  Séparateur multi-artistes : `;` uniquement. Ne découpe jamais sur la virgule,
  elle fait partie de noms comme « Earth, Wind & Fire ».
- `src/data/empreinte.json` : 22 Ko, part dans chaque appel à l'API Anthropic.
  Ne le grossis pas. Cible dure : 25 Ko.
- `public/data/bibliotheque.json` : 259 Ko, les 5 086 identifiants et 4 774 clés
  « artiste::titre » normalisées. Sert au mode Terra incognita côté navigateur.
  Chargé par `fetch`, jamais importé dans le bundle, JAMAIS envoyé à l'API Anthropic.
- Les genres du CSV sont en français (« rap français »), l'API Spotify répond en
  anglais (« french hip hop »). Dis-le à Claude dans le prompt, ne construis pas
  de table de correspondance.
- `scripts/build-profile.mjs` est déterministe : aucun `Math.random`, tri de
  départage explicite partout. Deux exécutions donnent le même octet. Garde-le ainsi.

## Règles non négociables

- SÉCURITÉ : `ANTHROPIC_API_KEY` jamais côté navigateur, jamais de préfixe `VITE_`.
- Les jetons Spotify restent dans le navigateur, jamais transmis à la Function.
- Aucun titre n'arrive à l'écran sans avoir été résolu par la recherche Spotify.
- Jamais de `dangerouslySetInnerHTML`. Les noms d'artistes contiennent n'importe quoi.
- Pochettes jamais recadrées, jamais recouvertes. Coins 4px mobile, 8px desktop.
- Le vert `#1DB954` sert uniquement au bouton « Écouter sur Spotify » et au logo
  d'attribution. Nulle part ailleurs.
- Chaque carte porte un lien « ÉCOUTER SUR SPOTIFY ». Logo Spotify en pied de page.
- Jamais plus de 20 éléments dans un même ensemble de contenu.
- Mobile-first, boutons tactiles 44px, contraste 4.5:1, balises sémantiques.
- Avant de dire que c'est fini : `npm run build` sans AUCUNE erreur.

## Palette

```css
--fond: #0B0B0C;          --surface: #141416;      --surface-haute: #1D1D20;
--texte: #F2F0EB;         --texte-doux: #9C9A94;
--accent: #FF7A18;        --accent-clair: #FFB300; --spotify-vert: #1DB954;
```

Titres en Archivo 800-900, interlettrage négatif. Interface en Inter 400-600.
Transitions de 150 à 200 ms, sur l'opacité et la position uniquement.

## Modèles

- Conversation et recommandations : `claude-sonnet-5`, max_tokens 1500
- Fiches « pourquoi ce morceau » et réécriture du profil : `claude-haiku-4-5-20251001`,
  max_tokens 400
- Mise en cache du prompt activée sur le bloc statique (empreinte + profil).

## Rédaction et microcopy (interface en français)

- Tutoiement partout.
- Aucun participe présent employé comme verbe.
- Aucun anglicisme à la mode.
- Guillemets français « » uniquement.
- Aucun tiret cadratin.
- Ton direct, vivant, un peu disquaire. Jamais corporate.
- Vocabulaire : « fouille », « angle », « platine », « terrain ».

## Compactage

- Quand tu compactes, garde la liste des fichiers modifiés, les commandes de test,
  et les blocs « API Spotify » et « Données » ci-dessus.
