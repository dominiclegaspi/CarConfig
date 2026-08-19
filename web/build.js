// Bundles the React frontend with esbuild directly (esbuild's JS API),
// producing public/main.js + public/main.css. No Vite/Next.js/webpack
// config required — esbuild alone is enough for a project this size and
// keeps the "how does this actually build" story simple to explain.
import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");

const options = {
  entryPoints: [path.join(__dirname, "src", "main.tsx")],
  bundle: true,
  outdir: path.join(__dirname, "..", "public"),
  entryNames: "main",
  jsx: "automatic",
  format: "esm",
  target: ["es2020"],
  sourcemap: true,
  minify: !watch,
  loader: { ".tsx": "tsx", ".ts": "ts" },
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("[web] watching for changes...");
} else {
  await esbuild.build(options);
  console.log("[web] build complete");
}
