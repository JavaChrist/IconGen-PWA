# IconGen PWA

Générateur d'icônes et de favicons pour sites web et PWA, qui fonctionne **entièrement dans le navigateur** (aucune image n'est envoyée à un serveur).

## Objectif et public

IconGen PWA s'adresse aux développeuses et développeurs web (ou à toute personne qui construit un site ou une application) ayant besoin de produire rapidement l'ensemble des icônes attendues par les navigateurs, iOS et Android à partir d'une seule image source : favicon, icônes PWA (y compris « maskable » pour Android), icônes d'écran d'accueil iOS, et extraits de code prêts à coller.

L'outil évite de configurer manuellement des scripts de redimensionnement ou des générateurs externes pour chaque projet.

## Fonctionnalités

### ✅ Opérationnelles (vérifiées dans le code)

- **Import d'image(s)** par clic, glisser-déposer sur la zone dédiée, ou collage (Ctrl+V) ; plusieurs fichiers peuvent être importés en une fois (« mode lot »), avec une bande de miniatures pour changer l'image actuellement prévisualisée.
- **Réglages du fond** : couleur personnalisée (sélecteur + palette de couleurs prédéfinies) ou fond transparent.
- **Fond blanc dédié aux icônes iOS** (case à cocher), car iOS n'affiche pas correctement les icônes transparentes.
- **Fond opaque dédié aux icônes Android « maskable » (192/512 px)** (case à cocher, activée par défaut) : évite que ces icônes restent transparentes même si le fond général l'est, ce qui pose problème avec le masque appliqué par les launchers Android.
- **Recadrage automatique des marges vides/transparentes** autour du logo, pour que le motif remplisse mieux les petites icônes (favicon 16/32 px), plus un **curseur de zoom manuel (100–200 %)** pour affiner.
- **Liste de tailles PNG personnalisable** (champ texte, ex. `16,32,48,...`), avec repli automatique sur une liste par défaut (16, 32, 48, 64, 96, 128, 192, 256, 384, 512 px) si la saisie est vide ou invalide.
- **Génération d'un `favicon.ico` multi-résolution (16/32/48 px)**, construit directement en JavaScript (encodage binaire du format ICO fait « maison », sans dépendance externe côté navigateur).
- **Génération d'un `favicon.svg`** (PNG haute résolution encapsulé dans un conteneur SVG), pour les navigateurs modernes qui le préfèrent au `.ico`.
- **Génération des icônes iOS** : `apple-touch-icon.png` (180 px) et `apple-touch-icon-3d.png` (192 px).
- **Export de deux extraits de code prêts à coller**, avec bouton « Copier » : un extrait de manifest PWA (JSON) et des balises `<head>` HTML (favicons, apple-touch-icon, `theme-color`), tous deux générés dynamiquement selon la couleur de fond choisie.
- **Aperçus en direct** (64/192/512 px) et **modale de simulation iOS/Android**, avec un repère visuel de la « zone de sécurité » (~80 %) des icônes maskable Android.
- **Téléchargement d'une archive ZIP** : `icons-pwa.zip` pour une image, `icons-pwa-batch.zip` (avec un sous-dossier par image) en mode lot.
- **Barre de progression textuelle** pendant la génération du ZIP.
- **Persistance des réglages** dans le `localStorage` du navigateur (fond, transparence, tailles, options iOS/maskable/recadrage/zoom), avec un bouton « Réinitialiser ».
- **Gestion d'erreurs visible** : bannière affichée en cas de fichier illisible ou d'échec pendant la génération.
- **Accessibilité clavier** sur la zone de dépôt (navigable/activable au clavier) et libellés `aria-label` sur les éléments interactifs principaux.
- **L'application elle-même est une PWA installable** (manifeste + service worker générés par `vite-plugin-pwa`), utilisée ici pour « se tester elle-même ».
- **Confidentialité** : tout le traitement (lecture de fichier, redimensionnement, encodage ICO/SVG, création du ZIP) s'exécute côté client, sans aucun appel réseau ni upload.

### ⚠️ Partielles / limites connues

- Le recadrage automatique repose sur une heuristique simple (transparence du canal alpha, ou écart de couleur par rapport au coin de l'image s'il n'y a pas de transparence) : il peut être imprécis sur des logos complexes sans fond uni ni alpha.
- La validation de la liste de tailles se limite à une plage (8–2048 px) sans retour visuel détaillé sur les valeurs rejetées.
- Le thème visuel est sombre par défaut avec une légère adaptation au mode clair du système (`prefers-color-scheme`), mais il n'y a pas de bouton de bascule de thème.
- Aucun test automatisé (unitaire ou end-to-end) n'est présent dans le dépôt.

### ❌ Non implémentées

- Aucun compte utilisateur, aucune authentification, aucune sauvegarde en ligne des projets/réglages au-delà du `localStorage` local.
- Aucune API ni backend applicatif : les seuls scripts côté serveur sont des outils Node en ligne de commande internes (voir ci-dessous), non exposés dans l'interface web.

## Stack technique

- **Framework** : React 19 + Vite 7
- **PWA** : `vite-plugin-pwa` (génération du manifeste et du service worker)
- **Génération d'archive** : `jszip`
- **Téléchargement** : `file-saver`
- **Qualité de code** : ESLint (config plate `eslint.config.js`), `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- **Scripts Node internes** (maintenance de l'app elle-même, pas une fonctionnalité de l'interface) : `sharp`, `png-to-ico`
- Aucune base de données, aucun backend, aucun service tiers (API, auth, analytics) détecté dans le code.

## Installation

```bash
cd icongen-pwa
npm install
```

## Configuration

Aucune variable d'environnement n'est nécessaire : le code ne lit aucun fichier `.env` et n'appelle aucun service externe nécessitant une clé.

## Commandes utiles

| Commande | Description |
| --- | --- |
| `npm run dev` | Lance le serveur de développement Vite |
| `npm run build` | Build de production dans `dist/` |
| `npm run preview` | Prévisualise le build de production |
| `npm run lint` | Vérifie le code avec ESLint |
| `npm run icons:gen` | Régénère les icônes statiques de l'app (`public/logo*.png`) à partir de `public/logo512.png` via `sharp` |
| `npm run icons:favicon` | Régénère `public/favicon.ico` à partir de `logo16/32/48.png` via `png-to-ico` |

> Les deux dernières commandes sont des **outils de maintenance internes** : elles fabriquent les icônes propres à IconGen PWA (celles affichées dans l'onglet du navigateur et sur l'écran d'accueil de l'app). Elles ne sont pas liées à la fonctionnalité de génération d'icônes proposée aux utilisateurs dans l'interface, qui fonctionne entièrement dans le navigateur.

## Déploiement

Un fichier `vercel.json` configure des en-têtes HTTP adaptés au service worker (`sw.js`, `workbox-*.js`, `registerSW.js` non mis en cache) et au `manifest.webmanifest` (type MIME correct), ce qui indique un déploiement prévu sur **Vercel**. Aucune URL de production vérifiable n'a été trouvée dans le dépôt — voir `FICHE_IDENTITE.md`.

## Structure du projet

```
icongen-pwa/
├─ src/
│  ├─ App.jsx       # Composant unique : toute la logique et l'interface
│  ├─ App.css       # Styles spécifiques (partiellement hérités du template)
│  ├─ index.css     # Styles globaux (thème sombre par défaut)
│  └─ main.jsx      # Point d'entrée React
├─ public/          # Icônes statiques et ressources de l'app elle-même
├─ scripts/         # Scripts Node internes de génération d'icônes (voir ci-dessus)
├─ vite.config.js   # Configuration Vite + vite-plugin-pwa (manifeste PWA)
├─ vercel.json      # En-têtes HTTP pour le déploiement Vercel
└─ index.html       # Balises favicons/iOS/PWA du head
```
