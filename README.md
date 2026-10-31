# Repz – Carnet de muscu

Version installable (PWA) de Repz : séances Push / Pull / Full body / Legs, charges et reps série par série, chronos de repos, progression, phases, modèles de séance et schémas des exercices.

- Les séances restent sur le téléphone (IndexedDB). Programme → Sauvegarde : exporter / restaurer dans un fichier.
- « Coller une séance reçue par message » utilise Claude avec la clé Anthropic de la personne, gardée sur l'appareil.

## Installer
Ouvrir le site dans Safari (iPhone) → Partager → « Sur l'écran d'accueil ».

## Développement
`src/repz.html` est l'appli ; `web/` contient le shim (`shim.js`), le service worker, le manifeste, les icônes et `seed.json` (séances reprises au premier lancement).
`python scripts/build.py` construit `_site/`, publié par GitHub Pages à chaque push sur `main`.
