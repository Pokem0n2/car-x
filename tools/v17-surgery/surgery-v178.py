# v1.7.8 手术 (基于 fix10, 单点加法):
# A 模式同向二击 → cruiseDir=0 + 全刚体速度归零 (立即停, 等效 parkCar 的写法)
# 其余一切字节不动 (motors 参数式/rAF 兜底/自愈 reload/parkCar 幂等 全部保留)
app = open('/tmp/e3d-test/app-v15m-fix10.js', encoding='utf-8', errors='replace').read()

old = 'pressThrottle(e){if(this.throttleLocked)this.cruiseDir=this.cruiseDir===e?0:e;else{'
new = ('pressThrottle(e){if(this.throttleLocked){if(this.cruiseDir===e){this.cruiseDir=0;'
       'for(let t of this.allBodies)t.ammo.setLinearVelocity(this._zeroV),'
       't.ammo.setAngularVelocity(this._zeroV)}else this.cruiseDir=e}else{')

assert app.count(old) == 1, f'occurrences: {app.count(old)}'
app = app.replace(old, new)
open('/tmp/e3d-test/app-v15m-fix11.js', 'w', encoding='utf-8').write(app)

# 语法校验
import subprocess
r = subprocess.run(['node', '--check', '/tmp/e3d-test/app-v15m-fix11.js'], capture_output=True, text=True)
print('SYNTAX_OK' if r.returncode == 0 else r.stderr[:500])
print('delta bytes:', len(new) - len(old))
