/**
 * Post-build: copy sql.js WASM files to the static export directory.
 * The static export needs these served alongside the JS bundle so the
 * browser can load sql's WASM runtime.
 */
import { copyFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const dest = "out/sql-wasm";
if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

copyFileSync(resolve("node_modules/sql.js/dist/sql-wasm.wasm"), `${dest}/sql-wasm.wasm`);
copyFileSync(
  resolve("node_modules/sql.js/dist/sql-wasm-browser.wasm"),
  `${dest}/sql-wasm-browser.wasm`
);
console.log("WASM files copied to out/sql-wasm/");
