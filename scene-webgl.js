import * as T from './vendor/three.module.min.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {EffectComposer} from './vendor/EffectComposer.js';
import {RenderPass} from './vendor/RenderPass.js';
import {UnrealBloomPass} from './vendor/UnrealBloomPass.js';
import {OutputPass} from './vendor/OutputPass.js';
import {WORLD,laneX} from './engine.js?v=4';
import {CAR_MODELS,normalizeCar,drivingCamera} from './car-models.js?v=4';
import {AdaptiveQuality} from './performance.js?v=7';

const S=45,TAU=Math.PI*2;
const metal=new T.MeshStandardMaterial({color:0x3b505c,metalness:.7,roughness:.35});
const dark=new T.MeshStandardMaterial({color:0x172c2e,roughness:.9});
const lightMaterial=(color,intensity=2)=>new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:intensity,roughness:.35,toneMapped:false});
const boxGeometry=new T.BoxGeometry(1,1,1),planeGeometry=new T.PlaneGeometry(1,1);
function box(parent,x,y,z,w,h,l,material){const mesh=new T.Mesh(boxGeometry,material);mesh.position.set(x,y,z);mesh.scale.set(w,h,l);parent.add(mesh);return mesh;}
function seeded(index){return ((Math.sin(index*127.1+42.7)*43758.5453)%1+1)%1;}
function glowTexture(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const c=canvas.getContext('2d'),gradient=c.createRadialGradient(64,64,1,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,255,1)');gradient.addColorStop(.15,'rgba(255,255,255,.6)');gradient.addColorStop(.4,'rgba(255,255,255,.15)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  c.fillStyle=gradient;c.fillRect(0,0,128,128);return new T.CanvasTexture(canvas);
}
function sprite(texture,color,size,opacity=1){const o=new T.Sprite(new T.SpriteMaterial({map:texture,color,transparent:true,opacity,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));o.scale.setScalar(size);return o;}
function prototypeCar(){
  const group=new T.Group(),paint=new T.MeshPhysicalMaterial({color:0x2e75d8,metalness:.6,roughness:.22,clearcoat:1});
  box(group,0,.4,0,1.12,.4,2.2,paint);box(group,0,.73,.1,.84,.35,.95,new T.MeshStandardMaterial({color:0x102b3c,metalness:.65,roughness:.2}));
  for(const x of [-.56,.56])for(const z of [-.7,.7])box(group,x,.25,z,.2,.4,.45,dark);
  return group;
}
function wingGeometry(){
  const shape=new T.Shape();shape.moveTo(0,-.32);shape.lineTo(1.65,.2);shape.lineTo(1.83,.64);shape.lineTo(.1,.58);shape.closePath();
  const geometry=new T.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.035,bevelThickness:.018});
  geometry.rotateX(Math.PI/2);return geometry;
}

export class WebGLScene{
  constructor(canvas,options={}){
    this.quality=options.quality??new AdaptiveQuality({mobile:options.mobile,mode:options.qualityMode});
    this.mobile=this.quality.mobile;
    this.canvas=canvas;this.renderer=options.renderer??new T.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.12;
    this.renderer.shadowMap.enabled=this.quality.settings.shadows;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
    this.scene=new T.Scene();this.scene.background=new T.Color(0x101a23);this.scene.fog=new T.FogExp2(0x101a23,.012);
    this.camera=drivingCamera();this.time=0;this.readyScroll=0;this.crashAge=0;this.traffic=new Map();this.models=[];this.lastState='ready';this.carPool=Array.from({length:4},()=>[]);
    this.activeTraffic=new Set();this.previewCoins=Array.from({length:6},(_,id)=>({id,x:laneX(1),y:40+id*65}));
    this.transforms={matrix:new T.Matrix4(),position:new T.Vector3(),rotation:new T.Quaternion(),scale:new T.Vector3(1,1,1)};
    this.coinAxis=new T.Vector3(0,1,0);
    this.glowMap=glowTexture();this.textureLoader=new T.TextureLoader();this.scrollingTextures=[];
    const hemi=new T.HemisphereLight(0xc0dcff,0x102525,1.25);this.scene.add(hemi);
    this.key=new T.DirectionalLight(0xd8eaff,2.8);this.key.position.set(-9,17,-5);this.key.castShadow=true;
    this.key.shadow.mapSize.set(1024,1024);Object.assign(this.key.shadow.camera,{left:-13,right:13,top:25,bottom:-19,near:1,far:70});
    this.key.shadow.bias=-.0003;this.key.shadow.normalBias=.025;this.key.shadow.radius=3;this.scene.add(this.key);this.scene.add(this.key.target);
    const rim=new T.DirectionalLight(0x6a9de3,.9);rim.position.set(8,4,12);this.scene.add(rim);
    if(options.environment!==false){
      const pmrem=new T.PMREMGenerator(this.renderer),room=new RoomEnvironment();
      this.environment=pmrem.fromScene(room,.045);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.52;room.dispose();pmrem.dispose();
    }
    this.buildRoad();this.buildScenery();
    this.player=this.createRig(prototypeCar(),true);this.scene.add(this.player.group);
    this.previewCars=[this.createRig(prototypeCar()),this.createRig(prototypeCar())];for(const rig of this.previewCars)this.scene.add(rig.group);
    this.coinGeometry=new T.CylinderGeometry(.28,.28,.08,24);this.coinGeometry.rotateX(Math.PI/2);
    this.coinMaterial=new T.MeshStandardMaterial({color:0xffd264,metalness:.86,roughness:.22,emissive:0x8a470b,emissiveIntensity:.3});
    this.coinInsetGeometry=new T.TorusGeometry(.205,.022,6,20);
    this.coinInsetMaterial=lightMaterial(0xffd272,.45);
    this.coinGlowMaterial=new T.MeshBasicMaterial({map:this.glowMap,color:0xffbb3e,transparent:true,opacity:.13,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
    this.buildCoinBatches(64);
    this.buildEffects();
    // Mobile draws straight to the screen: no HDR framebuffers or bloom's
    // full-screen blur pyramid. Small emissive lights and flame sprites remain.
    this.composer=null;
    if(!this.mobile){
      this.composer=options.composer??new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));
      this.bloom=new UnrealBloomPass(new T.Vector2(600,720),.4,.45,1.05);this.composer.addPass(this.bloom);this.composer.addPass(new OutputPass());
    }
    if(canvas.dataset)canvas.dataset.graphics=this.mobile?'mobile':'desktop';
    this.resize();this.ready=this.loadAssets();
  }
  resize(){
    const rect=this.canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    const sizeChanged=width!==this.width||height!==this.height;
    const pixelRatio=this.quality.settings.pixelRatio,ratioChanged=pixelRatio!==this.renderer.getPixelRatio();
    this.width=width;this.height=height;
    if(ratioChanged)this.renderer.setPixelRatio(pixelRatio);
    if(sizeChanged)this.renderer.setSize(this.width,this.height,false);
    this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();
    if(this.composer){if(ratioChanged)this.composer.setPixelRatio(pixelRatio);if(sizeChanged)this.composer.setSize(this.width,this.height);}
    this.needsRender=true;
  }
  recordFrame(milliseconds,active){
    if(this.quality.recordFrame(milliseconds,active))this.applyQuality();
  }
  setQualityMode(mode){
    if(this.quality.setMode(mode))this.applyQuality();
  }
  applyQuality(){
    this.renderer.shadowMap.enabled=this.quality.settings.shadows;
    const anisotropy=Math.min(this.quality.settings.anisotropy,this.renderer.capabilities?.getMaxAnisotropy?.()??1);
    for(const map of this.scrollingTextures)if(map.anisotropy!==anisotropy){map.anisotropy=anisotropy;map.needsUpdate=true;}
    this.resize();
  }
  async loadAssets(){
    const loader=new GLTFLoader();
    const modelPromise=Promise.all(CAR_MODELS.map(async name=>{
      try{return normalizeCar((await loader.loadAsync(`./assets/cars/${name}.glb`)).scene);}catch(e){console.warn('Model unavailable:',name,e);return prototypeCar();}
    }));
    const mapPromise=Promise.all(['diff','nor_gl','rough'].map(async name=>{
      try{const texture=await this.textureLoader.loadAsync(`./assets/textures/asphalt-${name}.jpg`);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(8/3,100/3);texture.anisotropy=Math.min(this.quality.settings.anisotropy,this.renderer.capabilities.getMaxAnisotropy());if(name==='diff')texture.colorSpace=T.SRGBColorSpace;this.scrollingTextures.push(texture);return texture;}catch{return null;}
    }));
    const extraPromise=Promise.all(['ground.jpg','carbon.jpg','beam.png'].map(async file=>{try{return await this.textureLoader.loadAsync(`./assets/textures/${file}`);}catch{return null;}}));
    const [models,maps,extra]=await Promise.all([modelPromise,mapPromise,extraPromise]);this.models=models;
    [this.road.material.map,this.road.material.normalMap,this.road.material.roughnessMap]=maps;this.road.material.needsUpdate=true;
    const [ground,carbon,beam]=extra;
    if(ground){ground.colorSpace=T.SRGBColorSpace;ground.wrapS=ground.wrapT=T.RepeatWrapping;ground.repeat.set(20,32);this.ground.material.map=ground;this.ground.material.needsUpdate=true;}
    if(carbon){carbon.colorSpace=T.SRGBColorSpace;carbon.wrapS=carbon.wrapT=T.RepeatWrapping;carbon.repeat.set(3,3);this.wingMaterial.map=carbon;this.wingMaterial.needsUpdate=true;}
    this.beamTexture=beam;
    this.replaceModel(this.player,this.models[0]);for(let i=0;i<2;i++)this.replaceModel(this.previewCars[i],this.models[i+2]);
    for(const rig of [this.player,...this.previewCars])for(const b of rig.beams){if(beam){b.material.map=beam;b.material.needsUpdate=true;}}
    this.renderer.compile(this.scene,this.camera);this.needsRender=true;
  }
  buildRoad(){
    const ground=new T.Mesh(new T.PlaneGeometry(80,120),new T.MeshStandardMaterial({color:0x5e7468,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.set(0,-.05,-10);ground.receiveShadow=true;this.scene.add(ground);this.ground=ground;
    const shoulder=new T.Mesh(new T.PlaneGeometry(9,100),new T.MeshStandardMaterial({color:0x64737c,metalness:.18,roughness:.72}));shoulder.rotation.x=-Math.PI/2;shoulder.position.set(0,-.005,-6);shoulder.receiveShadow=true;this.scene.add(shoulder);
    const roadOptions={color:0x68717a,roughness:.56,metalness:.16,normalScale:new T.Vector2(.14,.14),envMapIntensity:.65};
    const roadMaterial=this.mobile?new T.MeshStandardMaterial(roadOptions):new T.MeshPhysicalMaterial({...roadOptions,clearcoat:.85,clearcoatRoughness:.22});
    this.road=new T.Mesh(new T.PlaneGeometry(8,100),roadMaterial);this.road.rotation.x=-Math.PI/2;this.road.position.z=-6;this.road.receiveShadow=true;this.scene.add(this.road);
    const paint=new T.MeshStandardMaterial({color:0xe1e8df,roughness:.55,emissive:0x23333a,emissiveIntensity:.2});
    this.dashes=new T.InstancedMesh(new T.BoxGeometry(.055,.008,.95),paint,60);this.dashes.instanceMatrix.setUsage(T.DynamicDrawUsage);this.scene.add(this.dashes);
    for(const side of [-1,1]){
      box(this.scene,side*3.85,.009,-7,.045,.008,100,paint);
      box(this.scene,side*4.35,.24,-7,.13,.16,100,metal).castShadow=true;
      box(this.scene,side*4.35,.43,-7,.075,.04,100,lightMaterial(side<0?0x51b5dd:0xf0b55f,.45));
    }
    this.posts=new T.InstancedMesh(new T.BoxGeometry(.09,.43,.1),metal,50);this.posts.instanceMatrix.setUsage(T.DynamicDrawUsage);this.scene.add(this.posts);
  }
  buildScenery(){
    this.scenery=new T.Group();this.scene.add(this.scenery);this.lamps=[];
    for(let i=0;i<12;i++){
      const side=i%2?1:-1,group=new T.Group();
      box(group,side*5.05,1.85,0,.065,3.7,.065,metal);
      box(group,side*4.68,3.7,0,.8,.055,.07,metal);
      box(group,side*4.3,3.68,0,.4,.035,.17,lightMaterial(side<0?0xb2dcff:0xffda8e,2));
      const glow=sprite(this.glowMap,side<0?0x9ccfff:0xffcb76,.9,.45);glow.position.set(side*4.3,3.66,0);group.add(glow);this.scenery.add(group);this.lamps.push(group);
    }
    this.streetLights=[];if(!this.mobile)for(const side of [-1,1]){const l=new T.PointLight(side<0?0x7cb4f4:0xffc47c,22,12,2);l.position.set(side*3.8,3.4,1);this.scene.add(l);this.streetLights.push(l);}
    const foliage=new T.IcosahedronGeometry(1,1),trunk=new T.CylinderGeometry(.07,.13,1.1,6);
    this.leaves=new T.InstancedMesh(foliage,new T.MeshStandardMaterial({color:0x285a4b,roughness:.95}),72);
    this.trunks=new T.InstancedMesh(trunk,new T.MeshStandardMaterial({color:0x41463d,roughness:1}),36);this.scene.add(this.leaves,this.trunks);
    const rockGeo=new T.IcosahedronGeometry(1,0);this.rocks=new T.InstancedMesh(rockGeo,new T.MeshStandardMaterial({color:0x3f535c,roughness:.82}),20);this.scene.add(this.rocks);
    for(const mesh of [this.leaves,this.trunks,this.rocks])mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.treeShapes=Array.from({length:36},(_,i)=>({x:(i%2?1:-1)*(6+seeded(i+3)*8),size:.7+seeded(i+8)*1.2}));
    this.rockShapes=Array.from({length:20},(_,i)=>({x:(i%2?1:-1)*(5.2+seeded(i+5)*2.4),sx:.3+seeded(i)*.8,sy:.2+seeded(i+1)*.5,sz:.4+seeded(i+2)*.8}));
  }
  createRig(template,isPlayer=false){
    const rig={group:new T.Group(),model:template.clone(true),beams:[],flames:[],wings:[],wheels:[],materials:[],isPlayer};rig.group.add(rig.model);
    this.prepareRigModel(rig);
    const head=lightMaterial(0xbdeaff,2.1),tail=lightMaterial(0xf0634c,1.3);
    for(const side of [-1,1]){
      box(rig.group,side*.37,.36,-1.04,.19,.045,.035,head);box(rig.group,side*.37,.36,1.06,.19,.045,.035,tail);
      const beam=new T.Mesh(new T.PlaneGeometry(.8,3.6),new T.MeshBasicMaterial({map:this.beamTexture||this.glowMap,color:0x83bef4,transparent:true,opacity:isPlayer?.23:.11,depthWrite:false,blending:T.AdditiveBlending}));beam.rotation.set(-Math.PI/2,0,Math.PI);beam.position.set(side*.36,.015,-2.85);rig.group.add(beam);rig.beams.push(beam);
      const halo=sprite(this.glowMap,0xb1e0ff,.35,.8);halo.position.set(side*.37,.36,-1.075);rig.group.add(halo);
      if(isPlayer){
        const flame=new T.Mesh(new T.ConeGeometry(.095,.85,10),new T.MeshBasicMaterial({color:0x58d7fa,transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}));flame.rotation.x=Math.PI/2;flame.position.set(side*.3,.33,1.5);rig.group.add(flame);rig.flames.push(flame);
        const hot=sprite(this.glowMap,0x4fcaff,.65,.7);hot.position.set(side*.3,.34,1.33);rig.group.add(hot);rig.flames.push(hot);
      }
    }
    if(isPlayer){
      this.wingMaterial=new T.MeshPhysicalMaterial({color:0x778eaa,metalness:.8,roughness:.24,clearcoat:1,side:T.DoubleSide});
      const geometry=wingGeometry();
      for(const side of [-1,1]){
        const hinge=new T.Group();hinge.position.set(side*.5,.58,.05);hinge.scale.x=side;
        const wing=new T.Mesh(geometry,this.wingMaterial);wing.castShadow=true;hinge.add(wing);
        const edge=new T.LineSegments(new T.EdgesGeometry(geometry,30),new T.LineBasicMaterial({color:0x9ae7ff,toneMapped:false}));hinge.add(edge);
        rig.group.add(hinge);rig.wings.push({hinge,side});
      }
      const under=new T.Mesh(new T.PlaneGeometry(2.2,3.3),new T.MeshBasicMaterial({map:this.glowMap,color:0x0c8ef2,transparent:true,opacity:.3,depthWrite:false,blending:T.AdditiveBlending}));under.rotation.x=-Math.PI/2;under.position.y=.02;rig.group.add(under);rig.under=under;
      this.headlight=new T.SpotLight(0xb0d8ff,45,16,.52,.7,1.8);this.headlight.position.set(0,.75,-.9);this.headlight.target.position.set(0,0,-7);rig.group.add(this.headlight,this.headlight.target);
    }
    return rig;
  }
  replaceModel(rig,template){
    rig.group.remove(rig.model);if(rig.isPlayer)for(const material of rig.materials)material.dispose();
    rig.model=template.clone(true);this.prepareRigModel(rig);rig.group.add(rig.model);
  }
  prepareRigModel(rig){
    rig.wheels=[];rig.materials=[];rig.blink=null;
    rig.model.traverse(o=>{if(o.isMesh){
      if(rig.isPlayer)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();
      if(o.name.includes('wheel'))rig.wheels.push(o);
      if(rig.isPlayer)rig.materials.push(...(Array.isArray(o.material)?o.material:[o.material]));
    }});
  }
  buildEffects(){
    this.sparks=new T.Group();this.scene.add(this.sparks);this.sparkParticles=[];
    for(let i=0;i<24;i++){const m=new T.Mesh(new T.SphereGeometry(.035,5,4),new T.MeshBasicMaterial({color:i%2?0xffc45b:0xfff3b8,toneMapped:false,transparent:true}));this.sparks.add(m);this.sparkParticles.push(m);}
    this.explosion=new T.Group();this.scene.add(this.explosion);this.fire=[];this.debris=[];this.smoke=[];
    for(let i=0;i<12;i++){const m=sprite(this.glowMap,i%3===0?0xffe6ae:i%2?0xffa63f:0xec6034,1);this.explosion.add(m);this.fire.push(m);}
    for(let i=0;i<16;i++){const m=new T.Mesh(new T.BoxGeometry(.18+i%3*.09,.09+i%2*.1,.3+i%4*.06),new T.MeshStandardMaterial({color:i%3?0x2e71c5:0x303f49,metalness:.5,roughness:.38}));m.castShadow=true;this.explosion.add(m);this.debris.push(m);}
    for(let i=0;i<7;i++){const m=sprite(this.glowMap,0x25343c,1,0);m.material.blending=T.NormalBlending;this.explosion.add(m);this.smoke.push(m);}
    this.shockwave=new T.Mesh(new T.RingGeometry(.92,1,48),new T.MeshBasicMaterial({color:0xffdd91,transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false,toneMapped:false}));this.shockwave.rotation.x=-Math.PI/2;this.explosion.add(this.shockwave);
    this.flightRing=new T.Mesh(new T.RingGeometry(.97,1,48),new T.MeshBasicMaterial({color:0x8edbff,transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false,toneMapped:false}));this.flightRing.rotation.x=-Math.PI/2;this.flightRing.scale.set(1.3,1.7,1);this.scene.add(this.flightRing);
  }
  updateRoad(scroll){
    const offset=scroll/S,{matrix,position,rotation,scale}=this.transforms;rotation.identity();scale.set(1,1,1);
    for(const map of this.scrollingTextures)map.offset.y=offset/3;
    for(let i=0;i<60;i++){position.set(i%2?-4/3:4/3,.012,-40+((Math.floor(i/2)*2.18+offset)%65.4));matrix.compose(position,rotation,scale);this.dashes.setMatrixAt(i,matrix);}this.dashes.instanceMatrix.needsUpdate=true;
    for(let i=0;i<50;i++){position.set(i%2?-4.35:4.35,.23,-39+((Math.floor(i/2)*2.6+offset)%65));matrix.compose(position,rotation,scale);this.posts.setMatrixAt(i,matrix);}this.posts.instanceMatrix.needsUpdate=true;
    for(let i=0;i<this.lamps.length;i++)this.lamps[i].position.z=-40+((Math.floor(i/2)*11+offset)%66);
    for(let i=0;i<36;i++){
      const {x,size}=this.treeShapes[i],z=-42+((Math.floor(i/2)*4+offset*.95)%72);
      position.set(x,.5,z);scale.set(1,1,1);matrix.compose(position,rotation,scale);this.trunks.setMatrixAt(i,matrix);
      for(let j=0;j<2;j++){position.set(x+(j?.25:0),1.35+j*.8,z);scale.set(size*(j?.67:1),size*(j?1:1.25),size*(j?.73:1));matrix.compose(position,rotation,scale);this.leaves.setMatrixAt(i*2+j,matrix);}
    }
    this.trunks.instanceMatrix.needsUpdate=true;this.leaves.instanceMatrix.needsUpdate=true;
    for(let i=0;i<20;i++){const rock=this.rockShapes[i];position.set(rock.x,.18,-40+((i*4+offset*.95)%75));scale.set(rock.sx,rock.sy,rock.sz);matrix.compose(position,rotation,scale);this.rocks.setMatrixAt(i,matrix);}this.rocks.instanceMatrix.needsUpdate=true;
  }
  positionRig(rig,x,y,altitude=0,tilt=0,motion=0){rig.group.position.set((x-300)/S,altitude/S,(y-350)/S);rig.group.rotation.set(0,-tilt*.7,-tilt*.4);for(const wheel of rig.wheels)wheel.rotation.x-=motion/.27;}
  buildCoinBatches(capacity){
    if(this.coinBatches)for(const mesh of this.coinBatches){this.scene.remove(mesh);mesh.dispose();}
    this.coinCapacity=capacity;
    this.coinBatches=[[this.coinGeometry,this.coinMaterial],[this.coinInsetGeometry,this.coinInsetMaterial],[planeGeometry,this.coinGlowMaterial]].map(([geometry,material])=>{
      const mesh=new T.InstancedMesh(geometry,material,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.scene.add(mesh);return mesh;
    });
  }
  updateCoins(coins){
    if(coins.length>this.coinCapacity)this.buildCoinBatches(2**Math.ceil(Math.log2(coins.length)));
    const {matrix,position,rotation,scale}=this.transforms;
    for(let i=0;i<coins.length;i++){
      const coin=coins[i],x=(coin.x-300)/S,y=.57+Math.sin(this.time*3+coin.id)*.06,z=(coin.y-350)/S,angle=this.time*2.8+coin.id*.62;
      position.set(x,y,z);rotation.setFromAxisAngle(this.coinAxis,angle);scale.set(1,1,1);matrix.compose(position,rotation,scale);this.coinBatches[0].setMatrixAt(i,matrix);
      position.set(x+Math.sin(angle)*.05,y,z+Math.cos(angle)*.05);matrix.compose(position,rotation,scale);this.coinBatches[1].setMatrixAt(i,matrix);
      position.set(x,y,z);rotation.copy(this.camera.quaternion);scale.setScalar(.8);matrix.compose(position,rotation,scale);this.coinBatches[2].setMatrixAt(i,matrix);
    }
    for(const mesh of this.coinBatches){mesh.count=coins.length;mesh.visible=coins.length>0;mesh.instanceMatrix.needsUpdate=true;}
  }
  render(drive,dt){
    if(!this.needsRender&&((drive.state==='paused'&&this.lastState==='paused')||(drive.state==='over'&&this.lastState==='over'&&this.crashAge>3)))return;
    if(drive.state==='playing'||drive.state==='ready')this.time+=dt;
    if(drive.state==='ready')this.readyScroll+=dt*35;
    this.crashAge=drive.state==='over'?this.crashAge+dt:0;
    const scroll=drive.state==='ready'?this.readyScroll:drive.scroll,motion=drive.state==='playing'?drive.worldSpeed/S*dt:0;
    this.updateRoad(scroll);
    const boosted=drive.nitroLeft>0,ready=drive.state==='ready';
    const targetFov=boosted?41:39;
    if(this.camera.fov!==targetFov){const delta=targetFov-this.camera.fov;this.camera.fov=Math.abs(delta)<.001?targetFov:this.camera.fov+delta*Math.min(1,dt*3);this.camera.updateProjectionMatrix();}
    this.player.group.visible=!drive.crash;
    const altitude=drive.altitude+(drive.airborne?Math.sin(this.time*4)*3:0);
    this.positionRig(this.player,ready?laneX(1):drive.x,ready?WORLD.playerY+30:WORLD.playerY,altitude,drive.tilt,motion);
    for(const {hinge,side} of this.player.wings){const open=Math.min(1,drive.altitude/65);hinge.visible=open>.01;hinge.rotation.z=side*(1-open)*1.3;}
    for(const flame of this.player.flames){flame.visible=!ready&&(boosted||drive.altitude>2);if(flame.isMesh)flame.scale.y=(boosted?1.2:.7)*(1+.18*Math.sin(this.time*43));}
    this.player.under.material.opacity=boosted?.55:drive.airborne?.42:.2;
    this.player.under.position.y=.02-altitude/S;for(const beam of this.player.beams)beam.position.y=.015-altitude/S;this.headlight.target.position.y=-altitude/S;
    const blink=drive.hitShield>0&&Math.floor(drive.time*12)%2===0;
    if(blink!==this.player.blink){for(const m of this.player.materials){m.transparent=blink;m.opacity=blink?.35:1;}this.player.blink=blink;}
    for(let i=0;i<2;i++){this.previewCars[i].group.visible=ready;this.positionRig(this.previewCars[i],laneX(i?2:0),i?-65:80,0,0,0);}
    const active=this.activeTraffic;active.clear();for(const car of drive.traffic)active.add(car);
    for(const [car,rig] of this.traffic)if(!active.has(car)||ready){this.scene.remove(rig.group);this.traffic.delete(car);this.carPool[car.color??0].push(rig);}
    if(!ready)for(const car of drive.traffic){let rig=this.traffic.get(car);if(!rig){const color=car.color??0;rig=this.carPool[color].pop()||this.createRig(this.models[1+color]||prototypeCar());this.scene.add(rig.group);this.traffic.set(car,rig);}this.positionRig(rig,car.x,car.y,0,0,motion);}
    this.updateCoins(ready?this.previewCoins:drive.coins);
    this.flightRing.visible=drive.landingGrace>0;this.flightRing.position.set((drive.x-300)/S,.025,(WORLD.playerY-350)/S);
    const impact=drive.crash||drive.impact,impactAge=drive.crash?this.crashAge:drive.impact?.age;
    this.sparks.visible=Boolean(impact&&impactAge<.6);
    if(impact){
      this.sparks.position.set((impact.x-300)/S,.45,(impact.y-350)/S);
      for(let i=0;i<this.sparkParticles.length;i++){const a=i*2.399,t=impactAge,sp=1.5+i%4*.5;const p=this.sparkParticles[i];p.position.set(Math.cos(a)*t*sp,.15+t*2-t*t*4,Math.sin(a)*t*sp);p.material.opacity=Math.max(0,1-t/.6);}
    }
    this.explosion.visible=Boolean(drive.crash);
    if(drive.crash){
      const age=this.crashAge;this.explosion.position.set((drive.crash.x-300)/S,0,(drive.crash.y-350)/S);
      for(let i=0;i<this.fire.length;i++){const a=i*2.399,t=Math.max(0,age-i*.015),p=this.fire[i];p.position.set(Math.cos(a)*t*2,.4+t*(i%2?2.8:1.1),Math.sin(a)*t*1.6);p.scale.setScalar(.5+t*3);p.material.opacity=Math.max(0,1-t/(.65+i%3*.13));}
      for(let i=0;i<this.debris.length;i++){const a=i*2.399,t=Math.min(age,1.5),p=this.debris[i];p.position.set(Math.cos(a)*t*(1.5+i%3*.6),Math.max(.08,.4+t*(3+i%4*.4)-4*t*t),Math.sin(a)*t*(1.5+i%3*.6));p.rotation.set(t*4,a+t*3,t*2);}
      for(let i=0;i<this.smoke.length;i++){const t=Math.max(0,age-.15-i*.025),p=this.smoke[i];p.position.set(Math.sin(i*2.4)*t,.5+t*(1.4+i*.13),Math.cos(i*2.4)*t*.7);p.scale.setScalar(.4+t*2.2);p.material.opacity=Math.min(.45,t*2)*Math.max(0,1-t/2);}
      this.shockwave.position.y=.025;this.shockwave.scale.setScalar(.3+age*5);this.shockwave.material.opacity=Math.max(0,1-age/.7)*.6;
    }
    this.camera.position.x=impact&&impactAge<.25?Math.sin(impactAge*95)*.08*(1-impactAge/.25):0;
    if(this.composer&&this.quality.settings.bloom)this.composer.render();else this.renderer.render(this.scene,this.camera);
    this.lastState=drive.state;this.needsRender=false;
  }
}
