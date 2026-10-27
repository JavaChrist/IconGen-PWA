# IconGen PWA

## Présentation en une phrase
IconGen PWA est un outil web qui génère, directement dans le navigateur et à partir d'une seule image, l'ensemble des icônes nécessaires à un site ou une application (favicon, icônes iOS, icônes Android/PWA), pour les développeurs qui préparent un projet web.

## Public visé
Les développeuses et développeurs web (ou toute personne créant un site ou une application) qui doivent produire rapidement un jeu complet d'icônes conforme aux attentes des navigateurs, d'iOS et d'Android, sans mettre en place d'outillage dédié pour chaque projet.

## Problème résolu
Préparer manuellement toutes les tailles et formats d'icônes exigés (favicon multi-résolution, PNG à plusieurs tailles, icônes « maskable » Android, icônes d'écran d'accueil iOS) est répétitif et source d'erreurs. L'application automatise cette préparation à partir d'une image unique, avec des réglages de fond et de cadrage adaptés à chaque plateforme.

## Fonctionnalités principales
- Importer une ou plusieurs images (clic, glisser-déposer ou collage) et choisir un fond (couleur, transparence, ou fond spécifique pour iOS et pour les icônes Android « maskable »).
- Recadrer automatiquement les marges vides du logo (avec un réglage de zoom manuel) pour que les petites icônes restent lisibles.
- Générer en un clic une archive ZIP contenant toutes les tailles de PNG choisies, un `favicon.ico`, un `favicon.svg` et les icônes iOS.
- Visualiser un aperçu du rendu sur iOS et Android (avec repère de la zone de sécurité) avant de télécharger.
- Copier directement les extraits de code (manifest PWA et balises HTML) à intégrer dans son propre projet.

## Statut
**Disponible** en tant qu'outil fonctionnel : d'après l'examen du code, toutes les fonctionnalités listées ci-dessus sont implémentées et opérationnelles, le projet se construit sans erreur (`npm run build`) et ne dépend d'aucun service externe (tout s'exécute dans le navigateur).

Limites à noter : le recadrage automatique utilise une détection simple (transparence ou écart de couleur) qui peut être imprécise sur des visuels complexes, et aucun test automatisé n'est présent dans le dépôt. Ce statut concerne le fonctionnement du logiciel lui-même ; la disponibilité d'une version hébergée en ligne n'a pas pu être confirmée (voir ci-dessous).

## Adresse du site
À confirmer. Le dépôt contient un fichier `vercel.json` suggérant un déploiement prévu sur Vercel, mais aucune URL de production n'a été trouvée ni vérifiée dans les éléments du projet (code, configuration, ou page du dépôt GitHub).
