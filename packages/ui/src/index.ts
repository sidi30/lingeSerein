/**
 * @lingengo/ui
 * Design system partagé — tokens de couleurs, spacings, composants de base.
 *
 * NOTE: DevisDocument et downloadDevisPdf sont dans ./devis-pdf (import dynamique recommandé).
 */

export * from "./tokens";
// Ne pas re-exporter devis-pdf ici : @react-pdf/renderer ne doit pas
// être inclus dans le bundle SSR/initial. Importer dynamiquement :
// const { downloadDevisPdf } = await import("@lingengo/ui/devis-pdf")
