// 代码级断言:场地布局尺寸自查(直接读 src/entry.js 的常量,不依赖截图)
const src = require('fs').readFileSync('src/entry.js', 'utf8')

const grab = name => {
  const m = src.match(new RegExp('const ' + name + ' = \\{([^}]*)\\}'))
  return m[1]
}
const parse = o =>
  Object.fromEntries(
    o.split(',').map(p => p.trim().split(':')).map(([k, v]) => [k.trim(), Number(v)])
  )
const rd = src
  .match(/const ROAD = \[([\s\S]*?)\n\]/)[1]
  .match(/\[[^\]]*\]/g)
  .map(s => JSON.parse(s.replace(/\s+/g, '')))
const len = ([x0, z0, x1, z1]) => Math.hypot(x1 - x0, z1 - z0)

const A = rd[2], B = rd[0], C = rd[1], D = rd[3], E = rd[4]
const s1 = parse(grab('SLOT1')), s2 = parse(grab('SLOT2'))
const ok = (label, cond) => console.log((cond ? 'PASS' : 'FAIL') + '  ' + label)

console.log('lengths:', { A: len(A), B: len(B), C: len(C), D: len(D), E: len(E) })
const eq = (a, b) => Math.abs(a - b) < 1e-9
ok('A=B=C=D=6000, E=15000', [A, B, C, D].every(s => eq(len(s), 6)) && eq(len(E), 15))
ok('B/C horizontal gap = 3000', eq(Math.abs(B[0] - C[0]), 3))
ok('A/D to E vertical gap = 3000', eq(E[3] - A[3], 3) && eq(E[3] - D[3], 3))
ok('A⊥B mirror-L (share corner)', eq(A[3], B[3]) && eq(A[2], B[2]))
ok('C⊥D L (share corner)', eq(D[1], C[3]) && eq(D[0], C[2]))
ok('slot1 = 2700×5300, right edge flush with C', eq(s1.x1 - s1.x0, 2.7) && eq(s1.z1 - s1.z0, 5.3) && eq(s1.x1, C[0]))
ok('slot2 = 5300×2700, bottom edge flush with E', eq(s2.x1 - s2.x0, 5.3) && eq(s2.z1 - s2.z0, 2.7) && eq(s2.z1, E[3]))
ok('slot1 inside B/C stem (z -6..0)', s1.z0 >= -6 && s1.z1 <= 0)
ok('slot2 inside A/D-E corridor (z 0..3)', s2.z0 >= 0 && s2.z1 <= 3)
ok('spawn at slot1 center', eq((s1.z0 + s1.z1) / 2, -3))
