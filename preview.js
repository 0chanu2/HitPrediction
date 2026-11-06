(() => {
  'use strict';
  const data = window.HITPREDICT_DESIGN_DATA;
  const byId = id => document.getElementById(id);
  if (!data || !window.HitPredictEngine || !window.BaseballTrajectory || !window.BaseballStadium3D) {
    byId('load-error').hidden = false;
    document.querySelectorAll('input,button,select').forEach(element => { element.disabled = true; });
    return;
  }
  let speed = 160, angle = 20, direction = 0, batterHand = 'R';
  const pct = value => `${(value * 100).toFixed(1)}%`;
  const number = value => value.toLocaleString('ko-KR');
  const text = (id, value) => { byId(id).textContent = value; };
  const classProbability = (probabilities, label) => probabilities[data.classes.indexOf(label)] || 0;
  const sumClasses = (probabilities, labels) => labels.reduce((sum, label) => sum + classProbability(probabilities, label), 0);
  const stadiumView = window.BaseballStadium3D.create(byId('stadium-3d'));
  const stadiumSelect = byId('stadium-select');
  for (const stadium of window.KBOStadiums) {
    const option = document.createElement('option');
    option.value = stadium.id;
    option.textContent = stadium.name;
    stadiumSelect.appendChild(option);
  }
  stadiumSelect.value = window.KBOStadiums[0].id;
  stadiumSelect.addEventListener('change', () => {
    stadiumView.setStadium(stadiumSelect.value);
    describeTrajectory();
  });
  byId('view-top').addEventListener('click', () => stadiumView.top());
  byId('view-reset').addEventListener('click', () => stadiumView.reset());
  byId('view-zoom-in').addEventListener('click', () => stadiumView.zoom(0.85));
  byId('view-zoom-out').addEventListener('click', () => stadiumView.zoom(1.18));
  function renderTrajectory() {
    const flight = window.BaseballTrajectory.simulate(speed, angle, direction, {batterHand});
    stadiumView.setFlight(flight);
    text('flight-distance', `${flight.distance.toFixed(1)} m`);
    text('flight-height', `${flight.maxHeight.toFixed(1)} m`);
    text('flight-time', `${flight.duration.toFixed(2)} s`);
    const spin = flight.constants;
    text('flight-spin-label', spin.backspinRpm < 0 ? '톱스핀' : '백스핀');
    text('flight-backspin', `${number(Math.round(Math.abs(spin.backspinRpm)))} rpm`);
    text('flight-sidespin', `${number(Math.round(spin.sidespinRpm))} rpm`);
    describeTrajectory();
    return flight;
  }
  function describeTrajectory() {
    const stadium = window.KBOStadiums.find(item => item.id === stadiumSelect.value);
    const spin = window.BaseballTrajectory.estimateSpin(speed,angle,direction,batterHand);
    text('trajectory-description', `${stadium.name}. ${batterHand==='R'?'우타':'좌타'}. 좌측 ${stadium.left}미터, 중앙 ${stadium.center}미터, 우측 ${stadium.right}미터. 예상 수직 회전 ${Math.round(spin.backspinRpm)}rpm, 사이드스핀 ${Math.round(spin.sidespinRpm)}rpm. 3D 타구 경로. 비거리 ${byId('flight-distance').textContent}, 최고 높이 ${byId('flight-height').textContent}, 체공 시간 ${byId('flight-time').textContent}`);
  }
  function renderOutcomes(probabilities, isFoul = false) {
    const detailedPct = value => value > 0 && value < 0.0001 ? '<0.01%' : `${(value * 100).toFixed(2)}%`;
    byId('hit-outcomes').innerHTML = data.hit_classes.map(label => `<div class="hit-outcome"><span>${data.class_labels[label]}</span><strong>${detailedPct(classProbability(probabilities, label))}</strong></div>`).join('');
    const outs = data.out_classes.filter(label => data.classes.includes(label));
    const outTotal = sumClasses(probabilities, outs);
    const ordered = outs.slice().sort((a, b) => classProbability(probabilities, b) - classProbability(probabilities, a));
    text('out-total', `아웃 결과 합계 ${pct(outTotal)}`);
    text('error-total', `실책 출루 ${detailedPct(classProbability(probabilities, 'field_error'))}`);
    text('choice-total', `야수선택 ${detailedPct(classProbability(probabilities, 'fielders_choice'))}`);
    text('likely-out', isFoul ? '예상 결과: 파울' : outTotal>0 ? `주요 아웃: ${data.class_labels[ordered[0]]} · 아웃 결과 중 ${pct(classProbability(probabilities, ordered[0]) / outTotal)}` : '');
    byId('non-hit-outcomes').innerHTML = isFoul ? '<div class="outcome-row"><span>파울</span><div class="outcome-track" aria-hidden="true"><i style="width:100%"></i></div><strong>100.00%</strong></div>' : [...ordered, 'field_error', 'fielders_choice'].map(label => {
      const p = classProbability(probabilities, label);
      return `<div class="outcome-row"><span>${data.class_labels[label]}</span><div class="outcome-track" aria-hidden="true"><i style="width:${p * 100}%"></i></div><strong>${detailedPct(p)}</strong></div>`;
    }).join('');
  }
  function update() {
    byId('input-error').hidden = true;
    document.querySelector('.results').hidden = false;
    document.querySelector('.observed-panel').hidden = false;
    byId('outcome-details').hidden = false;
    byId('speed').value = byId('speed-range').value = speed;
    byId('angle').value = byId('angle-range').value = angle;
    byId('direction').value = direction;
    byId('batter-hand').value = batterHand;
    const flight = renderTrajectory();
    const probabilities = flight.isFoul ? data.classes.map(() => 0) : window.HitPredictEngine.predict(data, [speed / 1.609344, angle, direction]);
    const value = sumClasses(probabilities, data.hit_classes);
    text('hit-probability', (value * 100).toFixed(1));
    text('condition-label', `${speed} km/h · 발사각 ${angle}° · 방향 ${direction}°${flight.isFoul?' · 파울':''}`);
    text('hit-small', pct(value));
    text('non-hit', pct(1 - value));
    byId('hit-bar').style.width = `${value * 100}%`;
    renderOutcomes(probabilities, flight.isFoul);
    const observed = { count: 0, hits: 0 };
    for (const [s, a, d, hit] of data.observations) {
      if (Math.abs(s - speed / 1.609344) <= 5 / 1.609344 && Math.abs(a - angle) <= 2.5 && Math.abs(d - direction) <= 5) {
        observed.count++; observed.hits += hit;
      }
    }
    text('observed-rate', observed.count ? pct(observed.hits / observed.count) : '표본 없음');
    text('observed-description', `${number(observed.count)}개 유사 타구 중 ${number(observed.hits)}개 안타`);
    const sample = data.sample_info;
    text('observed-sample-info', `${sample.source} · ${sample.start.replaceAll('-', '.')}–${sample.end.replaceAll('-', '.')} · 전체 ${number(data.observations.length)}개`);
    text('direction-value', direction === 0 ? '중앙' : `${direction < 0 ? '좌측' : '우측'} ${Math.abs(direction)}°`);
  }
  function bindInput(name, minimum, maximum) {
    byId(`${name}-range`).addEventListener('input', event => {
      if (name === 'speed') speed = Number(event.target.value);
      else angle = Number(event.target.value);
      update();
    });
    byId(name).addEventListener('change', event => {
      const raw = event.target.value;
      const value = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(value) || value < minimum || value > maximum) {
        text('input-error', `${name === 'speed' ? '속도' : '발사각'}를 ${minimum}~${maximum} 범위의 숫자로 입력하세요.`);
        byId('input-error').hidden = false;
        document.querySelector('.results').hidden = true;
        document.querySelector('.observed-panel').hidden = true;
        byId('outcome-details').hidden = true;
        return;
      }
      const rounded = Math.round(value);
      if (name === 'speed') speed = rounded;
      else angle = rounded;
      update();
    });
  }
  bindInput('speed', 100, 200);
  bindInput('angle', -40, 70);
  byId('direction').addEventListener('input', event => { direction = Number(event.target.value); update(); });
  byId('batter-hand').addEventListener('change', event => { batterHand = event.target.value; update(); });
  byId('reset').addEventListener('click', () => { speed = 160; angle = 20; direction = 0; batterHand = 'R'; update(); });
  update();
})();
