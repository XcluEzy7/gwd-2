#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const resourcesDir = join(projectRoot, 'src', 'resources')
const gsdRoot = process.env.GSD_HOME || join(os.homedir(), '.gsd')
const agentDir = join(gsdRoot, 'agent')
const installMarkerPath = join(agentDir, 'managed-dev-install.json')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const packageName = packageJson.name

function fallbackSyncResources() {
  mkdirSync(agentDir, { recursive: true })

  const copyDir = (name) => {
    const src = join(resourcesDir, name)
    const dest = join(agentDir, name)
    if (!existsSync(src)) return false
    mkdirSync(dest, { recursive: true })
    cpSync(src, dest, { recursive: true, force: true })
    return true
  }

  const copied = []
  if (copyDir('extensions')) copied.push('extensions')
  if (copyDir('agents')) copied.push('agents')

  const workflowSrc = join(resourcesDir, 'GSD-WORKFLOW.md')
  if (existsSync(workflowSrc)) {
    writeFileSync(join(agentDir, 'GSD-WORKFLOW.md'), readFileSync(workflowSrc))
    copied.push('GSD-WORKFLOW.md')
  }

  return copied
}

async function syncManagedResources() {
  const distLoaderPath = join(projectRoot, 'dist', 'resource-loader.js')
  if (existsSync(distLoaderPath)) {
    const resourceLoader = await import(pathToFileURL(distLoaderPath).href)
    if (typeof resourceLoader.initResources === 'function') {
      resourceLoader.initResources(agentDir)
      return ['extensions', 'agents', 'GSD-WORKFLOW.md']
    }
  }

  return fallbackSyncResources()
}

function linkGlobalPackage() {
  execFileSync(npmCmd, ['link', '--ignore-scripts'], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  })
}

function getGlobalPrefix() {
  return execFileSync(npmCmd, ['prefix', '-g'], {
    cwd: projectRoot,
    env: process.env,
    encoding: 'utf8',
  }).trim()
}

function getGlobalBinPath(binName) {
  const prefix = getGlobalPrefix()
  if (process.platform === 'win32') {
    return join(prefix, `${binName}.cmd`)
  }
  return join(prefix, 'bin', binName)
}

const copied = await syncManagedResources()
linkGlobalPackage()

const gsdBinPath = getGlobalBinPath('gsd')
if (!existsSync(gsdBinPath)) {
  throw new Error(`Global gsd binary was not created at ${gsdBinPath}`)
}

writeFileSync(
  installMarkerPath,
  JSON.stringify({
    installType: 'gsd-dev-global',
    packageName,
    projectRoot,
    gsdRoot,
    gsdBinPath,
    installedAt: new Date().toISOString(),
  }, null, 2),
)

process.stdout.write(
  `Installed GSD dev resources in ${gsdRoot}\n` +
  `Linked global package: ${packageName}\n` +
  `Copied: ${copied.join(', ')}\n` +
  `gsd binary: ${gsdBinPath}\n`
)
