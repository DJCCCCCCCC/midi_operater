// Dynamic Cordis plugin (Host half) for the piano-roll companion.
//
// The seven MIDI tools are registered by the PERSISTENT bundle (index.js +
// cordis.patch.yml). This dynamic plugin only adds the browser-side piano-roll
// view: it reads a MIDI file's full note model directly through package-private
// RPC, so the roll is NOT subject to the ~24KB tool-result truncation that
// would break a midi_read-card renderer for large files.
//
// This is the `code.host` body: it returns a Cordis plugin. It cannot
// `import`/`require` npm packages, so the handler shells out to worker.mjs
// (which reuses midi.js) through the `shell` service.
return {
  inject: ['shell'],
  apply(ctx) {
    const WORKER = 'D:/桌面/Code/DSH/midi-plugin/worker.mjs'

    // Run one op through the worker and return its parsed JSON result.
    async function runWorker(op, signal) {
      const spec = ctx.shell.resolve({
        command: 'node "' + WORKER + '"',
        stdin: JSON.stringify(op),
        stdoutMaxBytes: 64 * 1024 * 1024,
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

    // Package-private RPC: return the full note model for one path so the
    // browser can draw a piano roll without the tool-result truncation cap.
    harness.handle('midi-preview', async function (args) {
      return runWorker({ op: 'read', path: args.path, mode: 'full' }, undefined)
    })
  },
}
