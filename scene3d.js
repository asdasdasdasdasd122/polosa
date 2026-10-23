// Small dependency-free 3D renderer: polygon meshes, perspective camera,
// face normals, directional light and depth-sorted surfaces.
import { WORLD, laneX } from './engine.js?v=4';

const S=45, C=600, H=720;
const CAM_Y=22, CAM_Z=17, CAM_D=Math.hypot(CAM_Y,CAM_Z);
const UP_Y=CAM_Z/CAM_D, UP_Z=-CAM_Y/CAM_D, FOCAL=1020;
const LIGHT=[-.5,.82,-.28];
const PAINT=['#ece8d8','#b97e66','#78999f','#8c9a79'];
const unit=(v)=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const minus=(a,b)=>a.map((x,i)=>x-b[i]);
const rgbCache=new Map();
function rgb(color){if(!rgbCache.has(color))rgbCache.set(color,[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)));return rgbCache.get(color);}
function lit(color,n){const light=.63+Math.max(0,n.reduce((a,b,i)=>a+b*LIGHT[i],0))*.44;return `rgb(${rgb(color).map(c=>Math.min(255,Math.round(c*light))).join(',')})`;}
export function project([x,y,z]){
  const depth=CAM_D-CAM_Y/CAM_D*y-CAM_Z/CAM_D*z;
  return { x:300+FOCAL*x/depth, y:335-FOCAL*(UP_Y*y+UP_Z*z)/depth, depth };
}
export function carScreenBounds(x,y){
  const points=[];
  for(const dx of [-.8,.8])for(const height of [0,1.2])for(const dz of [-1.25,1.25])points.push(project([(x-300)/S+dx,height,(y-350)/S+dz]));
  return {top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};
}
function box(x,y,z,w,h,l,color){
  const a=x-w/2,b=x+w/2,c=y,d=y+h,e=z-l/2,f=z+l/2;
  return { v:[[a,c,e],[b,c,e],[b,c,f],[a,c,f],[a,d,e],[b,d,e],[b,d,f],[a,d,f]], f:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]].map(v=>({v,color})) };
}
function extrude(outline,bottom,top,color,topColor=color){
  const n=outline.length,v=[...outline.map(([x,z])=>[x,bottom,z]),...outline.map(([x,z])=>[x,top,z])];
  const f=[{v:Array.from({length:n},(_,i)=>i+n).reverse(),color:topColor}];
  for(let i=0;i<n;i++)f.push({v:[i,(i+1)%n,(i+1)%n+n,i+n],color});
  return {v,f};
}
function cylinder(x,y,z,radius,length,color,axis='x',segments=10){
  const v=[];
  for(const side of [-1,1])for(let i=0;i<segments;i++){
    const a=i/segments*Math.PI*2, c=Math.cos(a)*radius,s=Math.sin(a)*radius;
    v.push(axis==='x'?[x+side*length/2,y+c,z+s]:axis==='z'?[x+c,y+s,z+side*length/2]:[x+c,y+side*length/2,z+s]);
  }
  const f=[{v:Array.from({length:segments},(_,i)=>i).reverse(),color},{v:Array.from({length:segments},(_,i)=>i+segments),color}];
  for(let i=0;i<segments;i++)f.push({v:[i,(i+1)%segments,(i+1)%segments+segments,i+segments],color});
  return {v,f};
}
function cone(x,y,z,radius,height,color){
  const v=Array.from({length:7},(_,i)=>[x+Math.cos(i/7*Math.PI*2)*radius,y,z+Math.sin(i/7*Math.PI*2)*radius]);v.push([x,y+height,z]);
  return {v,f:Array.from({length:7},(_,i)=>({v:[i,(i+1)%7,7],color}))};
}
function transform(p,x=0,y=0,z=0,yaw=0,roll=0){
  const cr=Math.cos(roll),sr=Math.sin(roll),cy=Math.cos(yaw),sy=Math.sin(yaw);
  const rx=p[0]*cr-p[1]*sr,ry=p[0]*sr+p[1]*cr;
  return [x+rx*cy+p[2]*sy,y+ry,z-rx*sy+p[2]*cy];
}
function carModel(color,player=false){
  const parts=[];
  const body=[[-.47,-1.11],[.47,-1.11],[.61,-.87],[.61,.83],[.47,1.11],[-.47,1.11],[-.61,.83],[-.61,-.87]];
  parts.push(extrude(body,.24,.62,color));
  parts.push(box(0,.19,.03,1.1,.19,1.8,'#25362f'));
  // A sloped cabin with separate windscreen, side windows and painted roof.
  parts.push({v:[[-.48,.63,-.49],[.48,.63,-.49],[.48,.63,.72],[-.48,.63,.72],[-.37,1.08,-.15],[.37,1.08,-.15],[.37,1.08,.42],[-.37,1.08,.42]],f:[{v:[0,1,5,4],color:'#7ea7ab'},{v:[1,2,6,5],color:'#375a60'},{v:[2,3,7,6],color:'#35555a'},{v:[3,0,4,7],color:'#45696b'},{v:[4,5,6,7],color}]});
  for(const side of [-1,1]){
    parts.push(box(side*.43,.46,-1.105,.22,.09,.035,'#fff8ce'));
    parts.push(box(side*.43,.43,1.107,.22,.09,.03,'#e27761'));
    parts.push(box(side*.65,.63,-.32,.15,.09,.17,color));
    for(const z of [-.7,.71]){
      parts.push(cylinder(side*.59,.28,z,.27,.2,'#202c28'));
      parts.push(cylinder(side*.705,.28,z,.135,.02,'#a7b0a3'));
    }
  }
  parts.push(box(0,.3,-1.12,.59,.12,.04,'#35493e'));
  parts.push(box(0,.36,1.13,.26,.07,.02,'#eee6c7'));
  if(player){
    for(const side of [-1,1]){
      parts.push(box(side*.125,.625,-.77,.085,.012,.48,'#5c674d'));
      parts.push(box(side*.125,1.085,.14,.085,.014,.55,'#5c674d'));
      parts.push(box(side*.43,.61,.92,.045,.16,.09,'#425543'));
    }
    parts.push(box(0,.77,.96,1.25,.07,.2,'#435741'));
    parts.push(cylinder(-.32,.33,1.13,.075,.12,'#91d4d8','z',8));parts.push(cylinder(.32,.33,1.13,.075,.12,'#91d4d8','z',8));
  }
  return parts;
}
const cars=[carModel('#f1cd58',true),...PAINT.map(c=>carModel(c))];
const coinBase=cylinder(0,0,0,.29,.105,'#efc74b','z',12);
const coinInset=cylinder(0,0,-.058,.215,.012,'#f9dc72','z',12);
const coinMark=box(0,-.12,-.073,.055,.24,.012,'#c7982e');
const wingOutline=[[0,-.34],[1.67,.21],[1.84,.66],[.12,.56]];
const wingBase=extrude(wingOutline,-.025,.055,'#e4e9d8','#faf8e6');
const wingAccent=extrude([[.68,-.09],[1.6,.22],[1.73,.5],[.74,.23]],.06,.072,'#acc3b6','#acc3b6');
const wreckParts=Array.from({length:16},(_,i)=>i%5===0?cylinder(0,0,0,.25,.2,'#28342d'):box(0,0,0,.25+i%3*.09,.1+i%2*.12,.35+i%4*.08,i%4===0?'#40594f':i%3===0?'#6c7158':'#eac354'));

export class Scene3D{
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.faces=[];this.fxTime=0;this.readyScroll=0;this.crashAge=0;this.resize();}
  async loadAssets(){
    const image=path=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>resolve(null);img.src=new URL(path,import.meta.url).href;});
    const [models,road]=await Promise.all([
      fetch(new URL('./assets/cars/software-meshes.json',import.meta.url)).then(r=>r.json()).catch(()=>null),
      image('./assets/textures/asphalt-diff.jpg')
    ]);
    this.detailedPlayer=models?.models.find(m=>m.name==='race-future')?.parts;
    if(road){const atlas=document.createElement('canvas');atlas.width=road.width;atlas.height=road.height*2;const c=atlas.getContext('2d');c.drawImage(road,0,0);c.drawImage(road,0,road.height);this.roadAtlas=atlas;this.roadTile=road.height;}
  }
  textureRoad(scroll){
    if(!this.roadAtlas)return;
    const ctx=this.ctx,tile=this.roadTile;
    const worldZ=y=>(y-335)*CAM_D/(FOCAL*CAM_Y/CAM_D+(y-335)*CAM_Z/CAM_D);
    for(let y=0;y<H;y+=12){
      const z1=worldZ(y),z2=worldZ(y+12),a=project([-4,0,z1]),b=project([4,0,z1]),c=project([-4,0,z2]),d=project([4,0,z2]);
      const sourceY=(((scroll/S-z2)*tile/4)%tile+tile)%tile,sourceH=Math.max(1,(z2-z1)*tile/4);
      ctx.save();ctx.beginPath();ctx.moveTo(a.x,y);ctx.lineTo(b.x,y);ctx.lineTo(d.x,y+12);ctx.lineTo(c.x,y+12);ctx.closePath();ctx.clip();ctx.globalAlpha=.38;
      ctx.translate(0,2*y+12);ctx.scale(1,-1);ctx.drawImage(this.roadAtlas,0,sourceY,tile,sourceH,c.x,y,d.x-c.x,12);ctx.restore();
    }
  }
  resize(){const r=this.canvas.getBoundingClientRect(),dpr=Math.min(globalThis.devicePixelRatio||1,2);this.canvas.width=Math.round(r.width*dpr);this.canvas.height=Math.round(r.height*dpr);}
  polygon(vertices,color,alpha=1){
    const p=vertices.map(project);if(p.some(p=>p.depth<2))return;
    const ctx=this.ctx;ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();p.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();ctx.globalAlpha=1;
  }
  plane(x,z,w,l,color){this.polygon([[x-w/2,0,z-l/2],[x+w/2,0,z-l/2],[x+w/2,0,z+l/2],[x-w/2,0,z+l/2]],color);}
  mesh(mesh,fn=p=>p,alpha=1){
    const vertices=mesh.v.map(fn);
    for(const face of mesh.f){const v=face.v.map(i=>vertices[i]);const n=unit(cross(minus(v[1],v[0]),minus(v[2],v[0])));
      const p=v.map(project);if(p.some(p=>p.depth<2))continue;
      // Winding-independent lighting also supports mirrored hinged wings.
      const normal=n[1]<-.1?n.map(x=>-x):n;
      this.faces.push({p,color:lit(face.color,normal),depth:p.reduce((a,p)=>a+p.depth,0)/p.length,alpha});
    }
  }
  shadow(x,z,w=1.1,l=2,alpha=.2){const v=Array.from({length:16},(_,i)=>[x+Math.cos(i/16*Math.PI*2)*w,.012,z+Math.sin(i/16*Math.PI*2)*l]);this.polygon(v,'#172c23',alpha);}
  drawCar(x,y,player=false,color=0,tilt=0,altitude=0,boost=false,time=0,opacity=1){
    if(!player){const bounds=carScreenBounds(x,y);if(bounds.bottom<0||bounds.top>H)return;}
    const xx=(x-300)/S,zz=(y-350)/S,yy=altitude/S;
    const yaw=-tilt*.7,roll=-tilt*.4;
    this.shadow(xx+.15,zz+.12,player&&altitude>5?1.25: .78,1.24,Math.max(.1,.22-yy*.045));
    for(const side of [-1,1])this.polygon([[xx+side*.36-.1,.018,zz-1.05],[xx+side*.36+.1,.018,zz-1.05],[xx+side*.36+.48,.018,zz-4.3],[xx+side*.36-.48,.018,zz-4.3]],'#bddbff',.075);
    const fn=p=>transform(p,xx,yy,zz,yaw,roll);
    for(const part of player&&this.detailedPlayer?this.detailedPlayer:cars[player?0:color+1])this.mesh(part,fn,opacity);
    if(player&&altitude>.2){
      const open=Math.min(1,altitude/65);
      for(const side of [-1,1])for(const part of [wingBase,wingAccent]){
        this.mesh(part,p=>{const a=(1-open)*1.3,px=p[0]*Math.cos(a),py=p[0]*Math.sin(a);return fn([side*(.55+px),.63+py,p[2]]);});
      }
    }
    if(player&&(boost||altitude>2)){
      const length=(boost?.95:.5)*(1+.2*Math.sin(time*41));
      for(const side of [-1,1]){
        const flame={v:[[-.105,.25,1.13],[.105,.25,1.13],[.105,.45,1.13],[-.105,.45,1.13],[0,.34,1.13+length]],f:[{v:[0,1,4],color:'#50b7e4'},{v:[1,2,4],color:'#b9f6ff'},{v:[2,3,4],color:'#8de6ee'},{v:[3,0,4],color:'#69bddb'}]};
        this.mesh(flame,p=>fn([p[0]+side*.32,p[1],p[2]]),.9);
      }
    }
  }
  drawCoin(coin,time){
    const x=(coin.x-300)/S,z=(coin.y-350)/S,spin=time*2.8+coin.id*.62;
    const fn=p=>transform(p,x,.6+Math.sin(time*3+coin.id)*.06,z,spin);
    this.shadow(x,z,.22,.16,.12);
    for(const m of [coinBase,coinInset,coinMark])this.mesh(m,fn);
  }
  tree(x,z,index){
    const h=1.1+(index%3)*.3;
    this.shadow(x+.25,z+.12,.8,.6,.12);
    this.mesh(box(x,0,z,.16,.75,.16,'#8a8663'));
    this.mesh(cone(x,.5,z,.82,h,index%2?'#244d45':'#2b584a'));
    this.mesh(cone(x,1,z,.61,h*.85,index%2?'#356754':'#3c6e59'));
  }
  explosionParts(x,y,age){
    const xx=(x-300)/S,zz=(y-350)/S;
    this.shadow(xx,zz,1.5,1.3,.2);
    this.mesh(box(xx,.01,zz,1.05,.18,1.9,'#343d32'));
    for(let i=0;i<wreckParts.length;i++){
      const a=i*2.39996,t=Math.min(age,1.4),velocity=1.4+i%4*.55;
      const height=Math.max(.09,.5+t*(3.3+i%3*.7)-4.8*t*t);
      this.mesh(wreckParts[i],p=>transform(p,xx+Math.cos(a)*velocity*t,height,zz+Math.sin(a)*velocity*t,a+t*(i%2?4:-4),t*3),Math.max(.2,1-Math.max(0,age-1.3)*1.4));
    }
  }
  sparks(point,age){
    const ctx=this.ctx,p=project([(point.x-300)/S,.7,(point.y-350)/S]);
    if(age>.55)return;
    for(let i=0;i<14;i++){
      const a=i/14*Math.PI*2,r=8+age*(85+i%3*30);
      ctx.globalAlpha=Math.max(0,1-age/.55);ctx.strokeStyle=i%2?'#f6d06b':'#fff2b8';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(p.x+Math.cos(a)*r,p.y+Math.sin(a)*r);ctx.lineTo(p.x+Math.cos(a)*(r+8),p.y+Math.sin(a)*(r+8));ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  blast(point,age){
    const ctx=this.ctx,p=project([(point.x-300)/S,.65,(point.y-350)/S]);
    if(age<.7){
      ctx.globalAlpha=(1-age/.7)*.6;ctx.strokeStyle='#ffe3a1';ctx.lineWidth=4*(1-age/.7);
      ctx.beginPath();ctx.ellipse(p.x,p.y+12,25+age*150,14+age*82,0,0,Math.PI*2);ctx.stroke();
    }
    for(let i=0;i<10;i++){
      const a=i*2.39996,t=Math.max(0,age-i*.014),duration=.65+i%3*.12;
      if(t>=duration)continue;
      ctx.globalAlpha=Math.max(0,1-t/duration)*.85;ctx.fillStyle=['#f4a347','#f7cd65','#e37b42','#ffe8a3'][i%4];
      ctx.beginPath();ctx.arc(p.x+Math.cos(a)*t*(55+i%3*20),p.y+Math.sin(a)*t*35-t*40,13+t*(38+i%4*7),0,Math.PI*2);ctx.fill();
    }
    for(let i=0;i<7;i++){
      const t=Math.max(0,age-.16-i*.035);if(t<=0||t>1.5)continue;
      ctx.globalAlpha=Math.min(.4,t*2)*Math.max(0,1-t/1.5);ctx.fillStyle=i%2?'#526052':'#34473c';
      ctx.beginPath();ctx.arc(p.x+Math.sin(i*3.1)*t*42,p.y-20-t*(45+i*8),10+t*(20+i%3*6),0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=1;this.sparks(point,age);
  }
  render(drive,dt){
    const ctx=this.ctx,scale=this.canvas.height/H;
    if(drive.state==='playing'||drive.state==='ready')this.fxTime+=dt;
    if(drive.state==='ready')this.readyScroll+=dt*35;
    if(drive.state==='over')this.crashAge+=dt;else this.crashAge=0;
    const time=this.fxTime,scroll=drive.state==='ready'?this.readyScroll:drive.scroll;
    ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#16272c';ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    ctx.setTransform(scale,0,0,scale,(this.canvas.width-C*scale)/2,0);
    ctx.save();
    if(this.crashAge>0&&this.crashAge<.3)ctx.translate(Math.sin(this.crashAge*90)*4*(1-this.crashAge/.3),0);
    else if(drive.state!=='ready'&&drive.impact&&drive.impact.age<.22)ctx.translate(Math.sin(drive.impact.age*95)*3*(1-drive.impact.age/.22),0);
    this.faces=[];
    this.plane(0,0,60,80,'#16272c');
    this.plane(0,0,8.8,80,'#3b4b55');this.plane(0,0,8.25,80,'#6a7f87');this.plane(0,0,8,80,'#1c2c37');
    this.textureRoad(scroll);
    this.plane(-3.85,0,.055,80,'#d1dee1');this.plane(3.85,0,.055,80,'#d1dee1');
    for(let z=-30+(scroll/S%2.18);z<23;z+=2.18){this.plane(-4/3,z,.07,.95,'#d4dcc48a');this.plane(4/3,z,.07,.95,'#d4dcc48a');}
    for(let z=-30+(scroll/S%1.8);z<22;z+=1.8){for(const side of [-1,1])this.plane(side*4.08,z,.12,.85,'#f7f2d5');}
    for(let i=0;i<13;i++){
      const z=-27+((i*4.1+scroll/S*.88)%53.3);
      for(const side of [-1,1]){
        this.tree(side*(5.4+(i%3)*.55),z+(side>0?1.5:0),i);
        if(i%2===0)this.mesh(box(side*4.6,0,z,.13,.5,.13,'#eeeada'));
      }
    }
    const boost=drive.nitroLeft>0;
    if(boost){
      for(let i=0;i<13;i++){const z=-22+((time*30+i*3.3)%43),x=(i%2?1:-1)*(3.25+(i%3)*.12);this.plane(x,z,.025,.9,'#b5eff46b');}
    }
    if(drive.state==='ready'){
      this.drawCar(laneX(0),70,false,0);this.drawCar(laneX(2),-80,false,1);
      for(let i=0;i<5;i++)this.drawCoin({x:laneX(1),y:50+i*64,id:i},time);
      this.drawCar(laneX(1),WORLD.playerY+30,true);
    }else{
      // Do not hide coins until an arbitrary world Y: perspective would make
      // them pop into the middle of the screen, just like the former car spawn.
      for(const coin of drive.coins)this.drawCoin(coin,time);
      for(const car of drive.traffic)this.drawCar(car.x,car.y,false,car.color);
      const altitude=drive.altitude+(drive.airborne?Math.sin(time*4)*3:0);
      if(drive.landingGrace>0){
        const x=(drive.x-300)/S,z=(WORLD.playerY-350)/S;
        for(let i=0;i<24;i++){const a=i/24*Math.PI*2;this.plane(x+Math.cos(a)*1.2,z+Math.sin(a)*1.5,.08,.1,'#ade2d1');}
      }
      if(drive.crash)this.explosionParts(drive.crash.x,drive.crash.y,this.crashAge);
      else this.drawCar(drive.x,WORLD.playerY,true,0,drive.tilt,altitude,boost,time,drive.hitShield>0&&Math.floor(drive.time*12)%2===0?.4:1);
    }
    this.faces.sort((a,b)=>b.depth-a.depth);
    for(const face of this.faces){ctx.globalAlpha=face.alpha;ctx.fillStyle=face.color;ctx.beginPath();face.p.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fill();}
    ctx.globalAlpha=1;
    if(drive.crash)this.blast(drive.crash,this.crashAge);
    else if(drive.impact)this.sparks(drive.impact,drive.impact.age);
    ctx.globalAlpha=1;ctx.restore();
  }
}
