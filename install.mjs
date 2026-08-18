// dsh-midi-plugin 一键安装脚本。
//
// 自动完成：检查依赖 → 打包 → 装进 profile → 验证。
// 用法：node install.mjs [profile名]   （默认 web）
//
// 注意：钢琴卷帘（可视化）是动态插件，无法用脚本自动加载——它必须由 AI
// 通过 cordis_define/cordis_run 注册，并需要你点一次授权。脚本最后会把
// 这一步的一句话指引打印出来。
import { spawnSync } from 'node:child_process'
import { existsSync, copyFileSync, rmSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const PROFILE = process.argv[2] || 'web'

function run(cmd, args, cwd = ROOT) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' })
  return res.status ?? 1
}

function step(text) {
  console.log('\n' + '='.repeat(60))
  console.log(text)
  console.log('='.repeat(60))
}

// 1. 检查依赖
step('[1/4] 检查依赖 @tonejs/midi')
if (!existsSync(join(ROOT, 'node_modules', '@tonejs', 'midi'))) {
  console.log('未安装，正在 npm install ...')
  if (run('npm', ['install', '--cache', '.npm-cache']) !== 0) {
    console.error('✗ 依赖安装失败')
    process.exit(1)
  }
} else {
  console.log('✓ 已安装')
}

// 2. 打包（用 tarball 而非目录直装，规避非 ASCII 路径下 pnpm 链接乱码）
step('[2/4] 打包插件')
const tgz = `dsh-midi-plugin.tgz`
if (run('pnpm', ['pack', '--out', tgz]) !== 0) {
  console.error('✗ 打包失败（需要 pnpm）')
  process.exit(1)
}

// 3. 复制到用户 home（ASCII 路径，规避中文路径坑）再安装
step('[3/4] 安装到 profile "' + PROFILE + '"')
const homeTgz = join(homedir(), 'dsh-midi-plugin-install.tgz')
copyFileSync(join(ROOT, tgz), homeTgz)
if (run('dsh', ['plugin', '--profile', PROFILE, 'add', homeTgz]) !== 0) {
  console.error('✗ 安装失败')
  rmSync(homeTgz, { force: true })
  process.exit(1)
}
rmSync(join(ROOT, tgz), { force: true })
rmSync(homeTgz, { force: true })

// 4. 验证
step('[4/4] 验证')
run('dsh', ['--profile', PROFILE, '--dump-config'])

console.log('\n' + '✓ 完成！重启 web 服务后，7 个 MIDI 工具即生效（midi_summary / midi_read / midi_write / midi_transpose / midi_quantize / midi_tempo / midi_chords）。')
console.log('')
console.log('可选：想要钢琴卷帘（在 midi_read 卡片里可视化音符）？')
console.log('  对 AI 说一句：')
console.log('')
console.log('    「加载 midi 伴侣」')
console.log('')
console.log('  AI 会完成注册，你点一次「允许」并刷新页面即可。')
