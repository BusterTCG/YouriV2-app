/**
 * Constantes UI pour les artistes Pangee.
 *
 * Différence Pangee vs KuroNeko (validée Stan 2026-05-26) : Pangee va gérer
 * 50+ artistes dans Youri V2. Avoir des couleurs distinctes par artiste perd
 * son sens passé un certain volume — les badges deviennent un nuage chaotique.
 *
 * → On force une couleur UNIQUE pour tous les artistes (#2563eb, blue-600
 *   Tailwind). Le champ `Artist.color` reste en BDD pour compat et au cas
 *   où on change d'avis, mais l'UI n'expose plus le picker. La création et
 *   la modif n'éditent plus la couleur — toujours bleu Pangee.
 */
export const PANGEE_ARTIST_COLOR = "#2563eb";
