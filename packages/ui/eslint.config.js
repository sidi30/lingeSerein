// Configuration React, et non la base : ce paquet contient des composants JSX,
// et ses générateurs PDF désactivent `jsx-a11y/alt-text` en ligne (les `<Image>`
// de @react-pdf n'ont pas d'attribut alt). Sur la config de base, le plugin
// n'est pas enregistré : ESLint 9 refuse alors de désactiver une règle qu'il ne
// connaît pas, et le lint du paquet échouait en bloc.
const reactConfig = require("@lingengo/eslint-config/react");

module.exports = [...reactConfig];
