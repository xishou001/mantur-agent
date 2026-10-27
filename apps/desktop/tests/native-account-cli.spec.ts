/** Opt-in fixed-package joint tests: actual CLI/bin transport plus native controller, not the Electron/profile command entry. */
import { spawn, execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import type { NativeBrokerDescriptor } from '../src/auth/broker.ts'
import { withNativeBrokerDescriptor } from '../src/auth/descriptor.ts'
import { nativeBrokerBench as legacyBench, nativeBrokerHeaders, nativeBrokerScope } from './native-account-broker-support.ts'

const nativeBrokerBench: typeof legacyBench = (api, leaseMs) => legacyBench(api, leaseMs, 'client-session')

const cliPackage = process.env.DSH_NATIVE_CLI_PACKAGE
const cliTarball = process.env.DSH_NATIVE_CLI_TARBALL
const execFileAsync = promisify(execFile)
const packageHash = 'a627582d1d723642fb8683d714c483c16db23b7d68098bba1c6956aaa2f9fd2c'

function location(path: string): string {
  if (cliPackage === undefined) throw new Error('DSH_NATIVE_CLI_PACKAGE must name the fixed unpacked CLI')
  return join(cliPackage, path)
}

async function saveDescriptor(root: string, descriptor: NativeBrokerDescriptor): Promise<string> {
  const path = join(root, 'cli-auth.json')
  await writeFile(path, JSON.stringify(descriptor), { flag: 'wx', mode: 0o600 })
  onTestFinished(() => unlink(path).catch((error: unknown) => { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error }))
  return path
}

async function command(path: string, args: readonly string[], signal?: AbortSignal) {
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    MANTURHUB_IDENTITY_MODE: 'desktop-managed', MANTURHUB_AGENT_AUTH: path, MANTURHUB_CONFIG_DIR: dirname(path),
    MANTURHUB_KEY: 'isolated-legacy-canary-must-not-be-used', MANTURHUB_BASE: 'https://other.invalid',
    MANTURHUB_DISABLE_UPDATE_CHECK: '1', MANTURHUB_DISABLE_SKILL_UPDATE_CHECK: '1',
  }
  signal?.throwIfAborted()
  const child = spawn(process.execPath, [...args], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  const stop = (): void => { child.kill('SIGTERM') }
  signal?.addEventListener('abort', stop, { once: true })
  if (signal?.aborted === true) stop()
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; stop() }, 15_000)
  // All test commands disable both CLI background updaters and spawn no descendants.
  child.stdout.on('data', (chunk: Buffer) => { stdout.push(chunk) })
  child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk) })
  try {
    const status = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, exitSignal) => { resolve({ code, signal: exitSignal }) })
    })
    return { ...status, timedOut, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', stop)
  }
}

function script(source: string): string[] {
  return ['--input-type=module', '--eval', `import {apiFetch,apiRequest} from ${JSON.stringify(pathToFileURL(location('lib/api.js')).href)}; ${source}`]
}

// The pinned release artifact is explicit input; ordinary CI does not claim this joint acceptance.
describe.skipIf(cliPackage === undefined && cliTarball === undefined || process.platform === 'win32')('fixed CLI 1.2.16 and Main broker joint transport (POSIX descriptor fixture)', () => {
  beforeAll(async () => {
    if (cliPackage === undefined || cliTarball === undefined) throw new Error('Both fixed CLI package and tarball paths are required')
    expect(createHash('sha256').update(await readFile(cliTarball)).digest('hex')).toBe(packageHash)
    const listed = await execFileAsync('tar', ['-tzf', cliTarball], { encoding: 'utf8' })
    const files = listed.stdout.trim().split('\n').filter(path => !path.endsWith('/'))
    expect(files).toHaveLength(35)
    for (const path of files) {
      expect(path.startsWith('package/')).toBe(true)
      const packed = await execFileAsync('tar', ['-xOf', cliTarball, path], { encoding: 'buffer' })
      if (['package/lib/agent-auth.js', 'package/lib/identity-binding.js'].includes(path)) continue
      expect(await readFile(location(path.slice('package/'.length))), path).toEqual(packed.stdout)
    }
  })

  it('binds independent command leases to one identity and changes identity after reauthorization', async () => {
    const b = await nativeBrokerBench((_request, response) => { response.end('{}') })
    const readIdentity = async () => {
      const scope = await nativeBrokerScope(b.broker)
      const path = await saveDescriptor(b.root, scope.descriptor)
      const result = await command(path, ['--input-type=module', '--eval',
        `import {identityBinding} from ${JSON.stringify(pathToFileURL(location('lib/identity-binding.js')).href)}; console.log(identityBinding())`])
      await unlink(path)
      scope.release()
      await scope.done
      expect(result.code, result.stderr).toBe(0)
      expect(result.stdout.trim()).toMatch(/^[a-f0-9]{64}$/u)
      return { binding: result.stdout.trim(), capability: scope.descriptor.bridge_secret }
    }
    const first = await readIdentity()
    const second = await readIdentity()
    expect(second.capability).not.toBe(first.capability)
    expect(second.binding).toBe(first.binding)
    await b.controller.signOut()
    await b.controller.startBrowser()
    await expect.poll(() => b.controller.getSnapshot().authenticated).toBe(true)
    const changed = await readIdentity()
    expect(changed.binding).not.toBe(first.binding)
  })

  it('rejects an invalid stable identity before any authenticated request', async () => {
    const b = await nativeBrokerBench((_request, response) => { response.end('{}') })
    const scope = await nativeBrokerScope(b.broker)
    const path = await saveDescriptor(b.root, { ...scope.descriptor, identity_binding: 'invalid' })
    const result = await command(path, ['--input-type=module', '--eval',
      `import {identityBinding} from ${JSON.stringify(pathToFileURL(location('lib/identity-binding.js')).href)}; identityBinding()`])
    scope.release()
    await scope.done
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('MANTUR_BROKER_DESCRIPTOR_INVALID')
    expect(b.observed).toHaveLength(0)
  })

  it('accepts a quote in a new command scope but rejects an old-account confirmation', async () => {
    let invocations = 0
    const b = await nativeBrokerBench((request, response) => {
      response.setHeader('Content-Type', 'application/json')
      let data: object
      if (request.url?.endsWith('/quote')) data = { estimatedPoints: 60, priceVersionTag: 'isolated-price-v1', enoughBalance: true, balance: 1000 }
      else if (request.url?.endsWith('/invoke')) {
        invocations += 1
        data = { status: 'succeeded', output: { isolated: true } }
      } else data = { apiCode: 'op.image.generate', name: 'Isolated image operator',
        inputSchema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] } }
      if (request.url?.includes('/operators?')) data = { records: [data], pages: 1 }
      response.end(JSON.stringify({ code: 0, data }))
    })
    const run = async (token?: string) => {
      const scope = await nativeBrokerScope(b.broker)
      const path = await saveDescriptor(b.root, scope.descriptor)
      try { return await command(path, [location('bin/cli.js'), 'run', 'op.image.generate', '--json', '{"prompt":"isolated fixture"}',
        ...(token ? ['--confirm', token] : [])]) }
      finally { await unlink(path); scope.release(); await scope.done }
    }
    const first = await run()
    const second = await run()
    expect(first.code, first.stderr).toBe(3)
    expect(second.code, second.stderr).toBe(3)
    const firstToken = (JSON.parse(first.stderr) as { confirmation_token: string }).confirmation_token
    const secondToken = (JSON.parse(second.stderr) as { confirmation_token: string }).confirmation_token
    expect(invocations).toBe(0)
    const accepted = await run(firstToken)
    expect(accepted.code, accepted.stderr).toBe(0)
    expect(invocations).toBe(1)
    await b.controller.signOut()
    await b.controller.startBrowser()
    await expect.poll(() => b.controller.getSnapshot().authenticated).toBe(true)
    const rejected = await run(secondToken)
    expect(rejected.code, rejected.stderr).toBe(1)
    expect(rejected.stderr).toContain('报价已变化或确认标识无效')
    expect(invocations).toBe(1)
  })

  it('confirms a quoted file across command scopes without uploading again and rejects changed files or accounts', async () => {
    const uploaded: Array<{ authorization: string | undefined; body: string }> = []
    const storage = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      request.on('end', () => {
        uploaded.push({ authorization: request.headers.authorization, body: Buffer.concat(chunks).toString('utf8') })
        response.writeHead(200, { ETag: 'isolated-file-etag' }).end()
      })
    })
    onTestFinished(async () => {
      const closed = new Promise<void>((resolve, reject) => {
        storage.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
      storage.closeAllConnections()
      await closed
    })
    await new Promise<void>((resolve, reject) => {
      storage.once('error', reject)
      storage.listen(0, '127.0.0.1', resolve)
    })
    const address = storage.address()
    if (address === null || typeof address === 'string') throw new Error('Expected isolated file storage endpoint')
    const uploadUrl = `http://127.0.0.1:${String(address.port)}/upload`
    let presigns = 0
    let confirmations = 0
    const quotedInputs: unknown[] = []
    const invokedInputs: unknown[] = []
    const operator = { apiCode: 'op.image.generate', name: 'Isolated file operator',
      inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, sourceFileId: {
        type: 'string', 'x-workbuddy-file': { accept: ['.wav'], maxBytes: 1024 },
      } }, required: ['prompt', 'sourceFileId'] } }
    const b = await nativeBrokerBench((request, response) => {
      response.setHeader('Content-Type', 'application/json')
      if (request.method !== 'POST') {
        response.end(JSON.stringify({ code: 0,
          data: request.url?.includes('/operators?') ? { records: [operator], pages: 1 } : operator }))
        return
      }
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      request.on('end', () => {
        let data: object
        if (request.url === '/api/openapi/v1/files/upload') {
          presigns += 1
          data = { files: [{ uploadId: 'isolated-upload', uploadUrl }] }
        } else if (request.url === '/api/openapi/v1/files/isolated-upload/confirm') {
          confirmations += 1
          data = { fileId: 'isolated-file', status: 'AVAILABLE' }
        } else {
          const { input } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { input: unknown }
          if (request.url?.endsWith('/quote')) {
            quotedInputs.push(input)
            data = { estimatedPoints: 60, priceVersionTag: 'isolated-file-price-v1', enoughBalance: true, balance: 1000 }
          } else {
            invokedInputs.push(input)
            data = { status: 'succeeded', output: { isolated: true } }
          }
        }
        response.end(JSON.stringify({ code: 0, data }))
      })
    })
    const file = join(b.root, 'source.wav')
    const original = 'isolated original file'
    await writeFile(file, original)
    const run = async (token?: string) => {
      const scope = await nativeBrokerScope(b.broker)
      const path = await saveDescriptor(b.root, scope.descriptor)
      try {
        const result = await command(path, [location('bin/cli.js'), 'run', operator.apiCode,
          '--json', '{"prompt":"isolated file fixture"}', '--file', `sourceFileId=${file}`,
          ...(token ? ['--confirm', token] : [])], scope.signal)
        expect(result, result.stderr).toMatchObject({ signal: null, timedOut: false })
        return result
      } finally {
        await unlink(path)
        scope.release()
        await scope.done
      }
    }
    const tokens: string[] = []
    for (let index = 0; index < 3; index++) {
      const quote = await run()
      expect(quote.code, quote.stderr).toBe(3)
      tokens.push((JSON.parse(quote.stderr) as { confirmation_token: string }).confirmation_token)
    }
    expect(presigns).toBe(1)
    expect(confirmations).toBe(1)
    expect(uploaded).toEqual([{ authorization: undefined, body: original }])
    expect(invokedInputs).toEqual([])
    const accepted = await run(tokens[0])
    expect(accepted.code, accepted.stderr).toBe(0)
    expect(quotedInputs).toEqual(Array.from({ length: 4 }, () => ({ prompt: 'isolated file fixture', sourceFileId: 'isolated-file' })))
    expect(invokedInputs).toEqual([{ prompt: 'isolated file fixture', sourceFileId: 'isolated-file' }])

    await writeFile(file, 'isolated modified file')
    const changed = await run(tokens[1])
    expect(changed.code, changed.stderr).toBe(1)
    expect(changed.stderr).toContain('文件内容、类型或字段与报价时不一致')
    await writeFile(file, original)
    await b.controller.signOut()
    await b.controller.startBrowser()
    await expect.poll(() => b.controller.getSnapshot().authenticated).toBe(true)
    const reauthorized = await run(tokens[2])
    expect(reauthorized.code, reauthorized.stderr).toBe(1)
    expect(reauthorized.stderr).toContain('报价文件绑定与当前站点、账号、算子或入参不一致')
    expect(presigns).toBe(1)
    expect(confirmations).toBe(1)
    expect(uploaded).toHaveLength(1)
    expect(quotedInputs).toHaveLength(4)
    expect(invokedInputs).toHaveLength(1)
  })

  it('runs the real balance command after browser code exchange, without a CLI login or ambient API key', async () => {
    const b = await nativeBrokerBench((_request, response) => {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ code: 0, data: { totalBalance: 9 } }))
    })
    await b.broker.run(new AbortController().signal, async (descriptor, signal) => {
      let saved: string | undefined
      await withNativeBrokerDescriptor(b.root, descriptor, signal, async (environment) => {
        const path = environment.MANTURHUB_AGENT_AUTH
        if (path === undefined) throw new Error('Expected managed descriptor path')
        saved = path
        const result = await command(path, [location('bin/cli.js'), 'balance', '--json'], signal)
        expect(result.timedOut).toBe(false)
        expect(result.signal).toBeNull()
        expect(result.code, result.stderr).toBe(0)
        expect(JSON.parse(result.stdout)).toMatchObject({ totalBalance: 9 })
        expect(result.stdout + result.stderr).not.toContain(b.bearer())
        expect(result.stdout + result.stderr).not.toContain(b.password)
      })
      if (saved === undefined) throw new Error('Expected published descriptor')
      await expect(readFile(saved)).rejects.toMatchObject({ code: 'ENOENT' })
    })
    expect(b.observed).toEqual([{ path: '/api/openapi/v1/credits/balance', authorization: undefined, apiKey: b.bearer(), client: 'cli' }])
  })

  it('keeps optional 401 authenticated and streams downloads through the real packaged CLI transport', async () => {
    const b = await nativeBrokerBench((request, response) => {
      if (request.url === '/api/openapi/v1/operators') {
        response.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'CREDENTIAL_REVOKED' }))
      } else {
        response.writeHead(200, { 'Content-Type': 'application/zip', 'Set-Cookie': 'not-for-cli' })
        response.write('stream-')
        response.end('body')
      }
    })
    const scope = await nativeBrokerScope(b.broker)
    const path = await saveDescriptor(b.root, scope.descriptor)
    const result = await command(path, script("const denied=await apiFetch('/api/openapi/v1/operators',{auth:'optional'}); const download=await apiRequest('/api/openapi/v1/skills/test/download'); console.log(JSON.stringify({status:denied.status,body:await download.text(),cookie:download.headers.get('set-cookie')}));"))
    expect(result, result.stderr).toMatchObject({ code: 0, signal: null, timedOut: false })
    expect(JSON.parse(result.stdout)).toEqual({ status: 401, body: 'stream-body', cookie: null })
    expect(b.observed.map(value => value.path)).toEqual(['/api/openapi/v1/operators', '/api/openapi/v1/skills/test/download'])
    expect(b.observed.every(value => value.authorization === undefined && value.apiKey === b.bearer())).toBe(true)
  })

  it('runs the real upload command with brokered presign and a single direct credential-free PUT', async () => {
    const uploads: Array<{ method: string | undefined; authorization: string | undefined; body: string }> = []
    const tos = createServer((request, response) => {
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      request.on('end', () => {
        uploads.push({ method: request.method, authorization: request.headers.authorization, body: Buffer.concat(chunks).toString('utf8') })
        response.end()
      })
    })
    onTestFinished(async () => {
      const closed = new Promise<void>((resolve) => { tos.close(() => { resolve() }) })
      tos.closeAllConnections()
      await closed
    })
    await new Promise<void>((resolve) => { tos.listen(0, '127.0.0.1', resolve) })
    const address = tos.address()
    if (address === null || typeof address === 'string') throw new Error('Expected isolated TOS endpoint')
    const signed = `http://127.0.0.1:${String(address.port)}/upload?signature=isolated-memory-only`
    const b = await nativeBrokerBench((request, response) => {
      request.resume()
      request.on('end', () => {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ code: 0, data: request.url === '/api/openapi/v1/files/fixture-upload/confirm'
          ? { fileId: 'fixture-file', status: 'AVAILABLE' }
          : { files: [{ uploadId: 'fixture-upload', uploadUrl: signed, downloadUrl: 'https://assets.example/public/file.txt' }] } }))
      })
    })
    const scope = await nativeBrokerScope(b.broker)
    const path = await saveDescriptor(b.root, scope.descriptor)
    const file = join(b.root, 'upload.wav')
    await writeFile(file, 'direct body')
    const result = await command(path, [location('bin/cli.js'), 'upload', file])
    expect(result, result.stderr).toMatchObject({ code: 0, signal: null, timedOut: false })
    expect(result.stdout.trim()).toBe('https://assets.example/public/file.txt')
    expect(result.stdout + result.stderr).not.toContain(signed)
    expect(uploads).toEqual([{ method: 'PUT', authorization: undefined, body: 'direct body' }])
    expect(b.observed.map(value => value.path)).toEqual(['/api/openapi/v1/files/upload', '/api/openapi/v1/files/fixture-upload/confirm'])
  })

  it('fails a managed command with a missing descriptor instead of using its ambient key', async () => {
    const b = await nativeBrokerBench((_request, response) => { response.end('unexpected') })
    const result = await command(join(b.root, 'missing.json'), [location('bin/cli.js'), 'balance', '--json'])
    expect(result.timedOut).toBe(false)
    expect(result.code).not.toBe(0)
    expect(result.stderr).not.toContain('isolated-legacy-canary')
    expect(b.observed).toEqual([])
  })

  it('aborts an actual CLI body and waits for its child close on desktop logout', async () => {
    const entered = Promise.withResolvers<undefined>()
    const upstreamClosed = Promise.withResolvers<undefined>()
    const b = await nativeBrokerBench((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      response.write('pending body')
      response.on('close', () => { upstreamClosed.resolve(undefined) })
      entered.resolve(undefined)
    })
    let descriptor: NativeBrokerDescriptor | undefined
    let result: Awaited<ReturnType<typeof command>> | undefined
    const running = b.broker.run(new AbortController().signal, async (value, signal) => {
      descriptor = value
      await withNativeBrokerDescriptor(b.root, value, signal, async (environment) => {
        const path = environment.MANTURHUB_AGENT_AUTH
        if (path === undefined) throw new Error('Expected managed descriptor path')
        result = await command(path, script("const response=await apiRequest('/api/openapi/v1/slow'); await response.text();"), signal)
      })
    })
    const rejected = expect(running).rejects.toMatchObject({ name: 'AbortError' })
    await entered.promise
    await b.controller.signOut()
    await upstreamClosed.promise
    await rejected
    expect(result?.timedOut).toBe(false)
    expect(result?.code === 0 && result.signal === null).toBe(false)
    expect(descriptor).toBeDefined()
    if (descriptor === undefined) throw new Error('Expected admitted command descriptor')
    const stale = await fetch(`${descriptor.proxy_origin}/api/openapi/v1/late`, { headers: nativeBrokerHeaders(descriptor) })
    expect(stale.status).toBe(401)
    await stale.body?.cancel()
    expect(b.observed).toHaveLength(1)
  })
})
