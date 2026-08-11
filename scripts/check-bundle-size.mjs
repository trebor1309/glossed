import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const distRoot = path.join(projectRoot, "dist");
const html = await readFile(path.join(distRoot, "index.html"), "utf8");
const entrySource = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/)?.[1];

if (!entrySource) {
  throw new Error("Unable to locate the JavaScript entry chunk in dist/index.html.");
}

const entryPath = path.resolve(distRoot, entrySource.replace(/^\/+/, ""));
if (!entryPath.startsWith(`${distRoot}${path.sep}`)) {
  throw new Error("The JavaScript entry chunk resolves outside dist/.");
}

const maximumBytes = Number(process.env.BUNDLE_ENTRY_MAX_BYTES || 500_000);
const { size } = await stat(entryPath);
const sizeInKilobytes = (size / 1000).toFixed(2);
const maximumInKilobytes = (maximumBytes / 1000).toFixed(2);

console.log(`Entry bundle: ${path.basename(entryPath)} (${sizeInKilobytes} kB)`);

if (size > maximumBytes) {
  throw new Error(
    `Entry bundle exceeds its ${maximumInKilobytes} kB budget by ${(
      (size - maximumBytes) /
      1000
    ).toFixed(2)} kB.`
  );
}
