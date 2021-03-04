import * as THREE from 'three';
import GLTFLoader from './gltf';

const LOADER = new GLTFLoader();

class Mask {
  constructor(gltfUrl) {
    this.loaded = false;
    this.gltfUrl = gltfUrl;
  }

  load(parent, onLoad) {
    LOADER.load(this.gltfUrl, (gltf) => {
      console.log(`loaded: ${this.gltfUrl}`);
      let obj = gltf.scene;
      obj.scale.set(0.2, 0.2, 0.2);
      // obj.children.forEach((child) => {
      //   if (child.material) {
      //     child.material.color = {
      //       r: 2,
      //       g: 2,
      //       b: 2
      //     };
      //   }
      // });

      this.obj = obj;
      // this.mixer = new THREE.AnimationMixer(obj);
      // this.actions = gltf.animations.map((anim) => this.mixer.clipAction(anim));

      // parent.add(obj);
      onLoad(this);
      this.loaded = true;
    });
  }

  get visible() {
    return this.obj.visible;
  }

  set visible(visible) {
    this.obj.visible = visible;
  }

  add(obj) {
    this.obj.add(obj);
  }
}


export default Mask;
