import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Spécifique au projet :
    // Copies complètes de l'appli créées par Claude Code : ESLint ne lit
    // pas .git/info/exclude et les linterait en double.
    ".claude/**",
    "prisma/migrations/**",
  ]),
  // Convention équipe : un nom de variable / paramètre / catch préfixé par
  // un underscore (`_foo`) signale "intentionnellement inutilisé". Évite de
  // devoir supprimer un paramètre conservé pour symétrie d'API ou pour le
  // typage. C'est une convention TypeScript/Rust standard.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // Règle arrivée avec eslint-plugin-react-hooks 7, postérieure au socle.
      // Gardée visible en warning plutôt qu'en erreur : les occurrences
      // restantes ne coûtent qu'un rendu supplémentaire, à traiter au fil des
      // passages sur les composants concernés et non en refactor de masse.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
