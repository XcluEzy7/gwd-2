import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const projectRoot = process.cwd();
if (!existsSync(join(projectRoot, "dist"))) {
  throw new Error("dist/ not found — run: npm run build");
}

type GlobalInstallSandbox = {
  env: NodeJS.ProcessEnv;
  gsdHome: string;
  homeDir: string;
  npmPrefix: string;
  rootDir: string;
};

function createGlobalInstallSandbox(prefix: string): GlobalInstallSandbox {
  const rootDir = mkdtempSync(join(tmpdir(), prefix));
  const homeDir = join(rootDir, "home");
  const gsdHome = join(rootDir, "custom-gsd-home");
  const npmPrefix = join(rootDir, "npm-prefix");
  const npmCache = join(rootDir, "npm-cache");

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(gsdHome, { recursive: true });
  mkdirSync(npmPrefix, { recursive: true });
  mkdirSync(npmCache, { recursive: true });

  return {
    rootDir,
    homeDir,
    gsdHome,
    npmPrefix,
    env: {
      ...process.env,
      HOME: homeDir,
      GSD_HOME: gsdHome,
      NPM_CONFIG_CACHE: npmCache,
      npm_config_cache: npmCache,
      NPM_CONFIG_PREFIX: npmPrefix,
      npm_config_prefix: npmPrefix,
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
      GSD_SKIP_RTK_INSTALL: "1",
    },
  };
}

function readRootPackage(): { name: string; version: string } {
  return JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as { name: string; version: string };
}

function runInstallScript(scriptName: string, sandbox: GlobalInstallSandbox): string {
  return execFileSync("node", [join(projectRoot, "scripts", scriptName)], {
    cwd: projectRoot,
    env: sandbox.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

function getGlobalPackagePath(sandbox: GlobalInstallSandbox, packageName: string): string {
  if (process.platform === "win32") {
    return join(sandbox.npmPrefix, "node_modules", packageName);
  }
  return join(sandbox.npmPrefix, "lib", "node_modules", packageName);
}

function getGlobalBinPath(sandbox: GlobalInstallSandbox, binName: string): string {
  if (process.platform === "win32") {
    return join(sandbox.npmPrefix, `${binName}.cmd`);
  }
  return join(sandbox.npmPrefix, "bin", binName);
}

test("dev global install links the root package and syncs resources into GSD_HOME", (t) => {
  const sandbox = createGlobalInstallSandbox("gsd-dev-global-install-");
  const pkg = readRootPackage();

  t.after(() => {
    rmSync(sandbox.rootDir, { recursive: true, force: true });
  });

  const output = runInstallScript("install-pi-global.js", sandbox);

  const globalPackagePath = getGlobalPackagePath(sandbox, pkg.name);
  const gsdBinPath = getGlobalBinPath(sandbox, "gsd");

  assert.match(output, /Installed GSD dev resources/, "install script reports GSD install");
  assert.ok(existsSync(join(sandbox.gsdHome, "agent", "extensions", "gsd")), "bundled gsd extension synced");
  assert.ok(existsSync(join(sandbox.gsdHome, "agent", "managed-dev-install.json")), "install marker written");
  assert.equal(existsSync(join(sandbox.homeDir, ".pi")), false, "legacy ~/.pi directory is not created");
  assert.ok(existsSync(globalPackagePath), "global package link created");
  assert.equal(realpathSync(globalPackagePath), projectRoot, "global package points at the local checkout");
  assert.ok(existsSync(gsdBinPath), "global gsd binary created");

  const version = execFileSync(gsdBinPath, ["--version"], {
    cwd: projectRoot,
    env: sandbox.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }).trim();
  assert.equal(version, pkg.version, "global gsd binary resolves and reports the package version");
});

test("dev global uninstall removes managed GSD install state but preserves user files", (t) => {
  const sandbox = createGlobalInstallSandbox("gsd-dev-global-uninstall-");
  const pkg = readRootPackage();
  const customUserExtensionDir = join(sandbox.gsdHome, "agent", "extensions", "custom-user-extension");
  const customUserFile = join(customUserExtensionDir, "index.js");

  t.after(() => {
    rmSync(sandbox.rootDir, { recursive: true, force: true });
  });

  runInstallScript("install-pi-global.js", sandbox);
  mkdirSync(customUserExtensionDir, { recursive: true });
  writeFileSync(customUserFile, "export default {};\n");

  const output = runInstallScript("uninstall-pi-global.js", sandbox);

  assert.match(output, /Removed GSD dev install state/, "uninstall script reports GSD cleanup");
  assert.equal(existsSync(getGlobalPackagePath(sandbox, pkg.name)), false, "global package link removed");
  assert.equal(existsSync(getGlobalBinPath(sandbox, "gsd")), false, "global gsd binary removed");
  assert.equal(existsSync(join(sandbox.gsdHome, "agent", "extensions", "gsd")), false, "managed bundled extension removed");
  assert.equal(existsSync(join(sandbox.gsdHome, "agent", "managed-dev-install.json")), false, "install marker removed");
  assert.ok(existsSync(customUserFile), "user-managed extension files are preserved");
  assert.equal(existsSync(join(sandbox.homeDir, ".pi")), false, "legacy ~/.pi directory remains unused");
});

test("canonical gsd global-install scripts point at the updated install helpers", () => {
  const pkg = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as { scripts?: Record<string, string> };

  assert.equal(pkg.scripts?.["gsd:install-global"], "node scripts/install-pi-global.js");
  assert.equal(pkg.scripts?.["gsd:uninstall-global"], "node scripts/uninstall-pi-global.js");
  assert.equal(pkg.scripts?.["pi:install-global"], "npm run gsd:install-global");
  assert.equal(pkg.scripts?.["pi:uninstall-global"], "npm run gsd:uninstall-global");

  const justfile = readFileSync(join(projectRoot, "justfile"), "utf8");
  assert.match(justfile, /npm run gsd:install-global/, "just install-global uses canonical GSD script");
  assert.match(justfile, /npm run gsd:uninstall-global/, "just uninstall-global uses canonical GSD script");
});

test("justfile install-global includes pack validation before dev-link", () => {
  const justfile = readFileSync(join(projectRoot, "justfile"), "utf8");

  // install-global should depend on validate (which runs validate-pack)
  const installGlobalMatch = justfile.match(/install-global[^:]*:\s*([^\n]+)/);
  assert.ok(installGlobalMatch, "install-global recipe found");

  const deps = installGlobalMatch[1];
  assert.ok(deps.includes("validate"), "install-global depends on validate recipe");

  // validate should run validate-pack
  const validateMatch = justfile.match(/validate[^:]*:[^\n]*\n\s+npm run validate-pack/);
  assert.ok(validateMatch, "validate recipe runs npm run validate-pack");
});

test("justfile separates runtime build from extra workspace builds", () => {
  const justfile = readFileSync(join(projectRoot, "justfile"), "utf8");

  // Should have build-extra-workspaces recipe
  assert.match(justfile, /build-extra-workspaces/, "build-extra-workspaces recipe exists");

  // The default build recipe should NOT include daemon/mcp-server/rpc-client
  const buildMatch = justfile.match(/# Build the root CLI package[^\n]*\nbuild[^:]*:[^\n]*\n\s+npm run build/);
  assert.ok(buildMatch, "build recipe is runtime-focused (root CLI only)");

  // build-extra-workspaces should mention the extra packages
  assert.match(justfile, /@gsd-build\/daemon/, "build-extra-workspaces mentions daemon");
  assert.match(justfile, /@gsd-build\/mcp-server/, "build-extra-workspaces mentions mcp-server");
  assert.match(justfile, /@gsd-build\/rpc-client/, "build-extra-workspaces mentions rpc-client");
});

test("justfile provides self-check recipe for repo diagnostics", () => {
  const justfile = readFileSync(join(projectRoot, "justfile"), "utf8");

  assert.match(justfile, /self-check[^:]*:/, "self-check recipe exists");
  assert.match(justfile, /validate-pack/, "self-check runs validate-pack");
});
