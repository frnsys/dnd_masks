import {JEEFACEFILTERAPI} from 'facefilter';
import {JeelizThreeHelper, JeelizResizer} from './helpers';

class Tracker {
  constructor(canvasIds, fns, model) {
    this.fns = fns;
    this.canvasIds = canvasIds;
    this.model = model;

    // Check if using the 4 expression model
    this.usingExpressions = this.model.includes('4EXPR');
  }

  start() {
    JeelizResizer.size_canvas({
      isFullScreen: true,
      canvasId: this.canvasIds.web,
      callback: (isError, bestVideoSettings) => {
        this.init(bestVideoSettings);
      },
      onResize: () => {
        if (this.threeCamera) {
          JeelizThreeHelper.update_camera(this.threeCamera);
        }
      }
    })
  }

  init(videoSettings) {
    JEEFACEFILTERAPI.init({
      canvasId: this.canvasIds.web,
      NNCPath: this.model,
      maxFacesDetected: 1,
      callbackReady: (errCode, spec) => {
        if (errCode) {
          console.log(`Error = ${errCode}`);
          return;
        }
        console.log('Tracker ready');
        this.initScene(spec);
      },

      // called at each render iteration (drawing loop):
      callbackTrack: (detectState) => {
        if (this.usingExpressions) {
          const expr = detectState.expressions;
          const mouthOpen = expr[0];
          const mouthSmile = expr[1];
          const eyebrowFrown = expr[2];
          const eyebrowRaised = expr[3];

          this.fns.update({
            mouthOpen,
            mouthSmile,
            eyebrowFrown,
            eyebrowRaised
          });
        } else {
          this.fns.update();
        }
        JeelizThreeHelper.render(detectState, this.threeCamera);
      }
    });
  }

  initScene(spec) {
    spec.threeCanvasId = this.canvasIds.mask;
    this.threeObj = JeelizThreeHelper.init(spec, this.detectInfo);
    this.faceObj = this.threeObj.faceObject;
    this.fns.setup(this.faceObj);
    this.threeCamera = JeelizThreeHelper.create_camera();
  }

  detectInfo(faceIndex, isDetected) {
    if (isDetected) {
      console.log('INFO in detect_callback(): DETECTED');
    } else {
      console.log('INFO in detect_callback(): LOST');
    }
  }
}

export default Tracker;
