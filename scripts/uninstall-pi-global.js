#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, rmSync, rmdirSync, unlinkSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')
const resourcesDir = join(projectRoot, 'src', 'resources')
const gsdRoot = process.env.GSD_HOME || join(os.homedir(), '.gsd')
const agentDir = join(gsdRoot, 'agent')
const installMarkerPath = join(agentDir, 'managed-dev-install.json')
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const packageName = packageJson.name

const removed = []
const skipped = []

function safeRemove(path, label) {
  if (!existsSync(path)) return
  rmSync(path, { recursive: true, force: true })
  removed.push(label)
}

function removeDirIfEmpty(path, label) {
  try {
    if (existsSync(path) && readdirSync(path).length === 0) {
      rmdirSync(path)
      removed.push(label)
    }
  } catch {
    // ignore non-empty or missing dirs
  }
}

function removeResourceEntries(containerName) {
  const srcDir = join(resourcesDir, containerName)
  const destDir = join(agentDir, containerName)
  if (!existsSync(srcDir) || !existsSync(destDir)) return

  for (const entry of readdirSync(srcDir)) {
    safeRemove(join(destDir, entry), `${containerName}/${entry}`)
  }

  removeDirIfEmpty(destDir, `${containerName}/`)
}

function removeIfContentMatches(targetPath, sourcePath, label) {
  if (!existsSync(targetPath) || !existsSync(sourcePath)) return
  try {
    const target = readFileSync(targetPath, 'utf8')
    const source = readFileSync(sourcePath, 'utf8')
    if (target === source) {
      rmSync(targetPath, { force: true })
      removed.push(label)
    } else {
      skipped.push(`${label} (modified, left in place)`)
    }
  } catch {
    skipped.push(`${label} (could not verify, left in place)`)
  }
}

function removeManagedNodeModulesLink() {
  const linkPath = join(agentDir, 'node_modules')
  const managedTarget = join(projectRoot, 'node_modules')
  if (!existsSync(linkPath)) return

  try {
    const stat = lstatSync(linkPath)
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(linkPath)
      if (target !== managedTarget) {
        skipped.push(`agent/node_modules (points to ${target}, left in place)`)
        return
      }
      unlinkSync(linkPath)
      removed.push('agent/node_modules')
      return
    }
  } catch {
    skipped.push('agent/node_modules (could not inspect, left in place)')
    return
  }

  skipped.push('agent/node_modules (not a managed symlink, left in place)')
}

function unlinkGlobalPackage() {
  try {
    execFileSync(npmCmd, ['unlink', '-g', packageName], {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    })
  } catch (error) {
    skipped.push(`${packageName} global link (not removed: ${error instanceof Error ? error.message : String(error)})`)
  }
}

unlinkGlobalPackage()

if (existsSync(installMarkerPath)) {
  removeResourceEntries('extensions')
  removeResourceEntries('agents')
  removeIfContentMatches(join(agentDir, 'GSD-WORKFLOW.md'), join(resourcesDir, 'GSD-WORKFLOW.md'), 'agent/GSD-WORKFLOW.md')
  safeRemove(join(agentDir, 'managed-resources.json'), 'agent/managed-resources.json')
  removeManagedNodeModulesLink()
  safeRemove(installMarkerPath, 'agent/managed-dev-install.json')
  removeDirIfEmpty(agentDir, 'agent/')
  removeDirIfEmpty(gsdRoot, '.gsd/')
} else {
  skipped.push('managed GSD resources (install marker missing, left in place)')
}

process.stdout.write(
  `Removed GSD dev install state from ${gsdRoot}\n` +
  `Removed: ${removed.length ? removed.join(', ') : '(nothing)'}\n` +
  (skipped.length ? `Skipped: ${skipped.join(', ')}\n` : '')
)
