import {WebGLScene} from './scene-webgl.js?v=7';
import {Scene3D} from './scene3d.js?v=7';

export function createScene(canvas,options={}){
  // Probe a separate canvas so a failed GPU initialization never locks the
  // game's own canvas out of its compatible 2D renderer.
  const probe=document.createElement('canvas');
  let supported=false;try{const gl=probe.getContext('webgl2');supported=Boolean(gl);gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}
  if(supported){try{return new WebGLScene(canvas,options);}catch(error){
    console.warn('3D initialization failed:',error);
    const fresh=canvas.cloneNode(false);canvas.replaceWith(fresh);canvas=fresh;
  }}
  const scene=new Scene3D(canvas,options);scene.ready=scene.loadAssets();return scene;
}
