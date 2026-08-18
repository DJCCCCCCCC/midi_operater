// Thin subprocess bridge for the piano-roll companion. Dynamic Cordis plugin
// code cannot `import` npm packages, so the companion's Host half shells out
// to this script; the actual MIDI work lives in midi.js (shared with the
// persistent bundle index.js).
//
// Reads one JSON op from stdin, prints one JSON result to stdout; errors go to
// stderr and exit non-zero.
import { run } from './midi.js'

let input = ''
for await (const chunk of process.stdin) {
  input += chunk.toString()
}

run(JSON.parse(input))
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error(error && error.message ? error.message : String(error))
    process.exitCode = 1
  })
