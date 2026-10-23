import { Drive } from './engine.js?v=4';
import { createScene } from './renderer.js?v=7';

const $=id=>document.getElementById(id);
let graphicsMode='auto';
try{const saved=localStorage.getItem('polosa-quality');if(['auto','high','fast'].includes(saved))graphicsMode=saved;}catch{}
const scene=createScene($('game'),{qualityMode:graphicsMode}),canvas=scene.canvas,drive=new Drive();
$('quality-select').value=graphicsMode;
$('quality-select').addEventListener('change',()=>{
  const mode=$('quality-select').value;if(!['auto','high','fast'].includes(mode))return;
  graphicsMode=mode;scene.setQualityMode?.(mode);
  try{localStorage.setItem('polosa-quality',mode);}catch{}
});
let assetsReady=!scene.ready;
function readyToPlay(){assetsReady=true;$('start-button').disabled=false;$('start-label').textContent='Начать заезд';document.body.classList.remove('is-loading');}
if(scene.ready){$('start-button').disabled=true;document.body.classList.add('is-loading');scene.ready.then(readyToPlay).catch(error=>{console.warn('Asset initialization:',error);readyToPlay();});}
else readyToPlay();
const format=n=>Math.floor(n).toLocaleString('ru-RU');
let best=0,wallet=0;
try{best=Math.max(0,Number(localStorage.getItem('polosa-best'))||0);wallet=Math.max(0,Number(localStorage.getItem('polosa-coins'))||0);}catch{}
$('best').textContent=format(best);$('wallet').textContent=format(wallet);
let last=performance.now(),crashAge=0,hudElapsed=0,pointerStart=null,wasUltReady=false;
let sound=false,audioContext,master,oscillator;
new ResizeObserver(()=>scene.resize()).observe(canvas);

function hud(){
  $('score').textContent=format(drive.distance);$('speed').textContent=['ready','over'].includes(drive.state)?0:Math.round(drive.speed);
  $('coin-count').textContent=format(drive.state==='ready'?0:drive.collected);
  $('hud-level').textContent=String(1+Math.floor(drive.distance/500));
  canvas.dataset.state=drive.state;canvas.dataset.lane=drive.lane;
  canvas.dataset.lives=drive.lives;
  for(let i=1;i<=3;i++)$(`heart-${i}`).classList.toggle('lost',i>drive.lives);
  $('lives-chip').setAttribute('aria-label',`Осталось жизней: ${drive.lives} из 3`);
  $('lives-chip').classList.toggle('is-hit',Boolean(drive.impact&&drive.impact.age<.5));
  canvas.dataset.mode=drive.airborne?'flight':drive.nitroLeft>0?'nitro':'normal';
  const live=drive.state==='playing',boosting=drive.nitroLeft>0;
  $('nitro-button').disabled=!live||boosting||drive.nitro<70;
  $('flight-button').disabled=!live||drive.ult<100||drive.airborne||drive.landingGrace>0;
  $('nitro-button').setAttribute('aria-pressed',String(boosting));$('flight-button').setAttribute('aria-pressed',String(drive.airborne));
  $('nitro-fill').style.width=`${boosting?drive.nitroLeft/3*100:drive.nitro}%`;$('ult-fill').style.width=`${drive.airborne?drive.flightLeft/6*100:drive.ult}%`;
  $('nitro-status').textContent=boosting?`${drive.nitroLeft.toFixed(1)} С`:`${Math.floor(drive.nitro)}%`;
  $('ult-status').textContent=drive.airborne?`${drive.flightLeft.toFixed(1)} С`:drive.ult>=100?'ГОТОВО':`${Math.floor(drive.ult)}%`;
  $('nitro-button').classList.toggle('active',boosting);$('flight-button').classList.toggle('active',drive.airborne);
  $('flight-button').classList.toggle('charged',drive.ult>=100&&!drive.airborne&&drive.landingGrace===0);
  $('game-card').classList.toggle('is-boosting',boosting&&live);
  const badge=$('mode-badge');
  badge.classList.toggle('hidden',!live||(!drive.protected&&!boosting));
  badge.classList.toggle('flight-mode',drive.airborne||drive.landingGrace>0);
  badge.classList.toggle('damage-mode',drive.hitShield>0&&!drive.airborne&&drive.landingGrace===0);
  let modeTitle='НИТРО',modeTime=drive.nitroLeft,modeDuration=3;
  if(drive.airborne){modeTitle=drive.flightLeft<1.8?'ПОСАДКА':'ПОЛЁТ';modeTime=drive.flightLeft;modeDuration=6;}
  else if(drive.landingGrace>0){modeTitle='ВЫБЕРИ ПОЛОСУ';modeTime=drive.landingGrace;modeDuration=1.2;}
  else if(drive.hitShield>0){modeTitle=drive.lives===1?'1 ЖИЗНЬ':'2 ЖИЗНИ';modeTime=drive.hitShield;modeDuration=1.8;}
  $('mode-title').textContent=modeTitle;$('mode-time').textContent=`${modeTime.toFixed(1)} С`;
  $('mode-fill').style.width=`${Math.max(0,Math.min(100,modeTime/modeDuration*100))}%`;
  if(drive.ult>=100&&!wasUltReady)$('announcer').textContent='Ульта заряжена! Нажми E или кнопку с крыльями, чтобы взлететь.';
  wasUltReady=drive.ult>=100;
}
function overlay(panel){
  $('overlay').classList.toggle('hidden',!panel);
  for(const id of ['start-panel','end-panel','pause-panel'])$(id).classList.toggle('hidden',id!==panel);
}
function start(){
  if(!assetsReady)return;
  drive.reset();crashAge=0;hudElapsed=0;wasUltReady=false;overlay(null);hud();
  $('pause-button').disabled=false;$('pause-button').setAttribute('aria-label','Пауза');
  $('announcer').textContent='Заезд начался. У тебя три жизни. Shift — нитро, E — полёт при полном заряде.';
  $('start-button').blur();$('restart-button').blur();tone(420,.06,.045);setTimeout(()=>tone(630,.08,.04),70);
}
function finish(){
  const newBest=Math.floor(drive.distance)>Math.floor(best);
  if(newBest)best=Math.floor(drive.distance);
  wallet+=drive.collected;
  try{localStorage.setItem('polosa-best',String(best));localStorage.setItem('polosa-coins',String(wallet));}catch{}
  $('best').textContent=format(best);$('wallet').textContent=format(wallet);$('final-score').textContent=format(drive.distance);
  $('final-coins').textContent=`Собрано монет: ${format(drive.collected)}`;
  $('end-eyebrow').textContent=newBest?'НОВЫЙ ЛИЧНЫЙ РЕКОРД':'МАШИНА УНИЧТОЖЕНА';
  $('pause-button').disabled=true;
  $('announcer').textContent=`Третье столкновение. Машина взорвалась. ${format(drive.distance)} метров, ${drive.collected} монет.${newBest?' Новый рекорд!':''}`;
  tone(65,.55,.15,'sawtooth');tone(95,.28,.08,'triangle');hud();
}
function pause(){
  if(drive.state==='playing'){drive.state='paused';overlay('pause-panel');$('pause-button').setAttribute('aria-label','Продолжить');$('announcer').textContent='Пауза';}
  else if(drive.state==='paused'){drive.state='playing';last=performance.now();overlay(null);$('pause-button').setAttribute('aria-label','Пауза');$('resume-button').blur();}
  hud();
}
function move(direction){if(drive.move(direction)){tone(direction<0?260:320,.035,.018);canvas.dataset.lane=drive.lane;}}
function boost(){if(drive.boost())hud();}
function fly(){if(drive.fly()){$('announcer').textContent='Крылья раскрыты! Шесть секунд полёта над трафиком.';hud();}}
function initAudio(){
  if(audioContext)return;
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
  try{audioContext=new Audio();master=audioContext.createGain();master.gain.value=.5;master.connect(audioContext.destination);
    oscillator=audioContext.createOscillator();const motor=audioContext.createGain();oscillator.type='sawtooth';oscillator.frequency.value=37;motor.gain.value=.008;oscillator.connect(motor);motor.connect(master);oscillator.start();
  }catch{audioContext=null;}
}
function tone(frequency,duration,volume,type='sine'){
  if(!sound||!audioContext)return;
  const o=audioContext.createOscillator(),g=audioContext.createGain();o.type=type;o.frequency.setValueAtTime(frequency,audioContext.currentTime);g.gain.setValueAtTime(volume,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);o.connect(g);g.connect(master);o.start();o.stop(audioContext.currentTime+duration);
}
$('sound-button').addEventListener('click',()=>{
  initAudio();if(!audioContext)return;sound=!sound;audioContext.resume();document.body.classList.toggle('sound-enabled',sound);
  $('sound-button').setAttribute('aria-pressed',String(sound));$('sound-button').setAttribute('aria-label',sound?'Выключить звук':'Включить звук');$('sound-button').title=sound?'Звук включён':'Звук выключен';tone(600,.08,.04);
});
$('start-button').addEventListener('click',start);$('restart-button').addEventListener('click',start);
$('pause-button').addEventListener('click',pause);$('resume-button').addEventListener('click',pause);
$('nitro-button').addEventListener('click',boost);$('flight-button').addEventListener('click',fly);
for(const [id,dir] of [['left-button',-1],['right-button',1]])$(id).addEventListener('click',()=>move(dir));
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='SELECT')return;
  const key=e.key.toLowerCase();
  if(['arrowleft','arrowright','a','d','ф','в','p','з',' ','escape','shift','n','т','e','у'].includes(key)){
    if(e.target.tagName==='BUTTON'&&key===' ')return;
    e.preventDefault();if(e.repeat)return;
    if(['arrowleft','a','ф'].includes(key))move(-1);
    if(['arrowright','d','в'].includes(key))move(1);
    if(['shift','n','т'].includes(key))boost();
    if(['e','у'].includes(key))fly();
    if(['p','з','escape'].includes(key))pause();
    if(key===' '){if(['ready','over'].includes(drive.state))start();else pause();}
  }
});
canvas.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY,id:e.pointerId};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointerup',e=>{
  if(!pointerStart||pointerStart.id!==e.pointerId)return;
  const dx=e.clientX-pointerStart.x,dy=e.clientY-pointerStart.y;
  if(Math.abs(dx)>22&&Math.abs(dx)>Math.abs(dy))move(dx>0?1:-1);pointerStart=null;
});
canvas.addEventListener('pointercancel',()=>{pointerStart=null;});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&drive.state==='playing')pause();});
window.addEventListener('blur',()=>{if(drive.state==='playing')pause();});
function tick(now){
  const frameMilliseconds=now-last,dt=Math.min(frameMilliseconds/1000,.04);last=now;
  scene.recordFrame?.(frameMilliseconds,assetsReady&&drive.state==='playing'&&!document.hidden);
  if(document.hidden){requestAnimationFrame(tick);return;}
  const was=drive.state;drive.update(dt);
  if(was==='playing'&&drive.state==='over')finish();
  for(const event of drive.events.splice(0)){
    if(event==='coin'){
      tone(900+drive.collected%4*120,.09,.035);$('coin-chip').classList.add('bump');setTimeout(()=>$('coin-chip').classList.remove('bump'),130);
    }else if(event==='nitro')tone(180,.22,.05,'triangle');
    else if(event==='flight'){tone(420,.25,.045);setTimeout(()=>tone(840,.3,.04),120);}
    else if(event==='hit'){
      tone(145,.13,.07,'square');hud();
      $('announcer').textContent=`Столкновение. ${drive.lives===1?'Осталась одна жизнь':'Осталось две жизни'}. Короткая неуязвимость.`;
    }
  }
  if(drive.state==='over'){crashAge+=dt;if(crashAge>1.6&&$('overlay').classList.contains('hidden')){overlay('end-panel');$('restart-button').focus({preventScroll:true});}}
  hudElapsed+=dt;if(hudElapsed>.08){hud();hudElapsed=0;}
  if(oscillator&&master){oscillator.frequency.setTargetAtTime(32+drive.speed*.17,audioContext.currentTime,.1);master.gain.setTargetAtTime(sound&&drive.state==='playing'?.5:0,audioContext.currentTime,.07);}
  scene.render(drive,dt);requestAnimationFrame(tick);
}
hud();requestAnimationFrame(tick);
