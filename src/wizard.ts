import { createInterface } from 'readline'
import type { AuthStorage } from '@mariozechner/pi-coding-agent'

/**
 * Internal helper: prompt for masked input using raw mode stdin.
 * Handles backspace, Ctrl+C, and Enter.
 * Falls back to plain readline if setRawMode is unavailable (e.g. some SSH contexts).
 */
async function promptMasked(question: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      process.stdout.write(question)
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding('utf8')
      let value = ''
      const handler = (ch: string) => {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off('data', handler)
          process.stdout.write('\n')
          resolve(value)
        } else if (ch === '\u0003') {
          // Ctrl+C — restore raw mode and exit cleanly
          process.stdin.setRawMode(false)
          process.stdout.write('\n')
          process.exit(0)
        } else if (ch === '\u007f') {
          // Backspace
          if (value.length > 0) {
            value = value.slice(0, -1)
          }
          process.stdout.clearLine(0)
          process.stdout.cursorTo(0)
          process.stdout.write(question + '*'.repeat(value.length))
        } else {
          value += ch
          process.stdout.write('*')
        }
      }
      process.stdin.on('data', handler)
    } catch (_err) {
      // setRawMode not available — fall back to plain readline
      process.stdout.write(' (note: input will be visible)\n')
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      rl.question(question, (answer) => {
        rl.close()
        resolve(answer)
      })
    }
  })
}

/**
 * Hydrate process.env from stored auth.json credentials for optional tool keys.
 * Runs on every launch so extensions see Brave/Context7/Jina keys stored via the
 * wizard on prior launches.
 */
export function loadStoredEnvKeys(authStorage: AuthStorage): void {
  const providers: Array<[string, string]> = [
    ['brave', 'BRAVE_API_KEY'],
    ['brave_answers', 'BRAVE_ANSWERS_KEY'],
    ['context7', 'CONTEXT7_API_KEY'],
    ['jina', 'JINA_API_KEY'],
  ]
  for (const [provider, envVar] of providers) {
    if (!process.env[envVar]) {
      const cred = authStorage.get(provider)
      if (cred?.type === 'api_key') {
        process.env[envVar] = cred.key as string
      }
    }
  }
}

/**
 * Check for missing optional tool API keys and prompt for them if on a TTY.
 *
 * Anthropic auth is handled by pi's own OAuth/API key flow — we don't touch it.
 * This wizard only collects Brave Search, Context7, and Jina keys which are needed
 * for web search and documentation tools.
 *
 * Behavior:
 * - All optional keys present (env or auth.json): return silently
 * - Non-TTY with missing optional keys: warn to stderr and continue (non-fatal)
 * - TTY with missing optional keys: interactive prompts, skip on empty input
 */
export async function runWizardIfNeeded(authStorage: AuthStorage): Promise<void> {
  const needsBrave = !authStorage.has('brave') && !process.env.BRAVE_API_KEY
  const needsBraveAnswers = !authStorage.has('brave_answers') && !process.env.BRAVE_ANSWERS_KEY
  const needsContext7 = !authStorage.has('context7') && !process.env.CONTEXT7_API_KEY
  const needsJina = !authStorage.has('jina') && !process.env.JINA_API_KEY

  if (!needsBrave && !needsBraveAnswers && !needsContext7 && !needsJina) {
    return
  }

  const missing = [
    needsBrave && 'Brave Search',
    needsBraveAnswers && 'Brave Answers',
    needsContext7 && 'Context7',
    needsJina && 'Jina',
  ]
    .filter(Boolean)
    .join(', ')

  // Non-TTY: just warn and let the session start without them
  if (!process.stdin.isTTY) {
    process.stderr.write(
      `[gsd] Warning: optional tool API keys not configured (${missing}). Some tools may not work.\n`,
    )
    return
  }

  // TTY: interactive prompts for each missing key
  process.stdout.write(`\n[gsd] Some optional tool API keys are not configured: ${missing}\n`)
  process.stdout.write('[gsd] Press Enter to skip any key you want to set up later.\n\n')

  if (needsBrave) {
    const key = await promptMasked('Brave Search API key (optional, for web search + LLM context): ')
    if (key) {
      authStorage.set('brave', { type: 'api_key', key })
      process.env.BRAVE_API_KEY = key
    }
  }

  if (needsBraveAnswers) {
    const key = await promptMasked('Brave Answers API key (optional, for AI-generated answers): ')
    if (key) {
      authStorage.set('brave_answers', { type: 'api_key', key })
      process.env.BRAVE_ANSWERS_KEY = key
    }
  }

  if (needsContext7) {
    const key = await promptMasked('Context7 API key (optional): ')
    if (key) {
      authStorage.set('context7', { type: 'api_key', key })
      process.env.CONTEXT7_API_KEY = key
    }
  }

  if (needsJina) {
    const key = await promptMasked('Jina AI API key (optional): ')
    if (key) {
      authStorage.set('jina', { type: 'api_key', key })
      process.env.JINA_API_KEY = key
    }
  }

  process.stdout.write('[gsd] Keys saved. Starting...\n\n')
}
