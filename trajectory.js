/* SI units. Gravity, spin-dependent drag and Magnus lift; first ground contact.
   Nathan's published calculator coefficients: docs/trajectory.md. */
(function (root) {
  'use strict';
  const defaults = Object.freeze({ gravity: 9.80665, mass: 0.145, radius: 0.0366,
    airDensity: 1.225, dragCoefficient: 0.3008, spinDragCoefficient: 0.0292,
    backspinRpm: 0, sidespinRpm: 0, gyrospinRpm: 0,
    lift0: 0.583, lift1: 2.333, lift2: 1.120,
    launchHeight: 1, timeStep: 0.005 });
  function estimateSpin(speedKmh, launchAngle, direction, batterHand = 'R') {
    if (![speedKmh,launchAngle,direction].every(Number.isFinite) || speedKmh<0 ||
        Math.abs(launchAngle)>90 || Math.abs(direction)>180 || !['R','L'].includes(batterHand)) {
      throw new Error('유효하지 않은 회전 추정 입력입니다.');
    }
    // Nathan's average-spin relations (R=+1, L=-1):
    // wb=-763+120*theta+21*phi*hand; ws=-849*hand-94*phi.
    // Speed controls launch and aerodynamic forces, with no invented rpm scaling.
    const hand=batterHand==='R'?1:-1;
    const limit=value=>Math.max(-5000,Math.min(5000,value));
    return {backspinRpm:speedKmh===0?0:limit(-763+120*launchAngle+21*direction*hand),
      sidespinRpm:speedKmh===0?0:limit(-849*hand-94*direction),gyrospinRpm:0};
  }
  function simulate(speedKmh, launchAngle, direction, options = {}) {
    const {batterHand='R',...physicalOptions}=options;
    const c = { ...defaults, ...estimateSpin(speedKmh,launchAngle,direction,batterHand), ...physicalOptions };
    if (![speedKmh, launchAngle, direction, ...Object.values(c)].every(Number.isFinite) ||
        speedKmh < 0 || Math.abs(launchAngle) > 90 || Math.abs(direction) > 180 ||
        c.gravity <= 0 || c.mass <= 0 || c.radius <= 0 || c.airDensity < 0 ||
        c.dragCoefficient < 0 || c.spinDragCoefficient < 0 || Math.abs(c.backspinRpm) > 15000 ||
        Math.abs(c.sidespinRpm)>15000 || Math.abs(c.gyrospinRpm)>15000 ||
        c.lift0 <= 0 || c.lift1 < 0 || c.lift2 < 0 ||
        c.launchHeight < 0 || c.timeStep <= 0 || c.timeStep > 0.05) {
      throw new Error('유효하지 않은 비행 계산 입력입니다.');
    }
    const radians = Math.PI / 180;
    const v = speedKmh / 3.6, angle = launchAngle * radians, bearing = direction * radians;
    let state = [0, 0, c.launchHeight, v * Math.cos(angle) * Math.sin(bearing),
      v * Math.cos(angle) * Math.cos(bearing), v * Math.sin(angle)];
    const aerodynamic = c.airDensity * Math.PI * c.radius ** 2 / (2 * c.mass);
    const toOmega=Math.PI/30, wb=c.backspinRpm*toOmega,
      ws=c.sidespinRpm*toOmega, wg=c.gyrospinRpm*toOmega;
    // Rotate back/side/gyro spin from the launch frame into the world frame.
    const wx=wb*Math.cos(bearing)-ws*Math.sin(angle)*Math.sin(bearing)+wg*Math.cos(angle)*Math.sin(bearing);
    const wy=-wb*Math.sin(bearing)-ws*Math.sin(angle)*Math.cos(bearing)+wg*Math.cos(angle)*Math.cos(bearing);
    const wz=ws*Math.cos(angle)+wg*Math.sin(angle);
    function derivative(s) {
      const magnitude = Math.hypot(s[3], s[4], s[5]);
      const crossX=wy*s[5]-wz*s[4],crossY=wz*s[3]-wx*s[5],crossZ=wx*s[4]-wy*s[3];
      const crossMagnitude=Math.hypot(crossX,crossY,crossZ);
      const perpendicularOmega=magnitude>1e-12?crossMagnitude/magnitude:0;
      const spinFactor = magnitude > 1e-12 ? c.radius * perpendicularOmega / magnitude : 0;
      const cl = c.lift2 * spinFactor / (c.lift0 + c.lift1 * spinFactor);
      const cd=c.dragCoefficient+c.spinDragCoefficient*(perpendicularOmega/toOmega)/1000;
      const drag = aerodynamic * cd * magnitude;
      const lift = crossMagnitude>1e-12 ? aerodynamic*cl*magnitude*magnitude/crossMagnitude : 0;
      // F_M is parallel to omega cross velocity, perpendicular to velocity.
      return [s[3], s[4], s[5], -drag * s[3] + lift * crossX,
        -drag * s[4] + lift * crossY, -c.gravity - drag * s[5] + lift * crossZ];
    }
    function step(s, dt) {
      const k1 = derivative(s);
      const k2 = derivative(s.map((value, i) => value + dt * k1[i] / 2));
      const k3 = derivative(s.map((value, i) => value + dt * k2[i] / 2));
      const k4 = derivative(s.map((value, i) => value + dt * k3[i]));
      return s.map((value, i) => value + dt * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) / 6);
    }
    const point = (s, t) => ({ t, x: s[0], y: s[1], z: s[2], vx: s[3], vy: s[4], vz: s[5] });
    const points = [point(state, 0)];
    let t = 0, maxHeight = c.launchHeight;
    if (!(c.launchHeight === 0 && state[5] <= 0)) {
      for (let i = 0; i < Math.ceil(30 / c.timeStep); i++) {
        const next = step(state, c.timeStep);
        if (next[2] <= 0) {
          const fraction = state[2] / (state[2] - next[2]);
          const contact = state.map((value, j) => value + fraction * (next[j] - value));
          contact[2] = 0;
          t += fraction * c.timeStep;
          points.push(point(contact, t));
          state = contact;
          break;
        }
        state = next; t += c.timeStep;
        maxHeight = Math.max(maxHeight, state[2]);
        points.push(point(state, t));
      }
      if (state[2] > 0) throw new Error('지면 접촉까지의 계산 시간이 초과되었습니다.');
    }
    const isFoul=state[1]<-1e-7||Math.abs(state[0])>state[1]+1e-7;
    return { points, distance: Math.hypot(state[0], state[1]), duration: t, isFoul,
      maxHeight, landing: point(state, t), constants: c, batterHand };
  }
  root.BaseballTrajectory = { simulate, estimateSpin, defaults };
})(typeof window === 'undefined' ? globalThis : window);
