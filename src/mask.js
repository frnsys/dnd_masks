import * as THREE from 'three';
import GLTFLoader from './gltf';

const LOADER = new GLTFLoader();

class Mask {
  constructor(gltfUrl, opts) {
    this.loaded = false;
    this.gltfUrl = gltfUrl;
    this.opts = opts;
  }

  load(parent, onLoad) {
    LOADER.load(this.gltfUrl, (gltf) => {
      let obj = gltf.scene;
      obj.scale.set(this.opts.scale, this.opts.scale, this.opts.scale);
      obj.children.forEach((child) => {
        if (child.material) {
          child.material.color = {
            r: this.opts.emission,
            g: this.opts.emission,
            b: this.opts.emission
          };
        }
      });

      this.obj = obj;
      this.mixer = new THREE.AnimationMixer(obj);
      this.actions = gltf.animations.map((anim) => this.mixer.clipAction(anim));

      parent.add(obj);
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
