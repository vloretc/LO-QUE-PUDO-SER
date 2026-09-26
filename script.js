const CONFIG = {
  minDistance: .015, maxDistance: .55,
  approachSpeed: .22, separationSpeed: .12,
  minBrightness: .48, maxBrightness: 1.65,
  minGlow: 8, maxGlow: 42, minBlur: 2.2, maxBlur: 13,
  minOpacity: .30, maxOpacity: .87,
  minVolume: .12, maxVolume: 1,
  inactivityTime: 4000, lostHandTime: 5000, resetDetectionTime: 10000,
  climaxDuration: 2800, separationDuration: 8500, closingDuration: 6500,
  circleMinRadius: .065, circleTolerance: .32, circleMaxDuration: 5500,
  circleMinDuration: 800, circleMinTurn: Math.PI * 1.80,
  circleClosure: .70, circleMinCoherence: .82,
  // Cierre con latidos: ritmo inicial/final (BPM), cierres de mano a tiempo para terminar,
  // duración máxima si nadie sigue el ritmo, velocidad final de la música y fundido a negro (ms)
  heartStartBPM: 72, heartEndBPM: 30, heartHitsToEnd: 7, heartMaxDuration: 150000,
  // Inicio: tiempo sosteniendo la palma para empezar (ms) y vueltas de círculo para dibujar la segunda silueta
  detectHoldTime: 5000, revealTurns: 3,
  // Desaparición de la silueta derecha (ms) y pausa extra antes de centrar la azul
  // fadeSecondDuration cuenta desde que el blanco empieza a bajar su opacidad
  fadeSecondDuration: 12000, fadeSecondPause: 1500,
  // Tiempo sin detectar la mano antes de mostrar el aviso (ms)
  handLostMessageTime: 2000,
  // En "Todo parece perfecto": segundos solo con el título antes de pedir la palma (ms)
  wipeReadTime: 3000,
  // Conocerse: veces que se acerca/aleja, tiempo sosteniendo cerca antes del destello (ms)
  // y meetSpeed = qué tan rápido siguen las siluetas a la mano (menor = más lento)
  // meetDelta: cuánto debe cambiar el tamaño de la mano en cámara para contar un acercar/alejar (menor = más sensible)
  // meetFarVolume: volumen de la música cuando están lejos (0 a 1); al acercarse sube a maxVolume
  meetFarVolume: .15,
  meetCycles: 3, meetHoldTime: 2500, meetSpeed: .8, meetDelta: .06,
  // Destello: velocidad a la que se despeja mientras pasas la palma y, ya iniciado, por sí solo (por segundo)
  wipeSwipeSpeed: .14, wipeDriftSpeed: .05,
  musicEndRate: .6, blackFadeDuration: 4500,
  // Latidos: volumen de la música al empezar (fracción), volumen del latido, y cuánto debe cerrarse
  // la mano para contar (menor = más sensible)
  heartMusicVolume: .3, heartVolume: 1.6, pumpDelta: .3,
  gestureConfirmTime: 280, palmExtendedCount: 4, fistCurledCount: 4,
  openFingerRatio: 1.40, closedFingerRatio: 1.04,
  minDetectionConfidence: .65, minTrackingConfidence: .65,
  landmarkSmoothing: .42, motionThreshold: .035, detectionFPS: 20,
  colors: { left: ['#555be7','#8775d8','#9d92f6'], right: ['#ce509f','#8f4bc3','#ef9cda'] },
  silhouetteMode: 'svg',
  leftImage: 'assets/images/silueta-izquierda.png',
  rightImage: 'assets/images/silueta-derecha.png',
  audio: 'musica.mpeg',
  mediapipe: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21',
  model: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
};
const $ = id => document.getElementById(id);
const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
const lerp = (a,b,t) => a+(b-a)*t;
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y,(a.z||0)-(b.z||0));
const smooth = (a,b,dt,speed=3) => lerp(a,b,1-Math.exp(-dt*speed));
const ease = t => t*t*(3-2*t);

let state='rest', stateAt=0, progress=0, shownProgress=0, departing=0, shownDeparture=0;
let handPresent=false, lastSeen=0, lastActivity=0, gesture='none', candidate='none', candidateAt=0;
let smoothedLandmarks=null, activityAnchor=null, palmSince=0, idle=false;
let landmarker=null, stream=null, starting=false, lastVideoTime=-1, lastInference=0;
let circlePoints=[], circleTarget=0, circleVisual=0, circleLastMotion=0;
let previousTime=performance.now(), toastUntil=0, messageKey='', muted=false;
let returnStart=0, rewindStart=0;

let rawLandmarks = null;
let wipingProgress = 0;
let previousHandX = 0;

let particleProgress = 0;
let visualParticleProgress = 0;
let lastPumpGesture = 'none';

let holdStartTime = 0;
// Círculo inicial con palma abierta
let circleDone = false, circleHint = '', revealTurn = 0;
// Cierre: latidos
let endProgress = 0, centerShift = 0, beatPulse = 0, hitPulse = 0;
let nextBeatAt = 0, lastBeatAt = 0, beatIndex = 0, lastHitBeat = -1, lastHitAt = 0;
let pumpClosed = false, pumpMax = 0, pumpMin = 9;
let fistEventAt = 0, handledFistAt = 0, pumpArmed = false, shownEnd = 0, pumpWasHit = false;
let musicRate = 1;
let wipeStartAt = 0;
let meetCycles = 0, meetPhase = 'far', meetLocalMin = null, meetLocalMax = 0, meetPeak = 0, swipeUntil = 0, wipeStarted = false;

const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const video=$('video'), canvas=$('landmarks'), ctx=canvas.getContext('2d');

function silhouette(side){
 const c=CONFIG.colors[side];
 return `<svg viewBox="0 0 400 600" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="body-${side}" x1="0" y1=".7" x2="1" y2=".3"><stop stop-color="${c[0]}" stop-opacity=".02"/><stop offset=".58" stop-color="${c[0]}" stop-opacity=".58"/><stop offset="1" stop-color="${c[1]}"/></linearGradient><radialGradient id="light-${side}" cx=".8" cy=".35" r=".67"><stop stop-color="${c[2]}" stop-opacity=".72"/><stop offset=".6" stop-color="${c[1]}" stop-opacity=".13"/><stop offset="1" stop-color="${c[0]}" stop-opacity="0"/></radialGradient></defs><g ${side==='right'?'transform="translate(400 0) scale(-1 1)"':''}><path id="profile-${side}" d="M24 600 C28 503 81 465 155 435 C192 420 201 390 194 362 C168 340 150 314 145 277 C124 210 130 121 176 79 C212 45 272 56 300 88 C322 111 319 146 316 174 C314 195 338 216 350 235 C353 243 333 249 322 252 C319 264 330 270 329 279 C326 285 316 285 318 293 C329 309 306 328 280 329 C260 332 256 366 266 399 C280 438 340 452 382 515 L400 600 Z" fill="url(#body-${side})"/><use href="#profile-${side}" fill="url(#light-${side})"/><path d="M298 92 C320 123 309 159 316 181 C320 201 341 222 350 237 C341 247 326 246 322 255 C318 265 330 274 324 281 C315 285 317 292 321 300 C322 317 301 327 279 330" fill="none" stroke="${c[2]}" stroke-width="3" opacity=".37"/></g></svg>`;
}
for(const side of ['left','right']){
 const el=$(side); el.innerHTML=silhouette(side);
 if(CONFIG.silhouetteMode==='png'){
  const img=new Image();img.alt=''; img.onload=()=>el.replaceChildren(img);
  img.onerror=()=>console.warn(`No se encontró ${side}: usando SVG.`);
  img.src=CONFIG[`${side}Image`];
 }
}

class Soundscape {
 constructor(){this.context=null;this.media=null;this.useMedia=false;this.volume=0;this.nodes=[];this.rate=1;}
 async start(){
  if(this.context){
   await this.context.resume();
   // Al volver a entrar, la canción empieza desde el principio
   if(this.useMedia){this.media.currentTime=0;this.media.play().catch(()=>{});}
   return;
  }
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)return;
  this.context=new AudioContext();await this.context.resume();
  this.gain=this.context.createGain();this.gain.gain.value=0;
  this.filter=this.context.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=1200;
  this.filter.connect(this.gain);this.gain.connect(this.context.destination);
  // Canal propio para el latido: no se apaga con la música
  this.heartGain=this.context.createGain();this.heartGain.gain.value=muted?0:1;
  // Compresor para que el latido suene fuerte sin distorsionar
  const comp=this.context.createDynamicsCompressor();comp.threshold.value=-10;comp.ratio.value=8;
  this.heartGain.connect(comp);comp.connect(this.context.destination);
  this.media=new Audio(CONFIG.audio);this.media.loop=true;this.media.preload='auto';
  // Al ralentizar, el tono también baja (efecto de música que se apaga)
  this.media.preservesPitch=false;this.media.mozPreservesPitch=false;this.media.webkitPreservesPitch=false;
  // Abierto con doble clic (file://) el navegador no deja procesar el audio: se reproduce directo
  // y el volumen se controla en el propio elemento. Con servidor local pasa por el filtro.
  this.direct=location.protocol==='file:';
  if(this.direct)this.media.volume=0;
  else{const source=this.context.createMediaElementSource(this.media);source.connect(this.filter);}
  try{await this.media.play();this.useMedia=true;}
  catch(e){console.warn('No se pudo reproducir la música, uso el ambiente sintetizado:',e);this.ambient();}
 }
 ambient(){
  if(this.nodes.length)return;
  [130.81,155.56,196,261.63].forEach((frequency,i)=>{
   const osc=this.context.createOscillator(), amp=this.context.createGain();
   osc.type='sine';osc.frequency.value=frequency;osc.baseFrequency=frequency;osc.detune.value=i%2?4:-4;
   amp.gain.value=.035/(1+i*.25);osc.connect(amp);amp.connect(this.filter);osc.start();this.nodes.push(osc);
  });
 }
 // Latido "lub-dub": dos golpes graves; el espacio entre ellos crece al ralentizarse
 triggerHeartbeat(strength=1,interval=830){
  if(!this.context||!this.heartGain)return;
  const t0=this.context.currentTime, gap=clamp(interval/1000*.22,.16,.32);
  const thump=(at,level,freq)=>{
   const osc=this.context.createOscillator(),amp=this.context.createGain(),lp=this.context.createBiquadFilter();
   lp.type='lowpass';lp.frequency.value=freq>120?900:380;
   osc.type='triangle';osc.frequency.setValueAtTime(freq,at);osc.frequency.exponentialRampToValueAtTime(freq*.45,at+.15);
   amp.gain.setValueAtTime(.0001,at);amp.gain.exponentialRampToValueAtTime(Math.max(.001,level),at+.015);amp.gain.exponentialRampToValueAtTime(.0001,at+.24);
   osc.connect(lp);lp.connect(amp);amp.connect(this.heartGain);osc.start(at);osc.stop(at+.28);
  };
  const v=CONFIG.heartVolume;
  thump(t0,.9*strength*v,70);  thump(t0+gap,.55*strength*v,84);
  // Capa más aguda para que se escuche en bocinas pequeñas
  thump(t0,.45*strength*v,150); thump(t0+gap,.3*strength*v,170);
 }
 // Ralentiza la música (MP3 o ambiente sintetizado)
 setRate(rate){
  if(!this.context||Math.abs(rate-this.rate)<.004)return;
  this.rate=rate;
  if(this.media)this.media.playbackRate=rate;
  for(const osc of this.nodes)osc.frequency.setTargetAtTime(osc.baseFrequency*rate,this.context.currentTime,.3);
 }
 update(target,dt,cutoff){
  if(!this.context)return;
  this.volume=smooth(this.volume,muted?0:target,dt,2);
  this.gain.gain.setTargetAtTime(this.volume,this.context.currentTime,.12);
  if(this.direct&&this.media)this.media.volume=clamp(this.volume);
  this.filter.frequency.setTargetAtTime(cutoff,this.context.currentTime,.4);
  if(this.heartGain)this.heartGain.gain.setTargetAtTime(muted?0:1,this.context.currentTime,.05);
 }
 stop(){if(this.context)this.context.suspend();if(this.media)this.media.pause();}
}
const audio=new Soundscape();

function getHandProximity(points) {
  if (!points || !points.length) return 0;
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for(const p of points) {
    if(p.x < minX) minX = p.x;
    if(p.x > maxX) maxX = p.x;
    if(p.y < minY) minY = p.y;
    if(p.y > maxY) maxY = p.y;
  }
  return Math.max(maxX - minX, maxY - minY);
}

function classifyHand(points){
 let extended=0,curled=0;
 for(const base of [5,9,13,17]){
  const a=points[base],b=points[base+1],tip=points[base+3],w=points[0];
  const u={x:a.x-b.x,y:a.y-b.y,z:(a.z||0)-(b.z||0)};
  const v={x:tip.x-b.x,y:tip.y-b.y,z:(tip.z||0)-(b.z||0)};
  const cosine=(u.x*v.x+u.y*v.y+u.z*v.z)/(Math.hypot(u.x,u.y,u.z)*Math.hypot(v.x,v.y,v.z)||1);
  const ratio=dist(tip,w)/Math.max(.015,dist(a,w));
  if(ratio>CONFIG.openFingerRatio && cosine<-.4)extended++;
  if(ratio<CONFIG.closedFingerRatio || cosine>.15)curled++;
 }
 return extended>=CONFIG.palmExtendedCount?'open':curled>=CONFIG.fistCurledCount?'fist':'neutral';
}

function inspectCircle(points){
 if(points.length<10)return {progress:0,valid:false};
 const mean={x:0,y:0};for(const p of points){mean.x+=p.x/points.length;mean.y+=p.y/points.length;}
 let xx=0,xy=0,yy=0,bx=0,by=0;
 for(const p of points){const x=p.x-mean.x,y=p.y-mean.y,r=x*x+y*y;xx+=x*x;xy+=x*y;yy+=y*y;bx+=x*r/2;by+=y*r/2;}
 const det=xx*yy-xy*xy;if(Math.abs(det)<1e-9)return {progress:0,valid:false};
 const center={x:mean.x+(bx*yy-by*xy)/det,y:mean.y+(by*xx-bx*xy)/det};
 const radii=points.map(p=>Math.hypot(p.x-center.x,p.y-center.y));
 const radius=radii.reduce((a,b)=>a+b,0)/radii.length;
 if(radius<CONFIG.circleMinRadius||radius>.65)return {progress:0,valid:false};
 const error=Math.sqrt(radii.reduce((s,r)=>s+(r-radius)**2,0)/radii.length)/radius;
 let turn=0,total=0;for(let i=1;i<points.length;i++){
  let delta=Math.atan2(points[i].y-center.y,points[i].x-center.x)-Math.atan2(points[i-1].y-center.y,points[i-1].x-center.x);
  delta=Math.atan2(Math.sin(delta),Math.cos(delta));turn+=delta;total+=Math.abs(delta);
 }
 const coherence=Math.abs(turn)/Math.max(total,.001), duration=points.at(-1).t-points[0].t;
 const round=error<CONFIG.circleTolerance && coherence>CONFIG.circleMinCoherence;
 const completion=round?clamp(Math.abs(turn)/(Math.PI*2)):0;
 const closure=Math.hypot(points.at(-1).x-points[0].x,points.at(-1).y-points[0].y)/radius;
 return {progress:completion,valid:round && Math.abs(turn)>=CONFIG.circleMinTurn && closure<CONFIG.circleClosure && duration>=CONFIG.circleMinDuration && duration<=CONFIG.circleMaxDuration,radius,error,turn,coherence,center};
}
function resetCircle(){circlePoints=[];circleTarget=0;circleLastMotion=0;}
function trackCircle(center,now){
 // Solo cuenta con la palma abierta (se tolera 'neutral' por el desenfoque al moverse)
 if(!['open','neutral'].includes(gesture)){circlePoints=[];return;}
 const p={x:center.x*(video.videoWidth/video.videoHeight||4/3),y:center.y,t:now};
 // Ventana deslizante: los últimos 2,5 s de trayectoria bastan para saber si la mano gira
 while(circlePoints.length && now-circlePoints[0].t>2500)circlePoints.shift();
 const last=circlePoints.at(-1);
 if(!last){circlePoints.push(p);circleLastMotion=now;return;}
 const step=Math.hypot(p.x-last.x,p.y-last.y);
 if(step>.25){circlePoints=[p];return;}
 if(step>.007){
  circlePoints.push(p);circleLastMotion=now;circleHint='';
  if(circlePoints.length>=8){
   const c=inspectCircle(circlePoints);
   // Cada tramo de giro redondo dibuja un poco más de la silueta
   if(c.center && c.radius>=CONFIG.circleMinRadius && c.error<CONFIG.circleTolerance*1.3 && c.coherence>.7){
    let d=Math.atan2(p.y-c.center.y,p.x-c.center.x)-Math.atan2(last.y-c.center.y,last.x-c.center.x);
    d=Math.atan2(Math.sin(d),Math.cos(d));
    revealTurn+=Math.min(Math.abs(d),.6);
   }
  }
 }
 if(now-circleLastMotion>1200 && revealTurn>0)circleHint='Sigue trazando el círculo para terminar de dibujarla.';
}

// Qué tan abierta está la mano: distancia media de las puntas a la muñeca, relativa al tamaño de la palma
// (abierta ≈ 1,8–2; puño ≈ 0,9–1,1). No depende de confirmar el gesto, así responde rápido.
function handOpenness(pts){const w=pts[0],ref=Math.max(.01,dist(pts[9],w));return [8,12,16,20].reduce((a,i)=>a+dist(pts[i],w),0)/4/ref;}
function detectPump(now){
 const o=handOpenness(smoothedLandmarks);
 if(!pumpClosed){
  pumpMax=Math.max(pumpMax,o);
  // Se cerró lo suficiente respecto a lo más abierta que estuvo: cuenta un latido de la mano
  if(o<pumpMax-CONFIG.pumpDelta){pumpClosed=true;pumpMin=o;fistEventAt=now;}
 }else{
  pumpMin=Math.min(pumpMin,o);
  if(o>pumpMin+CONFIG.pumpDelta){pumpClosed=false;pumpMax=o;}
 }
}

function setState(next,now=performance.now()){
 state=next;stateAt=now;$('experience').dataset.state=state;
 if(next==='interaction'||next==='heartbeat'){lastActivity=now; idle=false;}
 if(next==='detection'){palmSince=0;gesture='none';candidate='none';}
 if(next==='forming'){resetCircle();circleDone=false;circleHint='';revealTurn=0;}
 if(next==='interaction'){meetCycles=0;meetPhase='far';meetLocalMin=null;meetLocalMax=0;meetPeak=0;holdStartTime=0;}
}
let handLostShown=false;
function showMessage(title='',detail='',status='',icon=false,force=false){
 if(handLostShown && !force)return; // el aviso de mano perdida tiene prioridad
 const key=[title,detail,status,icon].join('|');if(key===messageKey)return;messageKey=key;
 $('message-title').textContent=title;$('message-detail').textContent=detail;$('message-status').textContent=status;
 $('message-icon').style.display=icon?'block':'none';$('message-icon').style.margin='0 auto';$('message').classList.toggle('visible',!!title);
}
function notify(text,now){$('toast').textContent=text;toastUntil=now+3200;}
function processHand(points,now){
 if(!points){pumpClosed=false;pumpMax=0;handPresent=false;gesture='none';candidate='none';smoothedLandmarks=null;activityAnchor=null;palmSince=0;resetCircle();drawMonitor();return;}
 const wasPresent=handPresent;handPresent=true;lastSeen=now;
 smoothedLandmarks=points.map((p,i)=>smoothedLandmarks?{x:lerp(smoothedLandmarks[i].x,p.x,CONFIG.landmarkSmoothing),y:lerp(smoothedLandmarks[i].y,p.y,CONFIG.landmarkSmoothing),z:lerp(smoothedLandmarks[i].z,p.z,CONFIG.landmarkSmoothing)}:{...p});
 const detected=classifyHand(smoothedLandmarks);
 if(candidate!==detected){candidate=detected;candidateAt=now;}
 if(now-candidateAt>=CONFIG.gestureConfirmTime && gesture!==candidate){
  const before=gesture;gesture=candidate;lastActivity=now;idle=false;
  // Un "bombeo" = abrir la mano y después cerrarla (puño o casi puño)
  if(gesture==='open')pumpArmed=true;

 }
 const center=[0,5,9,13,17].reduce((a,i)=>({x:a.x+smoothedLandmarks[i].x/5,y:a.y+smoothedLandmarks[i].y/5}),{x:0,y:0});
 if(!wasPresent||!activityAnchor||dist(center,activityAnchor)>CONFIG.motionThreshold){lastActivity=now;idle=false;activityAnchor=center;}
 if(state==='forming')trackCircle(center,now);
 if(state==='heartbeat')detectPump(now);
 drawMonitor();
}

function drawMonitor(){
 $('gesture-label').textContent=handPresent?({open:'Palma abierta',fist:'Puño cerrado',neutral:'Mano detectada',none:'Confirmando…'}[gesture]):'Buscando mano...';
 if($('monitor').hidden)return;
 canvas.width=video.videoWidth||640;canvas.height=video.videoHeight||480;ctx.clearRect(0,0,canvas.width,canvas.height);
 if(!rawLandmarks || rawLandmarks.length === 0) return;
 
 const chains=[[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
 ctx.strokeStyle='#d4b9fa';ctx.lineWidth=2;
 for (const pts of rawLandmarks) {
   for(const chain of chains){
     ctx.beginPath();
     chain.forEach((n,i)=>ctx[i?'lineTo':'moveTo'](pts[n].x*canvas.width,pts[n].y*canvas.height));
     ctx.stroke();
   }
   ctx.fillStyle='#efc6e9';
   for(const p of pts){
     ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,3,0,Math.PI*2);ctx.fill();
   }
 }
}

async function start(){
 if(starting)return;starting=true;$('enter').disabled=true;$('retry').disabled=true;$('retry').hidden=true;
 const audioPromise=audio.start().catch(e=>console.warn('Audio no disponible:',e));
 setState('loading');showMessage('Levanta la mano','Colócala abierta frente a la cámara para comenzar.','Buscando mano…',true);
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Object.assign(new Error('secure-context'),{name:'SecureContextError'});
  // Primero con resolución sugerida; si la cámara no la admite, con cualquier configuración
  try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:640},height:{ideal:480}}});}
  catch(e){if(['NotAllowedError','PermissionDeniedError','SecurityError'].includes(e.name))throw e;stream=await navigator.mediaDevices.getUserMedia({audio:false,video:true});}
  video.muted=true;video.setAttribute('playsinline','');video.setAttribute('autoplay','');
  video.srcObject=stream;
  if(video.readyState<1)await new Promise(r=>{video.onloadedmetadata=r;setTimeout(r,3000);});
  try{await video.play();}catch(e){console.warn('Reintentando video:',e);await new Promise(r=>setTimeout(r,300));await video.play();}
  showMessage('Levanta la mano','Colócala abierta frente a la cámara para comenzar.','Buscando mano…',true);
  if(!landmarker){
   const {HandLandmarker,FilesetResolver}=await import(`${CONFIG.mediapipe}/vision_bundle.mjs`);
   const vision=await FilesetResolver.forVisionTasks(`${CONFIG.mediapipe}/wasm`);
   const options={baseOptions:{modelAssetPath:CONFIG.model,delegate:'GPU'},runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:CONFIG.minDetectionConfidence,minHandPresenceConfidence:.65,minTrackingConfidence:CONFIG.minTrackingConfidence};
   try{landmarker=await HandLandmarker.createFromOptions(vision,options);}
   catch{options.baseOptions.delegate='CPU';landmarker=await HandLandmarker.createFromOptions(vision,options);}
  }
  for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>{if(state!=='rest')fail('La cámara se desconectó.','Conéctala nuevamente para continuar.');});
  lastSeen=performance.now();lastVideoTime=-1;setState('detection');
  $('tracking').hidden=false;$('monitor').hidden=false;$('sound').hidden=false;$('leave').hidden=false;
 }catch(error){
  console.error('Cámara / reconocimiento:',error);
  const denied=['NotAllowedError','PermissionDeniedError','SecurityError'].includes(error.name);
  const missing=['NotFoundError','DevicesNotFoundError','OverconstrainedError'].includes(error.name);
  const busy=['NotReadableError','TrackStartError','AbortError'].includes(error.name);
  const insecure=error.name==='SecureContextError';
  fail(denied?'Necesitamos acceso a la cámara.':missing?'No encontramos una cámara.':busy?'La cámara está ocupada.':insecure?'Abre la experiencia desde el servidor local.':'No pudimos preparar la experiencia.',
   denied?'Permite la cámara en el navegador (ícono junto a la dirección) y en Ajustes del Sistema → Privacidad y seguridad → Cámara.':missing?'Comprueba que esté conectada.':busy?'Cierra otras apps que la usen (Zoom, FaceTime, Photo Booth) e intenta de nuevo.':insecure?'Usa iniciar.command y entra a http://localhost:8765 en Chrome.':'Revisa tu conexión a internet: el reconocimiento de manos se descarga al entrar.');
 }finally{starting=false;$('enter').disabled=false;$('retry').disabled=false;await audioPromise;}
}
function fail(title,detail){stopCamera();audio.stop();setState('error');showMessage(title,detail);$('retry').hidden=false;$('leave').hidden=false;}
function stopCamera(){if(stream)for(const track of stream.getTracks())track.stop();stream=null;video.srcObject=null;handPresent=false;gesture='none';$('monitor').hidden=false;$('tracking').setAttribute('aria-expanded','true');$('tracking').textContent='Ocultar seguimiento −';}
function leave(){stopCamera();audio.stop();musicRate=1;audio.setRate(1);progress=0;departing=0;resetCircle();circleVisual=0;
 endProgress=0;centerShift=0;beatPulse=0;hitPulse=0;particleProgress=0;visualParticleProgress=0;$('black-fade').classList.remove('active');
 setState('rest');showMessage();for(const id of ['retry','sound','leave'])$(id).hidden=true;}
$('enter').addEventListener('click',start);$('retry').addEventListener('click',start);$('leave').addEventListener('click',leave);$('sound').addEventListener('click',()=>{muted=!muted;$('sound').textContent=muted?'Sonido apagado':'Sonido encendido';$('sound').setAttribute('aria-pressed',String(muted));});
function toggleMonitor(){const open=$('monitor').hidden;$('monitor').hidden=!open;$('tracking').setAttribute('aria-expanded',String(open));$('tracking').textContent=open?'Ocultar seguimiento −':'Ver seguimiento ＋';}
$('tracking').addEventListener('click',toggleMonitor);
window.addEventListener('pagehide',()=>{stopCamera();audio.stop();landmarker?.close();});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden){audio.stop();processHand(null,performance.now());}
 else{lastSeen=performance.now();lastActivity=lastSeen;stateAt=lastSeen;previousTime=lastSeen;if(!['rest','error'].includes(state))audio.context?.resume();}
});

function update(now,dt){
 const elapsed=now-stateAt;
 // Aviso cuando se pierde la mano en un momento que la necesita
 const lostHints={forming:'Su silueta te espera.',interaction:'Si no vuelve pronto, se alejarán.',wiping:'El destello sigue esperando tu palma.',heartbeat:'El latido te espera.'};
 const lost = state in lostHints && !handPresent && now-lastSeen>=CONFIG.handLostMessageTime
   && !(state==='wiping' && elapsed<CONFIG.wipeReadTime);
 if(lost){handLostShown=false;showMessage('Tu mano ya no aparece','Vuelve a colocarla frente a la cámara para continuar.',lostHints[state],true,true);handLostShown=true;}
 else if(handLostShown){handLostShown=false;messageKey='';}
 
 if(state==='detection'){
  progress=0;departing=0;wipingProgress=0;
  particleProgress=0; visualParticleProgress=0; lastPumpGesture='none';
  if(handPresent){
   if(gesture==='fist')palmSince=0;
   else if(!palmSince)palmSince=now;
   const ready=palmSince?now-palmSince:0, hold=CONFIG.detectHoldTime;
   if(gesture==='fist')showMessage('Mano detectada','Abre la mano frente a la cámara.','',true);
   else if(ready<1800)showMessage('Mano detectada','Mantén la palma abierta frente a la cámara.','Reconociendo tu mano…',true);
   else showMessage('Algo te atrae hacia alguien','Mantén la palma abierta; algo está por aparecer.','',true);
   if(palmSince && ready>hold){
       setState('forming',now);
       showMessage('Dibuja su presencia', 'Traza un círculo amplio con la palma abierta para que aparezca.');
   }
  }else{palmSince=0;showMessage('Levanta la mano','Colócala abierta frente a la cámara para comenzar.','Buscando mano…',true);}
 }
 
 else if (state === 'forming') {
  // 1. Atracción: dibujar un círculo con la palma abierta revela la silueta derecha
  if (!handPresent) {
    if (now - lastSeen >= CONFIG.resetDetectionTime) {
      setState('detection', now);
      showMessage('Levanta la mano', 'Colócala abierta frente a la cámara para comenzar.', 'Buscando mano…', true);
    } else {
      showMessage('No te detengas', 'Vuelve a mostrar tu mano abierta.', '', true);
    }
  } else if (!circleDone) {
    // La silueta se dibuja poco a poco según las vueltas trazadas; lo dibujado no se pierde
    particleProgress = clamp(revealTurn / (Math.PI * 2 * CONFIG.revealTurns));
    if (particleProgress >= 1) circleDone = true;
    showMessage('Dibuja su presencia',
      gesture === 'fist' ? 'Abre la mano y traza un círculo amplio.' : 'Traza un círculo amplio con la palma abierta.',
      circleHint || (particleProgress < .66 ? 'Con cada vuelta, su silueta se dibuja.' : 'Una vuelta más para completarla.'), true);
  } else {
    particleProgress = 1;
  }
  visualParticleProgress = smooth(visualParticleProgress, particleProgress, dt, 1.6);
  if (circleDone && visualParticleProgress > .99) {
    setState('interaction', now);
    showMessage('Empiezan a conocerse', 'Acerca la mano a la cámara para unirlos; aléjala para separarlos.');
  }
 }
 
 else if(state==='interaction'){
  if(!handPresent){
   if(now-lastSeen>=CONFIG.resetDetectionTime){returnStart=progress;setState('returning',now);showMessage('Se están alejando','Vuelve a mostrar tu mano para no perderlos.');}
  }else{
    {
        // Cualquier postura de mano sirve: muy cerca de la cámara los dedos pueden cortarse
        const proximity = getHandProximity(smoothedLandmarks);
        meetPeak = Math.max(meetPeak, proximity);
        // El rango se adapta a la persona: si no puede acercarse tanto, igual se juntan
        const near = Math.max(.28, Math.min(.42, meetPeak));
        const targetProgress = clamp((proximity - 0.10) / (near - 0.10));
        progress = smooth(progress, targetProgress, dt, CONFIG.meetSpeed);
        // Cuenta acercamientos relativos (no umbrales fijos): subir meetDelta desde el punto más lejano
        // cuenta un "acercar"; bajar meetDelta desde el más cercano prepara el siguiente
        if (meetLocalMin === null) meetLocalMin = proximity;
        if (meetPhase === 'far') {
          meetLocalMin = Math.min(meetLocalMin, proximity);
          if (proximity - meetLocalMin > CONFIG.meetDelta) { meetPhase = 'near'; meetLocalMax = proximity; meetCycles++; }
        } else {
          meetLocalMax = Math.max(meetLocalMax, proximity);
          if (meetLocalMax - proximity > CONFIG.meetDelta) { meetPhase = 'far'; meetLocalMin = proximity; }
        }
        const ready = meetCycles >= CONFIG.meetCycles;
        
        if (!ready) {
          showMessage('Empiezan a conocerse', 'Acerca y aleja la mano de la cámara, despacio.',
            meetCycles === 0 ? 'Cerca, se acercan. Lejos, se separan.'
            : meetPhase === 'near' ? `Ahora aléjala… (${meetCycles} de ${CONFIG.meetCycles})`
            : `Y vuelve a acercarla… (${meetCycles} de ${CONFIG.meetCycles})`);
          holdStartTime = 0;
        } else {
          showMessage('Cada vez más cerca', 'Acerca la mano a la cámara y sostenla ahí.', 'Deja que se encuentren.');
          // "Cerca" relativo a lo más cerca que llegó esta persona
          if (proximity >= Math.max(.2, Math.min(.38, meetPeak * .85))) {
            if (!holdStartTime) holdStartTime = now;
            else if (now - holdStartTime > CONFIG.meetHoldTime) {
                setState('white-flash', now);
                const f=$('white-flash');
                f.classList.add('active');f.style.opacity='1';
                f.style.clipPath='none';f.style.webkitClipPath='none';f.style.maskImage='none';f.style.webkitMaskImage='none';
                showMessage('', '');
            }
          } else holdStartTime = 0;
        }
    }
  }
 }
 
 else if(state==='returning'){
  showMessage('Se están alejando','Vuelve a mostrar tu mano para no perderlos.','',true);
  progress=returnStart*(1-ease(clamp(elapsed/3200)));
  if(elapsed>=3200)setState('detection',now);
 }
 
 else if (state === 'white-flash') {
  // Blanco puro al 100%
  $('white-flash').style.opacity = '1';
  if (elapsed >= 3000) {
    setState('wiping', now);
    wipingProgress = 0; wipeStarted = false; swipeUntil = 0;
    previousHandX = smoothedLandmarks ? 1 - smoothedLandmarks[0].x : 0;
  }
 }
 
 else if (state === 'wiping') {
    // Primero solo el título, para leerlo; después la instrucción de la palma
    if (elapsed < CONFIG.wipeReadTime) { showMessage('Todo parece perfecto'); previousHandX = smoothedLandmarks ? 1 - smoothedLandmarks[0].x : 0; }
    else showMessage('Todo parece perfecto', 'Pasa la palma de izquierda a derecha para ver con claridad.');
    // El blanco se queda al 100% hasta que la palma se desliza de izquierda a derecha
    // (x en espejo, igual que se ve en pantalla)
    if (handPresent && gesture !== 'fist' && elapsed >= CONFIG.wipeReadTime) {
        const currentX = 1 - smoothedLandmarks[0].x;
        if (currentX > previousHandX + 0.004) { swipeUntil = now + 300; if (!wipeStarted) wipeStartAt = now; wipeStarted = true; }
        previousHandX = currentX;
    }
    if (now < swipeUntil) wipingProgress += dt * CONFIG.wipeSwipeSpeed;
    else if (wipeStarted) wipingProgress += dt * CONFIG.wipeDriftSpeed;
    wipingProgress = clamp(wipingProgress);
    
    const flashEl = $('white-flash');
    flashEl.style.transition = 'none';
    flashEl.style.opacity = String(1 - ease(wipingProgress));
    
    if (wipingProgress >= 1) {
        flashEl.classList.remove('active');
        flashEl.style.opacity = '0';
        flashEl.style.transition = '';
        setState('fading-second', now);
    }
 }
 
 else if (state === 'fading-second') {
    showMessage('Ya no está', 'Lo que imaginaste nunca llegó a suceder. Solo observa.');
    // Termina cuando la silueta ya desapareció (12 s desde que bajó el blanco) más la pausa de lectura
    if (now - wipeStartAt >= CONFIG.fadeSecondDuration + CONFIG.fadeSecondPause && elapsed >= 2500) {
        setState('single-centered', now);
    }
 }
 
 else if (state === 'single-centered') {
    // Solo queda la silueta azul: se desplaza al centro (ver render)
    showMessage('Solo queda el recuerdo', 'Quédate con él un momento.');
    if (elapsed >= 3000) {
      setState('heartbeat', now);
      endProgress = 0; beatIndex = 0; lastHitBeat = -1; lastHitAt = now;
      handledFistAt = fistEventAt; lastBeatAt = 0; nextBeatAt = now + 600; pumpClosed = false; pumpMax = 0;
    }
 }
 
 else if (state === 'heartbeat') {
    // Cada cierre de mano a tiempo con un latido ralentiza el corazón, la música y apaga la silueta
    const bpm = lerp(CONFIG.heartStartBPM, CONFIG.heartEndBPM, ease(endProgress));
    const interval = 60000 / bpm;
    if (now >= nextBeatAt) {
      lastBeatAt = nextBeatAt; beatIndex++; beatPulse = 1;
      audio.triggerHeartbeat(lerp(1, .5, shownEnd), interval);
      nextBeatAt = Math.max(lastBeatAt + interval, now + interval * .5);
    }
    if (fistEventAt > handledFistAt) {
      handledFistAt = fistEventAt;
      const win = Math.max(350, interval * .4);
      const toLast = Math.abs(fistEventAt - lastBeatAt), toNext = Math.abs(nextBeatAt - fistEventAt);
      const target = toLast <= toNext ? beatIndex : beatIndex + 1;
      // Cada abrir-cerrar apaga un poco; si coincide con el latido, apaga más
      lastHitAt = now; hitPulse = 1;
      if (Math.min(toLast, toNext) <= win && target !== lastHitBeat) {
        lastHitBeat = target;
        endProgress = clamp(endProgress + 1 / CONFIG.heartHitsToEnd);
      } else {
        endProgress = clamp(endProgress + .35 / CONFIG.heartHitsToEnd);
      }
    }
    // Respaldo solo si nadie está frente a la cámara (evita que la instalación se quede trabada)
    if (!handPresent && now - lastSeen > 20000) endProgress = clamp(endProgress + dt * 1000 / CONFIG.heartMaxDuration);
    const offRhythm = now - lastHitAt > 6000;
    showMessage(endProgress < .7 ? 'Lo que queda aún late' : 'Déjalo ir, latido a latido',
      endProgress < .7 ? 'Abre y cierra la mano al ritmo del latido.' : 'Sigue el ritmo mientras se apaga.',
      !handPresent ? 'Muestra tu mano a la cámara.' : offRhythm ? 'Abre y cierra la mano con cada latido.' : '', true);
    if (endProgress >= 1 && shownEnd > .98 && now - lastBeatAt > 450) {
      setState('fade-out', now);
      showMessage();
      $('black-fade').classList.add('active');
    }
 }
 
 else if (state === 'fade-out') {
    showMessage();
    // Fundido a negro; después vuelve al inicio
    if (elapsed >= CONFIG.blackFadeDuration + 2500) leave();
 }
 
 // El texto de la pantalla blanca se desvanece junto con el blanco (el aviso de mano perdida no)
 $('message').style.opacity = state==='wiping' && !handLostShown ? String(1-ease(wipingProgress)) : '';
 $('intro').classList.toggle('visible',state==='rest');
 $('controls').hidden=!['interaction','forming','white-flash','wiping'].includes(state);$('toast').classList.toggle('visible',now<toastUntil);
}

function render(now,dt){
 shownProgress=smooth(shownProgress,progress,dt,state==='interaction'?1.2:2.5);
 
 const scene=$('scene'), width=scene.clientWidth;
 const faceWidth=$('left').clientWidth, noseOffset=faceWidth*.375;
 const gap=width*lerp(CONFIG.maxDistance,CONFIG.minDistance,shownProgress);
 const offset=gap/2+noseOffset;
 const rest=state==='rest'||state==='loading'||state==='error';
 
 let visualIntensity = rest ? 0.15 : Math.max(0.45, shownProgress);
 
 const glow=lerp(CONFIG.minGlow,CONFIG.maxGlow,visualIntensity);
 const blur=lerp(CONFIG.maxBlur,CONFIG.minBlur,visualIntensity);
 const brightness=lerp(CONFIG.minBrightness,CONFIG.maxBrightness,visualIntensity);
 
 // Cierre: la silueta azul se centra, late y se apaga
 const closing=['single-centered','heartbeat','fade-out'].includes(state);
 centerShift = closing ? smooth(centerShift,1,dt,1.1) : 0;
 beatPulse*=Math.exp(-dt*6); hitPulse*=Math.exp(-dt*3);
 shownEnd = closing ? smooth(shownEnd, endProgress, dt, 2) : 0;
 const finalFade = state==='fade-out' ? clamp((now-stateAt)/(CONFIG.blackFadeDuration*.8)) : 0;
 const light = closing ? (1-.9*shownEnd)*(1-finalFade) : 1;
 const pulse = closing ? (beatPulse*.5+hitPulse*.4)*(1-finalFade)*(1-shownEnd*.5) : 0;
 // La silueta derecha se desvanece en fadeSecondDuration desde que el blanco empieza a bajar
 const rightPresence = (state==='fading-second' || (state==='wiping' && wipeStarted)) ? 1-ease(clamp((now-wipeStartAt)/CONFIG.fadeSecondDuration)) : closing ? 0 : 1;
 
 for(const side of ['left','right']){
  const isRight=side==='right',el=$(side);
  const dim = isRight ? 1-rightPresence : 0;
  const lit = isRight ? 1 : light;
  const pul = isRight ? 0 : pulse;
  
  el.style.filter = `blur(${blur+dim*12}px) brightness(${brightness*(1-dim*.65)*lit+pul*.6}) saturate(${lerp(.65,1.4,visualIntensity)*(1-dim*.6)}) drop-shadow(0 0 ${glow*lit*(1+pul)}px ${CONFIG.colors[side][0]})`;
  
  if ((state === 'forming' || state === 'detection') && isRight) {
      // Se revela en un círculo de borde suave que crece desde el centro con cada vuelta de la mano
      const r = visualParticleProgress * 125;
      const sweep = r < .5 ? 'linear-gradient(transparent,transparent)'
        : `radial-gradient(circle farthest-corner at 50% 42%, #000 ${Math.max(0, r - 25)}%, transparent ${r}%)`;
      const m = `${sweep}, linear-gradient(#000 65%, transparent 99%)`;
      el.style.maskImage = m; el.style.webkitMaskImage = m;
      el.style.maskComposite = 'intersect'; el.style.webkitMaskComposite = 'source-in';
      el.style.clipPath = 'none'; el.style.webkitClipPath = 'none';
  } else if (state !== 'wiping' && state !== 'white-flash') {
      el.style.maskImage = ''; el.style.webkitMaskImage = ''; el.style.maskComposite = ''; el.style.webkitMaskComposite = '';
      el.style.clipPath = `circle(100% at 50% 50%)`;
      el.style.webkitClipPath = `circle(100% at 50% 50%)`;
  }
  
  let x = isRight ? offset : -offset;
  if (closing && !isRight) x = lerp(-offset, 0, ease(clamp(centerShift)));
  
  const drift=reducedMotion?0:Math.sin(now/4400+(isRight?1:0))*3;
  el.style.transform=`translate(calc(-50% + ${x}px),calc(-44% + ${drift}px)) scale(${1+pul*.035})`;
  
  let baseOpacity = lerp(CONFIG.minOpacity,CONFIG.maxOpacity,visualIntensity)*(1-dim);
  if (closing && !isRight) baseOpacity *= lerp(.25,1,light)*(1-finalFade);
  el.style.opacity = baseOpacity;
 }
 
 $('between').style.opacity=Math.pow(shownProgress,4)*.85*rightPresence;
 $('halo').style.opacity=(.4+visualIntensity*.6)*(closing?light:1);
 
 // Música: en el cierre se ralentiza, se oscurece y baja hasta el silencio
 // Al conocerse, el volumen baja cuando se alejan y sube cuando se acercan
 let targetVol = lerp(['interaction','returning'].includes(state) ? CONFIG.meetFarVolume : CONFIG.minVolume, CONFIG.maxVolume, shownProgress);
 let cutoff = 1000+progress*1700;
 if (state === 'single-centered') targetVol *= lerp(1, CONFIG.heartMusicVolume, clamp((now-stateAt)/3000));
 if (state === 'heartbeat') { targetVol *= CONFIG.heartMusicVolume * Math.pow(1-shownEnd,1.3); cutoff = lerp(cutoff, 350, shownEnd); }
 if (state === 'fade-out') { targetVol = 0; cutoff = 350; }
 // Velocidad de la música: solo se alenta en el cierre, con los latidos
 let targetRate = 1;
 if (['heartbeat','fade-out'].includes(state)) targetRate = lerp(1, CONFIG.musicEndRate, shownEnd);
 musicRate = ['heartbeat','fade-out'].includes(state) ? targetRate : smooth(musicRate, targetRate, dt, 1.5);
 audio.setRate(musicRate);
 if(['rest','loading','error'].includes(state))targetVol=0;
 audio.update(targetVol,dt,cutoff);
}


function frame(now){
 const dt=Math.min((now-previousTime)/1000,.06);previousTime=now;
 if(!document.hidden){
  if(landmarker&&stream&&video.readyState>=2&&now-lastInference>1000/CONFIG.detectionFPS&&video.currentTime!==lastVideoTime){
   lastInference=now;lastVideoTime=video.currentTime;
   try{
     const results = landmarker.detectForVideo(video,now);
     rawLandmarks = results.landmarks;
     processHand(rawLandmarks[0] || null, now);
   }
   catch(e){console.error(e);fail('Se interrumpió el seguimiento.','Vuelve a intentarlo para conectar la cámara.');}
  }
  if(stream&&handPresent&&now-lastSeen>650)processHand(null,now);
  update(now,dt);render(now,dt);
 }
 requestAnimationFrame(frame);
}
requestAnimationFrame(frame);