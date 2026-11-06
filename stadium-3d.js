/* Dependency-free perspective rendering of a metric 3D baseball field. */
(function (root) {
  'use strict';
  const PI = Math.PI;
  const stadiums = root.KBOStadiums;
  if (!stadiums || !stadiums.length) throw new Error('구장 정보를 불러올 수 없습니다.');
  const spec = Object.freeze({ foulDistance: 100, centerDistance: 125, fenceHeight: 2.6,
    baseDistance: 27.432, moundDistance: 18.44 });
  // Schematic neutral defense in metres; these markers are not prediction inputs.
  const defenders = Object.freeze([
    { role: '투수', position: [0, spec.moundDistance, 0.7] },
    { role: '포수', position: [0, -3, 0.7] },
    { role: '1루수', position: [23, 27, 0.7] },
    { role: '2루수', position: [12, 37, 0.7] },
    { role: '유격수', position: [-13, 36, 0.7] },
    { role: '3루수', position: [-24, 27, 0.7] },
    { role: '좌익수', position: [-49, 76, 0.7] },
    { role: '중견수', position: [0, 100, 0.7] },
    { role: '우익수', position: [49, 76, 0.7] }
  ]);
  function infieldGeometry() {
    const base = spec.baseDistance / Math.SQRT2;
    const diamond = [[0,0,.08],[base,base,.08],[0,2*base,.08],[-base,base,.08]];
    const grass = diamond.map(([x,y,z]) => [x*.78,base+(y-base)*.78,z]);
    // The old 34m arc was centred on home, leaving second base outside the dirt.
    // Centre the rear edge on the mound and intersect it with both foul lines.
    const dirtRadius = 29;
    const intersection = (spec.moundDistance + Math.sqrt(2*dirtRadius**2-spec.moundDistance**2))/2;
    const extent = Math.atan2(intersection,intersection-spec.moundDistance);
    const dirt = [[0,-3,.05]];
    for(let i=0;i<=48;i++) {
      const a=-extent+2*extent*i/48;
      dirt.push([dirtRadius*Math.sin(a),spec.moundDistance+dirtRadius*Math.cos(a),.05]);
    }
    return {base,diamond,grass,dirt};
  }
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  function fenceDistance(angle, stadium = stadiums[0]) {
    angle = clamp(angle, -PI/4, PI/4);
    if (stadium.boundary) {
      // Ray/segment intersection keeps polygonal walls straight between anchors.
      const degrees = angle * 180 / PI;
      const anchors = stadium.boundary;
      let i = 0;
      while (i < anchors.length - 2 && degrees > anchors[i+1][0]) i++;
      const a = fieldPoint(anchors[i][0]*PI/180, anchors[i][1]);
      const b = fieldPoint(anchors[i+1][0]*PI/180, anchors[i+1][1]);
      const dx = b[0]-a[0], dy = b[1]-a[1];
      return (a[0]*dy-a[1]*dx)/(Math.sin(angle)*dy-Math.cos(angle)*dx);
    }
    // Circular reconstruction through the left/centre/right reference distances.
    const poleY = stadium.left / Math.SQRT2;
    const centerY = (stadium.left**2-stadium.center**2)/(2*(poleY-stadium.center));
    const radius = stadium.center-centerY;
    return centerY * Math.cos(angle) + Math.sqrt(radius ** 2 - centerY ** 2 * Math.sin(angle) ** 2);
  }
  function fenceHeight(angle, stadium = stadiums[0]) {
    return stadium.rightWallHeight && angle >= PI/8 ? stadium.rightWallHeight : stadium.fenceHeight;
  }
  function fieldPoint(angle, distance, height = 0) {
    return [Math.sin(angle) * distance, Math.cos(angle) * distance, height];
  }
  const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const normalize = a => { const norm = Math.hypot(...a); return a.map(v => v / norm); };
  function cameraBasis(yaw, elevation, distance) {
    const target = [0, 56, 8];
    const eye = [target[0] + distance * Math.cos(elevation) * Math.sin(yaw),
      target[1] - distance * Math.cos(elevation) * Math.cos(yaw), target[2] + distance * Math.sin(elevation)];
    const forward = normalize(target.map((v, i) => v - eye[i]));
    const right = normalize(cross(forward, [0, 0, 1]));
    return { eye, forward, right, up: cross(right, forward) };
  }
  function project(point, basis, width, height) {
    const relative = point.map((v, i) => v - basis.eye[i]);
    const depth = dot(relative, basis.forward);
    if (depth <= 1) return null;
    const focal = Math.min(width, height * 1.5) * 1.05;
    return { x: width / 2 + dot(relative, basis.right) * focal / depth,
      y: height / 2 - dot(relative, basis.up) * focal / depth, depth };
  }
  function create(canvas) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('3D 화면을 표시할 수 없습니다.');
    let yaw = -0.24, elevation = 0.65, distance = 260;
    let width = 600, height = 420, flight = null, frame = 0;
    let stadium = stadiums[0];
    const infield = infieldGeometry();
    const pointers = new Map();
    let pinch = 0;
    const listeners = [];
    function listen(type, handler, options) {
      canvas.addEventListener(type, handler, options);
      listeners.push([type, handler, options]);
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
    }
    function resize() {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width); height = Math.max(1, bounds.height);
      const ratio = Math.min(root.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      schedule();
    }
    function draw() {
      const basis = cameraBasis(yaw, elevation, distance);
      const p = point => project(point, basis, width, height);
      const faces = [], lines = [], labels = [];
      const face = (points, color, stroke) => {
        const projected = points.map(p);
        const flat = points.every(q => q[2] === points[0][2]);
        const layer = flat ? (points[0][2] < 0 ? 0 : (points[0][2] === 0 ? 1 : 2 + points[0][2])) : 4;
        if (projected.every(Boolean)) faces.push({ points: projected, color, stroke, layer,
          depth: projected.reduce((sum, q) => sum + q.depth, 0) / projected.length });
      };
      const line = (points, color, thickness = 1, dashed = false) => lines.push({ points, color, thickness, dashed });
      ctx.clearRect(0, 0, width, height);
      const background = ctx.createLinearGradient(0, 0, 0, height);
      background.addColorStop(0, '#0b1725'); background.addColorStop(1, '#122134');
      ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
      // Ground mat and foul territory are schematic; all playing dimensions use metres.
      face([[-105,-18,-0.25],[105,-18,-0.25],[115,150,-0.25],[-115,150,-0.25]], '#142c2b');
      const segments = 72;
      // Include actual profile corners so a mesh triangle never cuts across a
      // straight-wall junction or the start of a high-wall section.
      const angles = Array.from({length:segments+1},(_,i)=>-PI/4+i*PI/2/segments);
      for(const [degree] of stadium.boundary||[])angles.push(degree*PI/180);
      if(stadium.rightWallHeight)angles.push(PI/8);
      const breaks = [...new Set(angles)].sort((a,b)=>a-b);
      for (let i = 0; i < breaks.length-1; i++) {
        const a = breaks[i], b = breaks[i+1];
        const pa = fieldPoint(a, fenceDistance(a,stadium)), pb = fieldPoint(b, fenceDistance(b,stadium));
        const wall = fenceHeight((a+b)/2,stadium);
        face([[0,0,0], pa, pb], Math.floor(i/6)%2 ? '#225a43' : '#29664a');
        face([pa,pb,[pb[0],pb[1],wall],[pa[0],pa[1],wall]], '#174b48', '#477669');
        // Low raised rim gives the boundary depth without inventing seating geometry.
        line([[pa[0],pa[1],wall],[pb[0],pb[1],wall]], '#72a18c', 1.4);
      }
      const {base,diamond,grass,dirt} = infield;
      face(dirt,'#9b805d');
      const homeDirt=[];
      for(let i=0;i<32;i++)homeDirt.push([3.2*Math.cos(i*PI/16),3.2*Math.sin(i*PI/16),.06]);
      face(homeDirt,'#9b805d');
      face(grass,'#367451');
      line([...diamond,diamond[0]], '#dfcba5',1);
      for (const sign of [-1,1]) {
        const pole=fieldPoint(sign*PI/4,sign<0?stadium.left:stadium.right);
        line([[0,0,0.12],pole], '#e1e6ce',1.4);
        line([pole,[pole[0],pole[1],12]], '#e8cf70',2);
      }
      for (const [x,y] of [[base,base],[0,2*base],[-base,base]]) {
        const size=.38;
        face([[x-size,y,0.14],[x,y-size,0.14],[x+size,y,0.14],[x,y+size,0.14]], '#f7eee0');
      }
      face([[-.216,-.216,.15],[.216,-.216,.15],[.216,0,.15],[0,.216,.15],[-.216,0,.15]],'#ffffff');
      const mound=[];
      for(let i=0;i<28;i++) mound.push([Math.cos(i*PI/14)*2.7,spec.moundDistance+Math.sin(i*PI/14)*2.7,.25]);
      face(mound,'#ab906b');
      line([[-.3,spec.moundDistance,.28],[.3,spec.moundDistance,.28]],'#fff4de',2);
      labels.push([fieldPoint(-PI/4,stadium.left+6,5),`좌측 ${stadium.left}m`],
        [[0,stadium.center+5,5],`중앙 ${stadium.center}m`],
        [fieldPoint(PI/4,stadium.right+6,5),`우측 ${stadium.right}m`]);
      if(flight) {
        const apex=flight.points.reduce((best,q)=>q.z>best.z?q:best,flight.points[0]);
        line([[apex.x,apex.y,0],[apex.x,apex.y,apex.z]],'#5e8191',1,true);
        labels.push([[apex.x,apex.y,apex.z+4],`${flight.maxHeight.toFixed(1)}m`]);
      }
      faces.sort((a,b)=>a.layer-b.layer || b.depth-a.depth);
      for (const f of faces) {
        ctx.beginPath();f.points.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.closePath();
        ctx.fillStyle=f.color;ctx.fill();if(f.stroke){ctx.strokeStyle=f.stroke;ctx.lineWidth=.5;ctx.stroke();}
      }
      function drawLine(points,color,thickness,dashed) {
        ctx.beginPath();let started=false;
        for(const point of points){const q=p(point);if(!q){started=false;continue;}if(!started){ctx.moveTo(q.x,q.y);started=true;}else ctx.lineTo(q.x,q.y);}
        ctx.strokeStyle=color;ctx.lineWidth=thickness;ctx.setLineDash(dashed?[4,5]:[]);ctx.stroke();ctx.setLineDash([]);
      }
      for(const l of lines) drawLine(l.points,l.color,l.thickness,l.dashed);
      for(const defender of defenders) {
        const q=p(defender.position);if(!q)continue;
        const size=clamp(950/q.depth,2.8,5);
        ctx.beginPath();ctx.arc(q.x,q.y,size+3,0,PI*2);ctx.fillStyle='#ffcc8028';ctx.fill();
        ctx.beginPath();ctx.arc(q.x,q.y,size,0,PI*2);ctx.fillStyle='#ffcf8a';ctx.fill();
        ctx.strokeStyle='#142132';ctx.lineWidth=1.2;ctx.stroke();
      }
      if(flight) {
        const points=flight.points.filter((_,i,all)=>i%3===0||i===all.length-1);
        drawLine(points.map(q=>[q.x,q.y,.18]),'#648a91',1,true);
        drawLine(points.map(q=>[q.x,q.y,q.z]),'#79c9ff',3,false);
        for(const [point,color,r] of [[points[0],'#ffffff',3],[flight.landing,'#62d9b4',5]]) {
          const q=p([point.x,point.y,point.z]);if(!q)continue;
          ctx.beginPath();ctx.arc(q.x,q.y,r+5,0,PI*2);ctx.fillStyle=color+'22';ctx.fill();
          ctx.beginPath();ctx.arc(q.x,q.y,r,0,PI*2);ctx.fillStyle=color;ctx.fill();
        }
      }
      ctx.textAlign='center';ctx.font='11px "Segoe UI","Malgun Gothic",sans-serif';
      for(const [position,text] of labels){const q=p(position);if(q&&q.x>30&&q.x<width-30&&q.y>15&&q.y<height-10){ctx.lineWidth=4;ctx.strokeStyle='#0d1b24';ctx.strokeText(text,q.x,q.y);ctx.fillStyle='#d3e4df';ctx.fillText(text,q.x,q.y);}}
      ctx.textAlign='left';ctx.fillStyle='#92a6bc';ctx.font='10px "Segoe UI","Malgun Gothic",sans-serif';
      ctx.fillText(`${stadium.left} / ${stadium.center} / ${stadium.right}m`,14,height-15);
    }
    function zoom(factor) { distance=clamp(distance*factor,140,480);schedule(); }
    function reset() { yaw=-.24;elevation=.65;distance=260;schedule(); }
    const separation=()=>{const a=[...pointers.values()];return a.length>=2?Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y):0;};
    listen('pointerdown',event=>{pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');pinch=separation();canvas.focus({preventScroll:true});});
    listen('pointermove',event=>{
      const previous=pointers.get(event.pointerId);if(!previous)return;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pointers.size===1){yaw-=(event.clientX-previous.x)*.008;elevation=clamp(elevation+(event.clientY-previous.y)*.006,.10,1.50);schedule();}
      else {const next=separation();if(pinch>0&&next>0)zoom(pinch/next);pinch=next;}
    });
    const release=event=>{pointers.delete(event.pointerId);pinch=separation();if(!pointers.size)canvas.classList.remove('dragging');};
    listen('pointerup',release);listen('pointercancel',release);listen('lostpointercapture',release);
    listen('wheel',event=>{event.preventDefault();zoom(Math.exp(clamp(event.deltaY,-100,100)*.002));},{passive:false});
    listen('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home'].includes(event.key))return;
      event.preventDefault();
      if(event.key==='Home')reset();else if(event.key==='+'||event.key==='=')zoom(.85);else if(event.key==='-')zoom(1.18);
      else {if(event.key==='ArrowLeft')yaw-=.12;if(event.key==='ArrowRight')yaw+=.12;if(event.key==='ArrowUp')elevation=clamp(elevation+.08,.10,1.50);if(event.key==='ArrowDown')elevation=clamp(elevation-.08,.10,1.50);schedule();}
    });
    const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
    return {setFlight(value){flight=value;schedule();},
      setStadium(id){
        const selected=stadiums.find(item=>item.id===id);
        if(!selected)throw new RangeError(`알 수 없는 구장: ${id}`);
        stadium=selected;schedule();
      },reset,zoom,
      top(){elevation=1.50;yaw=0;distance=260;schedule();},
      destroy(){observer.disconnect();listeners.forEach(([type,fn,options])=>canvas.removeEventListener(type,fn,options));if(frame)cancelAnimationFrame(frame);}};
  }
  root.BaseballStadium3D={create,spec,stadiums,defenders,infieldGeometry,fenceDistance,fenceHeight,cameraBasis,project};
})(typeof window==='undefined'?globalThis:window);
