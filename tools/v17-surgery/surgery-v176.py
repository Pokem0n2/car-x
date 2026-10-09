# v1.7.6 手术: 主循环兜底 — 异常不再杀死 rAF 动画链
# 机制: three.js sn 内部 function r(t,a){n(t,a),i=e.requestAnimationFrame(r)} — n 抛异常则
#       requestAnimationFrame 永不执行 → 循环死亡 → 页面"假死"(UI活着/物理永久停摆)
# 修复: setAnimationLoop(()=>{this._update()}) 回调体包 try/catch
app = open('/tmp/e3d-test/app-v15m-fix5.js', encoding='utf-8', errors='replace').read()

old = 'this.renderer.setAnimationLoop(()=>{this._update()}),this._isRunning=!0'
new = 'this.renderer.setAnimationLoop(()=>{try{this._update()}catch(e){}}),this._isRunning=!0'
assert app.count(old) == 1, 'loop anchor not unique: %d' % app.count(old)
app = app.replace(old, new)
open('/tmp/e3d-test/app-v15m-fix6.js', 'w').write(app)
print('edit 1/1 OK')
import subprocess
r = subprocess.run(['node', '--check', '/tmp/e3d-test/app-v15m-fix6.js'], capture_output=True, text=True)
print('SYNTAX_OK' if r.returncode == 0 else r.stderr[:200])
