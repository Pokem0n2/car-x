# v1.7.7 手术 (基于 fix5):
# ① 主循环 try/catch 兜底 + 连续 60 帧异常自愈 reload
# ② parkCar 幂等守卫
# ③ motor 参数式控制: enabled 恒 !0 (与原源一致, 绝不 disable);
#    staticPin/spaceLock 时 targetVel=0, maxImpulse=0 (无力电机, 参数归零而非开关切换)
app = open('/tmp/e3d-test/app-v15m-fix5.js', encoding='utf-8', errors='replace').read()

# ① 主循环兜底 + 自愈
old1 = 'this.renderer.setAnimationLoop(()=>{this._update()}),this._isRunning=!0'
new1 = ('this.renderer.setAnimationLoop(()=>{try{this._update(),this._ec=0}catch(e){'
        'if(++this._ec>60)try{location.reload()}catch(_){}}}),this._isRunning=!0')
assert app.count(old1) == 1, 'loop anchor: %d' % app.count(old1)
app = app.replace(old1, new1)

# ② parkCar 幂等
old2 = 'parkCar(){this._parked=!0;for(let e of this.allBodies)e.ammo.setLinearVelocity(this._zeroV),e.ammo.setAngularVelocity(this._zeroV)}'
new2 = 'parkCar(){if(this._parked)return;this._parked=!0;for(let e of this.allBodies)e.ammo.setLinearVelocity(this._zeroV),e.ammo.setAngularVelocity(this._zeroV)}'
assert app.count(old2) == 1, 'parkCar anchor: %d' % app.count(old2)
app = app.replace(old2, new2)

# ③ motor 参数式: A 模式静止(cruiseDir=0)时 P 原源用 h(min 20) — 锁轮力 20 持续
#    改为静止时 A=0,P=0 (完全无力), 但 enabled 恒真
old3 = 'let e=this._spaceLock?0:0!==this.cruiseDir?-this.cruiseDir*(this.cruiseSpeed/mr):0,t=this._spaceLock?50:0!==this.cruiseDir?.25:c;this.motorBackLeft.enableAngularMotor(!0,e,t)'
new3 = 'let e=this._spaceLock?0:0!==this.cruiseDir?-this.cruiseDir*(this.cruiseSpeed/mr):0,t=this._spaceLock?0:0!==this.cruiseDir?.25:0;this.motorBackLeft.enableAngularMotor(!0,e,t)'
assert app.count(old3) == 1, 'motor anchor: %d' % app.count(old3)
app = app.replace(old3, new3)

open('/tmp/e3d-test/app-v15m-fix9.js', 'w').write(app)
print('edits 3/3 OK')
import subprocess
r = subprocess.run(['node', '--check', '/tmp/e3d-test/app-v15m-fix9.js'], capture_output=True, text=True)
print('SYNTAX_OK' if r.returncode == 0 else r.stderr[:200])
