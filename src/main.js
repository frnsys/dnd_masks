import * as THREE from 'three';
import Mask from './mask';
import Tracker from './tracker';
import detectAudio from './audio';
import Background from './background';
import {standardNormal} from './util';

const clock = new THREE.Clock();
const masks = {
  druid: new Mask('/assets/models/mask.gltf'),
  buffalo: new Mask('/assets/models/water_buffalo.gltf'),
};

const BACKGROUNDS = [
  'forest_01.jpg',
  'tavern_01.jpg',
  'warehouse_01.jpg'
];
// const background = new Background('#background', BACKGROUNDS);

function setupMasks(faceObj) {
  masks.druid.load(faceObj, (mask) => {
    // // Eyebrows
    // let geom = new THREE.BoxGeometry(0.4, 0.05, 0.1);
    // let mat = new THREE.MeshBasicMaterial({
    //   color: 0x000000
    // });
    // let offsets = [-0.23, 0.23];
    // mask.eyebrows = offsets.map((offset) => {
    //   let eyebrow = new THREE.Mesh(geom, mat);
    //   eyebrow.position.setZ(0.15).setY(0.5).setX(offset);
    //   mask.add(eyebrow);
    // });
    faceObj.add(mask.obj);
  });

  masks.buffalo.load(faceObj, (mask) => {
    faceObj.add(mask.obj);
    // mask.visible = false;

    // // Blinking
    // let blinkActions = mask.actions.slice(0, 2);
    // blinkActions.forEach((action) => {
    //   action.setLoop(THREE.LoopOnce);
    //   action.play();
    // });
    // let blinksFinished = 0;
    // mask.mixer.addEventListener('finished', () => {
    //   blinksFinished++;
    //   if (blinksFinished >= 2) {
    //     let timeout = Math.max(2000, 5000 + standard_normal() * 5000);
    //     setTimeout(() => {
    //       blinkActions.forEach((action) => {
    //         action.reset();
    //         action.play();
    //       });
    //     }, timeout);
    //     blinksFinished = 0;
    //   }
    // });
  });
}

function updateMasks(expressions) {
  console.log('updating');
  let delta = clock.getDelta();
  if (masks.druid.loaded && masks.buffalo.loaded) {
    const yEyeBrows = ( eyebrowFrown > eyebrowRaised ) ? -0.2 * eyebrowFrown : 0.7 * eyebrowRaised;
    masks.druid.eyebrows.forEach((mesh) => {
      mesh.position.setY(0.5 + yEyeBrows);
    });

    buffalo.mixer.update(delta);
  }
}

// Start face tracker
const tracker = new Tracker({
  web: 'webcam-canvas',
  mask: 'mask-canvas'
}, {
  setup: setupMasks,
  update: updateMasks
});
tracker.start();

// Keybindings/controls
document.addEventListener('keydown', (ev) => {
  if (ev.key == 'k') {
    background.next();
  } else if (ev.key == 'f') {
    document.body.requestFullscreen();
  } else if (ev.key == 'j') {
    if (masks.druid.loaded && masks.buffalo.loaded) {
      if (masks.druid.visible) {
        masks.buffalo.visible = true;
        masks.druid.visible = false;
      } else {
        masks.druid.visible = true;
        masks.buffalo.visible = false;
      }
    }
  }
});

// Volume indicator
const volumeIndicator = document.getElementById('volume-indicator');
detectAudio((vol) => {
  if (tracker.faceObj) {
    let scale = 1 + (vol * 2);
    tracker.faceObj.scale.set(scale, scale, scale);
  }
  volumeIndicator.style.height = `${vol * 100}vh`;
});
