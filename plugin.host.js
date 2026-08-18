// Dynamic Cordis plugin (Host half) for the piano-roll companion UI.
//
// The seven MIDI tools themselves are registered by the PERSISTENT bundle
// (index.js + cordis.patch.yml). This dynamic plugin only adds the browser-side
// visualization and file transfer that the distribution spec cannot ship as a
// third-party bundle: the client→host RPC surface (dsh-host-apiproxy's
// RpcMethodMap) and the dsh.client roster are compiled into the harness, with no
// extension point for out-of-tree packages. So the piano roll, upload window,
// and download button stay a session-scoped dynamic plugin.
//
// This is the `code.host` body: it returns a Cordis plugin. It cannot
// `import`/`require` npm packages, so the three RPC handlers shell out to
// worker.mjs (which reuses midi.js) through the `shell` service.
return {
  inject: ['shell'],
  apply(ctx) {
    const WORKER = 'D:/桌面/Code/DSH/midi-plugin/worker.mjs'

    // Run one op through the worker and return its parsed JSON result.
    async function runWorker(op, signal) {
      const spec = ctx.shell.resolve({
        command: 'node "' + WORKER + '"',
        stdin: JSON.stringify(op),
        stdoutMaxBytes: 16 * 1024 * 1024,
        signal: signal,
      })
      const result = await ctx.shell.run(spec)
      if (result.exitCode !== 0) {
        const message = (result.stderr && result.stderr.text)
          || (result.stdout && result.stdout.text)
          || 'midi worker failed'
        throw new Error(message.trim() || 'midi worker failed')
      }
      const text = (result.stdout && result.stdout.text) || ''
      if (text === '') throw new Error('midi worker returned no output')
      return JSON.parse(text)
    }

    // Package-private RPC for the Client preview panel: return the full note
    // model for one path so the browser can draw a piano roll without parsing prose.
    harness.handle('midi-preview', async function (args) {
      return runWorker({ op: 'read', path: args.path, mode: 'full' }, undefined)
    })

    // Package-private RPC for the Client download button: return the file bytes
    // as base64 so the browser can build a Blob and trigger a download.
    harness.handle('midi-download', async function (args) {
      return runWorker({ op: 'download', path: args.path, trackIndex: args.trackIndex }, undefined)
    })

    // Package-private RPC for the Client upload control: decode the base64 file
    // and store it under the plugin's own uploads directory, one subdir per
    // session, so files never land in the workspace root and sessions stay
    // isolated. The worker prunes files older than 24h on each upload.
    harness.handle('midi-upload', async function (args) {
      let sessionId = 'default'
      const agents = ctx.get('agents')
      if (agents) {
        const initiator = agents.currentInitiator()
        if (initiator && initiator.session) sessionId = String(initiator.session.id)
      }
      sessionId = sessionId.replace(/[\\/:*?"<>|]/g, '_')
      const safe = String(args.name || 'upload.mid')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\.\./g, '_')
      const path = 'D:/桌面/Code/DSH/midi-plugin/uploads/' + sessionId + '/' + safe
      const result = await runWorker({ op: 'upload', path: path, base64: args.base64 }, undefined)
      return { path: result.path, bytes: result.bytes }
    })
  },
}
