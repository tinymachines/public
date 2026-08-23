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

    // Die Runner's modules, copied byte for byte from tinymachines/6502 apart
    // from one documented line. They are vanilla ES modules and the console is
    // tested where it lives, so linting them here buys nothing and costs the
    // property that makes the copy trustworthy: react-hooks/rules-of-hooks
    // fires on a plain function called useCart(), and "fixing" that would mean
    // renaming a function in a file whose whole value is being identical to
    // the original. A fork starts with one rename.
    //
    // public/engine/ is deliberately NOT ignored: tm6502.mjs is written here.
    "public/6502/games/**",
  ]),
]);

export default eslintConfig;
