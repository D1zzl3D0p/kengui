import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(entryPath);
      return /\.(?:ts|tsx)$/.test(entry.name) ? [entryPath] : [];
    }),
  );
  return files.flat();
}

test("web and desktop are separate shells around shared packages", async () => {
  const requiredFiles = [
    "apps/web/index.html",
    "apps/web/src/main.tsx",
    "apps/web/vite.config.ts",
    "apps/desktop/index.html",
    "apps/desktop/src/main.tsx",
    "apps/desktop/vite.config.ts",
    "apps/desktop/src-tauri/tauri.conf.json",
    "packages/app/src/App.tsx",
    "packages/platform/src/index.ts",
    "packages/ui/src/index.ts",
  ];

  await Promise.all(
    requiredFiles.map(async (file) => {
      await assert.doesNotReject(() => readFile(path.join(root, file)), file);
    }),
  );
});

test("Tauri imports stay behind the platform or desktop boundaries", async () => {
  const sharedDirectories = ["packages/app/src", "packages/ui/src"];
  const files = (
    await Promise.all(
      sharedDirectories.map((directory) => sourceFiles(path.join(root, directory))),
    )
  ).flat();

  const violations = [];
  for (const file of files) {
    const contents = await readFile(file, "utf8");
    if (contents.includes("@tauri-apps/")) {
      violations.push(path.relative(root, file));
    }
  }

  assert.deepEqual(violations, []);
});

test("the shared stylesheet scans shared React sources for Tailwind utilities", async () => {
  const stylesheet = await readFile(
    path.join(root, "packages/app/src/index.css"),
    "utf8",
  );

  assert.match(stylesheet, /@source\s+["']\.\/\*\*\/\*\.\{ts,tsx\}["'];/);
});

test("web and desktop shells load build configuration from the repository env", async () => {
  const configs = ["apps/web/vite.config.ts", "apps/desktop/vite.config.ts"];

  for (const config of configs) {
    const contents = await readFile(path.join(root, config), "utf8");
    assert.match(contents, /envDir:\s*repoRoot/, config);
  }
});

test("tooling aliases resolve package directories after the workspace move", async () => {
  const tsconfig = await readFile(path.join(root, "tsconfig.json"), "utf8");
  const components = JSON.parse(await readFile(path.join(root, "components.json"), "utf8"));

  assert.equal(components.aliases.ui, "@ui");
  assert.match(tsconfig, /"@ui":\s*\["\.\/packages\/ui\/src"\]/);
  await assert.doesNotReject(() => readdir(path.resolve(root, "packages/ui/src")));
});

test("desktop packaging paths stay aligned with the relocated shell", async () => {
  const tauriRoot = path.join(root, "apps/desktop/src-tauri");
  const tauriConfig = JSON.parse(
    await readFile(path.join(tauriRoot, "tauri.conf.json"), "utf8"),
  );
  const desktopVite = await readFile(
    path.join(root, "apps/desktop/vite.config.ts"),
    "utf8",
  );

  assert.match(desktopVite, /outDir:\s*path\.resolve\(repoRoot, ['"]dist\/desktop['"]\)/);
  assert.equal(
    path.resolve(tauriRoot, tauriConfig.build.frontendDist),
    path.join(root, "dist/desktop"),
  );
  assert.equal(tauriConfig.build.devUrl, "http://localhost:1420");
  for (const icon of tauriConfig.bundle.icon) {
    await assert.doesNotReject(() => readFile(path.resolve(tauriRoot, icon)), icon);
  }
});

test("current operational docs use monorepo paths and available scripts", async () => {
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const cloudAuth = await readFile(path.join(root, "docs/cloud-auth.md"), "utf8");
  const checks = await readFile(path.join(root, "docs/checks.md"), "utf8");

  assert.doesNotMatch(cloudAuth, /`src\//);
  assert.match(cloudAuth, /`packages\/app\/src\/auth\/supabaseClient\.ts`/);
  assert.ok(packageJson.scripts["contract:generate"]);
  assert.match(checks, /npm run contract:generate/);
  assert.doesNotMatch(checks, /npm run contract:openapi/);
});
