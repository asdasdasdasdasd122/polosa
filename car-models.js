import * as T from './vendor/three.module.min.js';

export const CAR_MODELS=['race-future','race','sedan-sports','hatchback-sports','suv-luxury'];
export function normalizeCar(source){
  source.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  const scale=2.26/size.z;
  source.scale.multiplyScalar(scale);source.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
  const group=new T.Group();group.add(source);group.rotation.y=Math.PI;
  group.traverse(node=>{
    if(!node.isMesh)return;
    const wheel=node.name.toLowerCase().includes('wheel');
    const replace=old=>new T.MeshPhysicalMaterial({map:old.map,color:old.color??0xffffff,roughness:wheel?.78:.24,metalness:wheel?.18:.42,clearcoat:wheel?.05:1,clearcoatRoughness:.15,envMapIntensity:1.05});
    node.material=Array.isArray(node.material)?node.material.map(replace):replace(node.material);
    node.castShadow=true;node.receiveShadow=false;
  });
  group.updateMatrixWorld(true);return group;
}
export function drivingCamera(aspect=600/720){
  const camera=new T.PerspectiveCamera(39,aspect,.1,160);
  camera.position.set(0,22,17);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);return camera;
}
