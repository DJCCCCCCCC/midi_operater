/** dsh-midi-plugin browser half: registers the keyed piano-roll toolview for
 *  the `midi_read` tool. Rendered purely from the settled tool result, so no
 *  client→host RPC is needed.
 *
 *  Contract (same as gal-view): the bundle wraps this in __ModuleLoader__.load,
 *  so it must export name / inject / apply. apply receives the client root ctx
 *  and registers into the ui-tool slot via ctx.slots.inject.
 */
import { CSS } from './styles.mjs'
import { PianoRoll } from './PianoRoll.jsx'

export const name = 'midi-tools'

/** Required service: the slot registry. */
export const inject = ['slots']

/**
 * Inject the piano-roll styles and register the keyed toolview.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  // Idempotence guard: a re-run (HMR / loader re-eval) must not double-inject.
  if (document.querySelector('style[data-midi-plugin-style]') === null) {
    const styleEl = document.createElement('style')
    styleEl.setAttribute('data-midi-plugin-style', '')
    styleEl.setAttribute('data-plugin', 'dsh-midi-plugin')
    styleEl.textContent = CSS
    document.head.append(styleEl)
    ctx.effect(() => () => { styleEl.remove() }, 'dsh-midi-plugin: styles')
  }

  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'midi_read' }, PianoRoll))
}
