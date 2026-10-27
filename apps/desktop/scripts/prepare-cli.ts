/** Materialize the fixed CLI package and its locked production dependencies as desktop resources. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'

const desktop = resolve(import.meta.dirname, '..')
const source = join(desktop, 'cli-runtime')
const archive = await readFile(join(source, 'manturhub-cli-1.2.16.tgz'))
const sha256 = createHash('sha256').update(archive).digest('hex')
if (sha256 !== 'a627582d1d723642fb8683d714c483c16db23b7d68098bba1c6956aaa2f9fd2c') {
  throw new Error('Embedded Mantur CLI archive does not match its reviewed source')
}
const options = { cwd: source, stdio: 'inherit' as const }
if (process.platform === 'win32') execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm.cmd ci --omit=dev'], options)
else execFileSync('npm', ['ci', '--omit=dev'], options)
const output = join(desktop, '.generated/mantur-cli')
await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
await cp(join(source, 'node_modules'), join(output, 'node_modules'), { recursive: true })
await rm(join(output, 'node_modules/.bin'), { recursive: true, force: true })
const cli = join(output, 'node_modules/@manturhub/cli')
z.object({ name: z.literal('@manturhub/cli'), version: z.literal('1.2.16'), license: z.literal('MIT') })
  .parse(JSON.parse(await readFile(join(cli, 'package.json'), 'utf8')) as unknown)
await readFile(join(cli, 'LICENSE'))
// The upstream archive remains immutable; this reviewed overlay separates identity from command authorization.
const overlays = [
  ['lib/agent-auth.js', '        || typeof descriptor.expires_at !== "string"',
    '        || typeof descriptor.identity_binding !== "string"\n        || !/^[a-f0-9]{64}$/.test(descriptor.identity_binding)\n        || typeof descriptor.expires_at !== "string"'],
  ['lib/agent-auth.js', '      bridgeSecret: descriptor.bridge_secret,',
    '      bridgeSecret: descriptor.bridge_secret,\n      identityBinding: descriptor.identity_binding,'],
  ['lib/identity-binding.js', 'identity = getAgentAuthorization().bridgeSecret;',
    'identity = getAgentAuthorization().identityBinding;'],
] as const
for (const [file, before, after] of overlays) {
  const target = join(cli, file)
  const text = await readFile(target, 'utf8')
  if (text.split(before).length !== 2) throw new Error(`Embedded CLI overlay no longer matches ${file}`)
  await writeFile(target, text.replace(before, after))
}
await writeFile(join(output, 'source.json'), JSON.stringify({
  formatVersion: 1, package: '@manturhub/cli', version: '1.2.16',
  sourceUrl: 'https://registry.npmjs.org/@manturhub/cli/-/cli-1.2.16.tgz', archiveSha256: sha256,
  overlay: 'desktop-stable-identity-v1',
}, null, 2) + '\n')
console.log('Prepared embedded Mantur CLI 1.2.16 from the verified archive and lockfile')
