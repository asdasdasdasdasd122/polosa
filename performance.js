// Keep gameplay at the display's refresh rate; adapt GPU work instead of
// skipping animation frames. Only visible, active driving contributes samples.
export function prefersMobileRenderer(environment=globalThis){
  const nav=environment.navigator??{};
  const width=environment.innerWidth??1920;
  return (Boolean(environment.matchMedia?.('(pointer: coarse)').matches)&&width<1200)||
    ((nav.maxTouchPoints??0)>0&&width<900);
}

export class AdaptiveQuality{
  constructor({mobile=prefersMobileRenderer(),pixelRatio=globalThis.devicePixelRatio||1,mode='auto'}={}){
    this.mobile=mobile;this.level=0;this.mode=['auto','high','fast'].includes(mode)?mode:'auto';
    const native=Math.max(.5,Number(pixelRatio)||1);
    // Retina phones need more than one render pixel per CSS pixel. Save GPU
    // work with the direct rendering path, without making auto mode blurry.
    const ratios=mobile?[2,1.75,1.5]:[1.5,1.25,1,.85];
    this.profiles=ratios.map((ratio,level)=>({
      pixelRatio:Math.min(native,ratio),
      bloom:!mobile&&level===0,
      shadows:!mobile&&level<2,
      anisotropy:mobile?4:8
    }));
    this.presets={
      high:{pixelRatio:Math.min(native,2.5),bloom:!mobile,shadows:!mobile,anisotropy:8},
      fast:{pixelRatio:Math.min(native,1),bloom:false,shadows:false,anisotropy:2}
    };
    this.warmup=1200;this.cooldown=0;this.fastTime=0;this.resetWindow();
  }
  get settings(){return this.mode==='auto'?this.profiles[this.level]:this.presets[this.mode];}
  setMode(mode){
    if(!['auto','high','fast'].includes(mode)||mode===this.mode)return false;
    this.mode=mode;this.level=0;this.warmup=1200;this.cooldown=0;this.fastTime=0;this.resetWindow();return true;
  }
  resetWindow(){this.elapsed=0;this.frames=0;this.slowFrames=0;}
  recordFrame(milliseconds,active=true){
    if(this.mode!=='auto')return false;
    if(!active||!Number.isFinite(milliseconds)||milliseconds<=0||milliseconds>250){
      this.resetWindow();this.fastTime=0;this.warmup=1200;return false;
    }
    this.cooldown=Math.max(0,this.cooldown-milliseconds);
    if(this.warmup>0){this.warmup-=milliseconds;return false;}
    this.elapsed+=milliseconds;this.frames++;
    if(milliseconds>27)this.slowFrames++;
    if(this.elapsed<1500)return false;
    const average=this.elapsed/this.frames,jank=this.slowFrames/this.frames;
    const slow=average>21||jank>.18;
    this.fastTime=average<17.6&&jank<.02?this.fastTime+this.elapsed:0;
    let next=this.level;
    if(this.cooldown===0&&slow&&next<this.profiles.length-1)next++;
    else if(this.cooldown===0&&this.fastTime>=20000&&next>0)next--;
    this.resetWindow();
    if(next===this.level)return false;
    this.level=next;this.cooldown=4500;this.warmup=600;this.fastTime=0;return true;
  }
}
