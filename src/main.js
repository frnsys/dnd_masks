import * as THREE from 'three';
import Halo from './halo';
import Mask from './mask';
import Logger from './logger';
import Tracker from './tracker';
import detectAudio from './audio';
import Background from './background';
import {standardNormal} from './util';

const clock = new THREE.Clock();
const masks = {
  druid: new Mask('/assets/models/mask.gltf', {
    scale: 0.15,
    emission: 2
  }),
  buffalo: new Mask('/assets/models/water_buffalo.gltf', {
    scale: 0.17,
    emission: 3
  }),
  face: new Mask('/assets/models/face.gltf', {
    scale: 0.17,
    emission: 2
  })
};
const halo = new Halo({
  n: 8,
  y: 0.5,
  radius: 0.75,
  size: 0.15,
  opacity: 0.5,
  colors: [
    '#ff0000',
    '#f5d142',
    '#6785f0',
    '#3DAE62'
  ],
  rotationStep: 0.05
});

const BACKGROUNDS = [
  '/assets/backgrounds/forest_01.jpg',
  '/assets/backgrounds/tavern_01.jpg',
  '/assets/backgrounds/warehouse_01.jpg',
  'linear-gradient(180deg, rgba(255,79,54,1) 0%, rgba(255,98,53,1) 35%, rgba(255,0,0,1) 100%)',
];
const background = new Background('#background', BACKGROUNDS);

function setupMasks(faceObj) {
  masks.face.load(faceObj, (mask) => {
    let eyebrows = mask.obj.children.filter((ch) => ch.name.startsWith('Eyebrows'));
    mask.eyebrows = eyebrows;

    mask.nonSmile = mask.obj.children.filter((ch) => ch.name.endsWith('Regular'));
    mask.smile = mask.obj.children.filter((ch) => ch.name.endsWith('Smile'));
    mask.smile.forEach((mesh) => mesh.visible = false);

    // Blinking
    let blinkActions = mask.actions.slice(0, 2);
    blinkActions.forEach((action) => {
      action.setLoop(THREE.LoopOnce);
      action.play();
    });
    let blinksFinished = 0;
    mask.mixer.addEventListener('finished', () => {
      blinksFinished++;
      if (blinksFinished >= 2) {
        let timeout = Math.max(2000, 4000 + standardNormal() * 5000);
        setTimeout(() => {
          blinkActions.forEach((action) => {
            action.reset();
            action.play();
          });
        }, timeout);
        blinksFinished = 0;
      }
    });
  });

  masks.druid.load(faceObj, (mask) => {
    mask.visible = false;

    // Eyebrows
    let geom = new THREE.BoxGeometry(1.5, 0.15, 0.5);
    let mat = new THREE.MeshBasicMaterial({
      color: 0x110A07
    });
    let offsets = [-1, 1];
    mask.eyebrows = offsets.map((offset) => {
      let eyebrow = new THREE.Mesh(geom, mat);
      eyebrow.position.setZ(1).setX(offset);
      mask.add(eyebrow);
      return eyebrow;
    });

    // "Smiling" eyebrows
    const smileGeom = new THREE.TorusGeometry(0.75, 0.1, 8, 16, 3);
    mask.eyebrows.push(...offsets.map((offset) => {
      let eyebrow = new THREE.Mesh(smileGeom, mat);
      eyebrow.position.setZ(1).setX(offset);
      eyebrow.visible = false;
      mask.add(eyebrow);
      return eyebrow;
    }));


    let leafActions = mask.actions;
    leafActions.forEach((action) => {
      action.play();
    });
  });

  masks.buffalo.load(faceObj, (mask) => {
    mask.visible = false;

    // Blinking
    let blinkActions = mask.actions.slice(0, 2);
    blinkActions.forEach((action) => {
      action.setLoop(THREE.LoopOnce);
      action.play();
    });
    let blinksFinished = 0;
    mask.mixer.addEventListener('finished', () => {
      blinksFinished++;
      if (blinksFinished >= 2) {
        let timeout = Math.max(2000, 4000 + standardNormal() * 5000);
        setTimeout(() => {
          blinkActions.forEach((action) => {
            action.reset();
            action.play();
          });
        }, timeout);
        blinksFinished = 0;
      }
    });
  });

  halo.hide();
  faceObj.add(halo.group);
}

// NOTE if there's an error in here,
// it doesn't log to console?
// So if the canvases "crash" (i.e. disappear)
// look here, and also look in the model load callbacks,
// as those also don't seem to log errors
function updateMasks(expressions) {
  let delta = clock.getDelta();
  if (Object.values(masks).every((m) => m.loaded)) {
    document.getElementById('loading').style.display = 'none';

    Object.values(masks).forEach((m) => m.mixer.update(delta));

    if (expressions) {
      let {eyebrowFrown, eyebrowRaised, mouthSmile, mouthOpen} = expressions;
      const yEyeBrows = ( eyebrowFrown > eyebrowRaised ) ? -0.2 * eyebrowFrown : 0.7 * eyebrowRaised;
      masks.druid.eyebrows.forEach((mesh) => {
        mesh.position.setY(2.5 + yEyeBrows * 8);
      });
      masks.face.eyebrows.forEach((mesh) => {
        mesh.position.setY(yEyeBrows * 4);
      });
      if (mouthSmile >= 0.001) {
        masks.druid.eyebrows.slice(0, 2).forEach((mesh) => mesh.visible = false);
        masks.druid.eyebrows.slice(2).forEach((mesh) => mesh.visible = true);
        masks.face.smile.forEach((mesh) => mesh.visible = true);
        masks.face.nonSmile.forEach((mesh) => mesh.visible = false);
      } else {
        masks.druid.eyebrows.slice(0, 2).forEach((mesh) => mesh.visible = true);
        masks.druid.eyebrows.slice(2).forEach((mesh) => mesh.visible = false);
        masks.face.smile.forEach((mesh) => mesh.visible = false);
        masks.face.nonSmile.forEach((mesh) => mesh.visible = true);
      }

      halo.group.scale.set(1, 1 + mouthOpen * 2, 1);
      halo.group.position.setY(halo.opts.y - mouthOpen);
      halo.update();
    }
  }
}

// Start face tracker
// This neural network model has learnt 4 expressions, but is heavier
// const model = '/assets/neuralnets/NN_4EXPR_0.json';
// Using the lightest one to reduce CPU usage
const model = '/assets/neuralnets/NN_VERYLIGHT_0.json';
const tracker = new Tracker({
  web: 'webcam-canvas',
  mask: 'mask-canvas'
}, {
  setup: setupMasks,
  update: updateMasks
}, model);
tracker.start();

// Logger for debugging
const logger = new Logger('#logs');

// Keybindings/controls
const bindings = {
  'k': () => background.next(),
  'd': () => {
    let webcamCanvas = document.getElementById('webcam-canvas');
    webcamCanvas.style.display = webcamCanvas.style.display == 'none' ? 'block' : 'none';
  },
  'h': () => {
    let maskCanvas = document.getElementById('mask-canvas');
    maskCanvas.style.display = maskCanvas.style.display == 'none' ? 'block' : 'none';
  },
  'f': () => {
    document.body.requestFullscreen();
  },
  'l': () => {
    logger.toggle();
  },
  'c': () => {
    halo.toggle();
  },

  'm': () => {
    if (Object.values(masks).every((m) => m.loaded)) {
      Object.values(masks).forEach((m) => m.visible = false);
      masks.druid.visible = true;
    }
  },
  'w': () => {
    if (Object.values(masks).every((m) => m.loaded)) {
      Object.values(masks).forEach((m) => m.visible = false);
      masks.buffalo.visible = true;
    }
  },
  't': () => {
    if (Object.values(masks).every((m) => m.loaded)) {
      Object.values(masks).forEach((m) => m.visible = false);
      masks.face.visible = true;
    }
  }
}
document.addEventListener('keydown', (ev) => {
  if (ev.key in bindings) bindings[ev.key]();
});

// Volume indicator
const volumeIndicator = document.getElementById('volume-indicator');
detectAudio((vol) => {
  if (tracker.faceObj) {
    let scale = 1.5 + (vol * 2);
    tracker.faceObj.scale.set(scale, scale, scale);
  }
  volumeIndicator.style.height = `${vol * 100}vh`;
});
