/** Embedded CLI resources through the real command consumer; these fixtures do not open Electron windows. */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { NativeCommandBroker } from '../src/auth/broker.ts'
import { withNativeBrokerDescriptor } from '../src/auth/descriptor.ts'
import { cp, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, onTestFinished } from 'vitest'
import { z } from 'zod'
import { embeddedCliEnvironment, prepareEmbeddedCli } from '../src/embedded-cli.ts'
import { hostFixture } from './native-account-host-support.ts'
import { smokeEmbeddedCli } from '../../../scripts/desktop-embedded-cli-smoke.ts'

const resourceRoot = fileURLToPath(new URL('../.generated/mantur-cli', import.meta.url))
const resultSchema = z.object({ ok: z.literal(true), result: z.object({ exitCode: z.number().nullable(),
  timedOut: z.boolean(), aborted: z.boolean(), stdout: z.object({ text: z.string() }), stderr: z.object({ text: z.string() }) }) })

async function profile() {
  const root = await mkdtemp(join(tmpdir(), 'mantur-embedded-cli-'))
  onTestFinished(() => rm(root, { recursive: true, force: true }))
  return root
}

it('copies CLI modules from an explicit resource root that the packager does not discard', async () => {
  const manifest = z.object({ build: z.object({ extraResources: z.array(z.object({ from: z.string(), to: z.string() })) }) })
    .parse(JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as unknown)
  expect(manifest.build.extraResources).toContainEqual({
    from: '.generated/mantur-cli/source.json', to: 'mantur-cli/source.json',
  })
  expect(manifest.build.extraResources).toContainEqual({
    from: '.generated/mantur-cli/node_modules', to: 'mantur-cli/node_modules',
  })
})

it('requires prepared resources and never chooses a global CLI when they are absent', async () => {
  const root = await profile()
  await expect(prepareEmbeddedCli({ resourceRoot: join(root, 'missing'), userData: root,
    executable: process.execPath, platform: 'darwin' })).rejects.toMatchObject({ code: 'ENOENT' })
})

it('replaces case variants of PATH and fixes desktop identity while preserving unrelated variables', () => {
  const environment = embeddedCliEnvironment('/owned/bin', { Path: '/ambient/bin', MANTURHUB_IDENTITY_MODE: 'standalone', LANG: 'C',
    MANTURHUB_CLI_ENTRY: '/ambient/old-cli.js', MANTURHUB_CONFIG_DIR: '/ambient/old-config',
    ManturHub_Cli_Entry: '/ambient/mixed-case.js', manturhub_config_dir: '/ambient/mixed-case-config' }, '/owned/resources')
  expect(environment.PATH).toBe('/owned/bin' + (process.platform === 'win32' ? ';' : ':') + '/ambient/bin')
  expect(environment.Path).toBeUndefined()
  expect(environment.MANTURHUB_IDENTITY_MODE).toBe('desktop-managed')
  expect(environment.LANG).toBe('C')
  expect(environment.ManturHub_Cli_Entry).toBeUndefined()
  expect(environment.manturhub_config_dir).toBeUndefined()
  expect(environment.MANTURHUB_CLI_ENTRY).toBe(join('/owned/resources', 'node_modules/@manturhub/cli/bin/cli.js'))
  expect(environment.MANTURHUB_CONFIG_DIR).toBe('/ambient/old-config')
  expect(embeddedCliEnvironment('/owned/bin', {}, '/owned/resources').MANTURHUB_CONFIG_DIR).toBe(join(homedir(), '.manturhub'))
})

// Preparing the reviewed artifact is required evidence for distribution; ordinary source tests need not install it.
describe.skipIf(process.env.DSH_TEST_EMBEDDED_CLI !== '1')('prepared embedded CLI', () => {
  it('starts the reviewed CLI through its private launcher without an account', async () => {
    await smokeEmbeddedCli({ resourceRoot, userData: await profile(),
      executable: process.env.DSH_EMBEDDED_CLI_EXECUTABLE ?? process.execPath,
      platform: process.platform === 'win32' ? 'win32' : 'darwin' })
  })

  it.each(['manifest', 'dependency'] as const)('rejects damaged %s resources before launching', async (damage) => {
    const root = await profile()
    const resources = join(root, 'resources')
    await cp(resourceRoot, resources, { recursive: true })
    if (damage === 'manifest') await writeFile(join(resources, 'source.json'), '{}')
    else await rm(join(resources, 'node_modules/@vercel/detect-agent/dist/index.js'))
    await expect(smokeEmbeddedCli({ resourceRoot: resources, userData: root,
      executable: process.execPath, platform: 'darwin' })).rejects.toThrow()
    await expect(readFile(join(root, 'managed-cli-bin/manturhub'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('writes an explicit Windows launcher without relying on node.exe or global account configuration', async () => {
    const root = await profile()
    const executable = join(root, 'CUC漫创.exe')
    const bin = await prepareEmbeddedCli({ resourceRoot, userData: root, executable, platform: 'win32' })
    const script = await readFile(join(bin, 'manturhub.cmd'), 'utf8')
    expect(script).toContain('setlocal DisableDelayedExpansion')
    expect(script).toContain('set "ELECTRON_RUN_AS_NODE=1"')
    expect(script).toContain('set "MANTURHUB_IDENTITY_MODE=desktop-managed"')
    expect(script).not.toContain('node.exe')
  })

  it.skipIf(process.platform === 'win32')('runs the embedded balance command through Main and Loader, then refuses it after logout', async () => {
    const root = await profile()
    const bin = await prepareEmbeddedCli({ resourceRoot, userData: root,
      executable: process.env.DSH_EMBEDDED_CLI_EXECUTABLE ?? process.execPath, platform: 'darwin' })
    const environment = embeddedCliEnvironment(bin, { PATH: '/usr/bin:/bin', SystemRoot: process.env.SystemRoot,
      MANTURHUB_CONFIG_DIR: join(root, 'isolated-cli-state') }, resourceRoot)
    const b = await hostFixture((_request, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ code: 0, data: { totalBalance: 9 } }))
    }, false, true, environment)
    await b.login()
    const reply = await b.send('command', { command: 'manturhub balance --json', env: {
      MANTURHUB_IDENTITY_MODE: 'standalone', MANTURHUB_KEY: 'never-use-this-key',
      MANTURHUB_BASE: 'https://other.invalid',
    } }).result
    const result = resultSchema.parse(reply).result
    expect(result, result.stderr.text).toMatchObject({ exitCode: 0, timedOut: false, aborted: false })
    expect(JSON.parse(result.stdout.text)).toMatchObject({ balance_usd: 0.09 })
    expect(result.stdout.text + result.stderr.text).not.toContain(b.backend.bearer())
    expect(b.backend.observed).toHaveLength(1)
    await b.controller.signOut()
    const signedOut = resultSchema.parse(await b.send('command', { command: 'manturhub balance --json', env: {
      MANTURHUB_KEY: 'never-use-this-key', MANTURHUB_IDENTITY_MODE: 'standalone',
    } }).result).result
    expect(signedOut.exitCode).not.toBe(0)
    expect(b.backend.observed).toHaveLength(1)
    expect(signedOut.stdout.text + signedOut.stderr.text).not.toContain('never-use-this-key')
  })

  it.skipIf(process.platform === 'win32')('checks the bundled production skill through the explicit embedded CLI binding', async () => {
    const root = await realpath(await profile())
    const bin = await prepareEmbeddedCli({ resourceRoot, userData: root, executable: process.execPath, platform: 'darwin' })
    const environment = embeddedCliEnvironment(bin, { PATH: '/usr/bin:/bin', SystemRoot: process.env.SystemRoot,
      MANTURHUB_CONFIG_DIR: join(root, 'isolated-cli-state') }, resourceRoot)
    let upstreamRequests = 0
    const account: ConstructorParameters<typeof NativeCommandBroker>[0] = {
      async withCredential(signal, consume) {
        await consume({ credential: 'isolated-skill-credential', origin: 'https://hub.mantur.ai', environment: 'production' }, signal, Date.now() + 60_000)
      },
    }
    const broker = new NativeCommandBroker(account, { protocol: 'client-session', origin: 'https://hub.mantur.ai',
      environment: 'production', environmentLabel: 'Isolated Skill test', requestTimeoutMs: 10_000, leaseMs: 60_000, now: Date.now },
    async () => { upstreamRequests += 1; throw new Error('This check must not contact a live server') })
    onTestFinished(() => broker.close())
    const skillsRoot = fileURLToPath(new URL('../.generated/mantur-skills/', import.meta.url))
    const manifest = JSON.parse(await readFile(join(skillsRoot, 'manifest.json'), 'utf8')) as {
      skills: Array<{ name: string; digest: string }>
    }
    const skill = manifest.skills.find(item => item.name === 'mantur-drama-visual-studio')!
    const entry = join(skillsRoot, `${skill.name}-${skill.digest}`, 'scripts/platform.mjs')
    const execute = promisify(execFile)
    await broker.run(new AbortController().signal, async (descriptor, lifetime) => {
      await withNativeBrokerDescriptor(root, descriptor, lifetime, async (managed) => {
        const result = await execute(process.execPath, [entry, '--source', 'unknown', 'check'], {
          env: { ...environment, ...managed }, timeout: 15_000, signal: lifetime, encoding: 'utf8',
        })
        const report = JSON.parse(result.stdout) as { status: string; cliVersion: string; cliPath: string }
        expect(report).toMatchObject({ status: 'READY', cliVersion: '1.2.10' })
        expect(report.cliPath).toBe(join(resourceRoot, 'node_modules/@manturhub/cli/bin/cli.js'))
      })
    })
    await expect(execute(process.execPath, [entry, '--source', 'unknown', 'check'], {
      env: { ...environment, MANTURHUB_AGENT_AUTH: '' }, timeout: 15_000,
    })).rejects.toThrow('DESKTOP_LOGIN_REQUIRED')
    expect(upstreamRequests).toBe(0)
  })

})
