// Copied from <https://github.com/jeeliz/jeelizFaceFilter/tree/master/helpers>

import * as THREE from 'three';
import {JEEFACEFILTERAPI} from 'facefilter';

const JeelizThreeHelper = (function(){
  // internal settings:
  const _settings = {
    rotationOffsetX: 0.0, // negative -> look upper. in radians
    pivotOffsetYZ: [0.2, 0.6],// YZ of the distance between the center of the cube and the pivot

    detectionThreshold: 0.8, // sensibility, between 0 and 1. Less -> more sensitive
    detectionHysteresis: 0.02,

    //tweakMoveYRotateX: 0,//0.5, // tweak value: move detection window along Y axis when rotate the face around X (look up <-> down)

    cameraMinVideoDimFov: 35 // Field of View for the smallest dimension of the video in degrees
  };

  // private vars:
  let _threeRenderer = null,
      _threeScene = null,
      _threeVideoMesh = null,
      _threeVideoTexture = null,
      _threeTranslation = null;

  let _maxFaces = -1,
      _isMultiFaces = false,
      _detectCallback = null,
      _isVideoTextureReady = false,
      _isSeparateThreeCanvas = false,
      _faceFilterCv = null,
      _videoElement = null,
      _isDetected = false,
      _scaleW = 1,
      _canvasAspectRatio = -1;

  const _threeCompositeObjects = [];

  let _gl = null,
      _glVideoTexture = null,
      _glShpCopyCut = null,
      _glShpCopyCutVideoMatUniformPointer = null;

  let _videoTransformMat2 = null;

  // private funcs:
  function destroy(){
    _isVideoTextureReady = false;
    _threeCompositeObjects.splice(0);
    if (_threeVideoTexture){
      _threeVideoTexture.dispose();
      _threeVideoTexture = null;
    }
  }

  function create_threeCompositeObjects(){
    for (let i=0; i<_maxFaces; ++i){
      // COMPOSITE OBJECT WHICH WILL TRACK A DETECTED FACE
      const threeCompositeObject = new THREE.Object3D();
      threeCompositeObject.frustumCulled = false;
      threeCompositeObject.visible = false;

      _threeCompositeObjects.push(threeCompositeObject);
      _threeScene.add(threeCompositeObject);
    }
  }

  function create_videoScreen(){
    const videoScreenVertexShaderSource = "attribute vec2 position;\n\
        uniform mat2 videoTransformMat2;\n\
        varying vec2 vUV;\n\
        void main(void){\n\
          gl_Position = vec4(position, 0., 1.);\n\
          vUV = 0.5 + videoTransformMat2 * position;\n\
        }";
    const videoScreenFragmentShaderSource = "precision lowp float;\n\
        uniform sampler2D samplerVideo;\n\
        varying vec2 vUV;\n\
        void main(void){\n\
          gl_FragColor = texture2D(samplerVideo, vUV);\n\
        }";

    if (_isSeparateThreeCanvas){
      const compile_shader = function(source, type, typeString) {
        const glShader = _gl.createShader(type);
        _gl.shaderSource(glShader, source);
        _gl.compileShader(glShader);
        if (!_gl.getShaderParameter(glShader, _gl.COMPILE_STATUS)) {
          alert("ERROR IN " + typeString + " SHADER: " + _gl.getShaderInfoLog(glShader));
          return null;
        }
        return glShader;
      };

      const glShaderVertex =   compile_shader(videoScreenVertexShaderSource, _gl.VERTEX_SHADER, 'VERTEX');
      const glShaderFragment = compile_shader(videoScreenFragmentShaderSource, _gl.FRAGMENT_SHADER, 'FRAGMENT');

      _glShpCopyCut = _gl.createProgram();
      _gl.attachShader(_glShpCopyCut, glShaderVertex);
      _gl.attachShader(_glShpCopyCut, glShaderFragment);

      _gl.linkProgram(_glShpCopyCut);
      const samplerVideo = _gl.getUniformLocation(_glShpCopyCut, 'samplerVideo');
      _glShpCopyCutVideoMatUniformPointer = _gl.getUniformLocation(_glShpCopyCut, 'videoTransformMat2');

      return;
    }

    // init video texture with red:
    _threeVideoTexture = new THREE.DataTexture( new Uint8Array([255,0,0]), 1, 1, THREE.RGBFormat);
    _threeVideoTexture.needsUpdate = true;

    // CREATE THE VIDEO BACKGROUND:
    const videoMaterial = new THREE.RawShaderMaterial({
      depthWrite: false,
      depthTest: false,
      vertexShader: videoScreenVertexShaderSource,
      fragmentShader: videoScreenFragmentShaderSource,
      uniforms:{
        samplerVideo: {value: _threeVideoTexture},
        videoTransformMat2: {
          value: _videoTransformMat2
        }
      }
    });

    const videoGeometry = new THREE.BufferGeometry()
    const videoScreenCorners = new Float32Array([-1,-1,   1,-1,   1,1,   -1,1]);
    videoGeometry.addAttribute( 'position', new THREE.BufferAttribute( videoScreenCorners, 2 ) );
    videoGeometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0,1,2, 0,2,3]), 1));
    _threeVideoMesh = new THREE.Mesh(videoGeometry, videoMaterial);
    that.apply_videoTexture(_threeVideoMesh);
    _threeVideoMesh.renderOrder = -1000; // render first
    _threeVideoMesh.frustumCulled = false;
    _threeScene.add(_threeVideoMesh);
  } //end create_videoScreen()

  function detect(detectState){
    _threeCompositeObjects.forEach(function(threeCompositeObject, i){
      _isDetected = threeCompositeObject.visible;
      const ds = detectState[i];
      if (_isDetected && ds.detected < _settings.detectionThreshold-_settings.detectionHysteresis){

        // DETECTION LOST
        if (_detectCallback) _detectCallback(i, false);
        threeCompositeObject.visible = false;
      } else if (!_isDetected && ds.detected > _settings.detectionThreshold+_settings.detectionHysteresis){

        // FACE DETECTED
        if (_detectCallback) _detectCallback(i, true);
        threeCompositeObject.visible = true;
      }
    }); //end loop on all detection slots
  }

  function update_poses(ds, threeCamera){
    // tan( <horizontal FoV> / 2 ):
    const halfTanFOVX = Math.tan(threeCamera.aspect * threeCamera.fov * Math.PI/360); //tan(<horizontal FoV>/2), in radians (threeCamera.fov is vertical FoV)

    _threeCompositeObjects.forEach(function(threeCompositeObject, i){
      if (!threeCompositeObject.visible) return;
      const detectState = ds[i];

      // tweak Y position depending on rx:
      //const tweak = _settings.tweakMoveYRotateX * Math.tan(detectState.rx);
      const cz = Math.cos(detectState.rz), sz = Math.sin(detectState.rz);

      // relative width of the detection window (1-> whole width of the detection window):
      const W = detectState.s * _scaleW;

      // distance between the front face of the cube and the camera:
      const DFront = 1 / ( 2 * W * halfTanFOVX );

      // D is the distance between the center of the unit cube and the camera:
      const D = DFront + 0.5;

      // coords in 2D of the center of the detection window in the viewport:
      const xv = detectState.x * _scaleW;
      const yv = detectState.y * _scaleW;

      // coords in 3D of the center of the cube (in the view coordinates system):
      const z = -D;   // minus because view coordinate system Z goes backward
      const x = xv * D * halfTanFOVX;
      const y = yv * D * halfTanFOVX / _canvasAspectRatio;

      // set position before pivot:
      threeCompositeObject.position.set(-sz*_settings.pivotOffsetYZ[0], -cz*_settings.pivotOffsetYZ[0], -_settings.pivotOffsetYZ[1]);

      // set rotation and apply it to position:
      threeCompositeObject.rotation.set(detectState.rx+_settings.rotationOffsetX, detectState.ry, detectState.rz, "ZYX");
      threeCompositeObject.position.applyEuler(threeCompositeObject.rotation);

      // add translation part:
      _threeTranslation.set(x, y+_settings.pivotOffsetYZ[0], z+_settings.pivotOffsetYZ[1]);
      threeCompositeObject.position.add(_threeTranslation);
    }); //end loop on composite objects
  }

  //public methods:
  const that = {
    // launched with the same spec object than callbackReady. set spec.threeCanvasId to the ID of the threeCanvas to be in 2 canvas mode:
    init: function(spec, detectCallback){
      destroy();

      _maxFaces = spec.maxFacesDetected;
      _glVideoTexture = spec.videoTexture;
      _videoTransformMat2 = spec.videoTransformMat2;
      _gl = spec.GL;
      _faceFilterCv = spec.canvasElement;
      _isMultiFaces = (_maxFaces>1);
      _videoElement = spec.videoElement;

      // enable 2 canvas mode if necessary:
      let threeCanvas = null;
      if (spec.threeCanvasId){
        _isSeparateThreeCanvas = true;
        // adjust the threejs canvas size to the threejs canvas:
        threeCanvas = document.getElementById(spec.threeCanvasId);
        threeCanvas.setAttribute('width', _faceFilterCv.width);
        threeCanvas.setAttribute('height', _faceFilterCv.height);
      } else {
        threeCanvas = _faceFilterCv;
      }

      if (typeof(detectCallback) !== 'undefined'){
        _detectCallback = detectCallback;
      }

       // init THREE.JS context:
      _threeRenderer = new THREE.WebGLRenderer({
        context: (_isSeparateThreeCanvas) ? null : _gl,
        canvas: threeCanvas,
        alpha: (_isSeparateThreeCanvas || spec.alpha) ? true : false
      });

      _threeScene = new THREE.Scene();
      _threeTranslation = new THREE.Vector3();

      create_threeCompositeObjects();
      create_videoScreen();

      // handle device orientation change:
      window.addEventListener('orientationchange', function(){
        setTimeout(JEEFACEFILTERAPI.resize, 1000);
      }, false);

      const returnedDict = {
        videoMesh: _threeVideoMesh,
        renderer: _threeRenderer,
        scene: _threeScene
      };
      if (_isMultiFaces){
        returnedDict.faceObjects = _threeCompositeObjects
      } else {
        returnedDict.faceObject = _threeCompositeObjects[0];
      }
      return returnedDict;
    }, //end that.init()

    detect: function(detectState){
      const ds = (_isMultiFaces) ? detectState : [detectState];

      // update detection states:
      detect(ds);
    },

    get_isDetected: function() {
      return _isDetected;
    },

    render: function(detectState, threeCamera){
      const ds = (_isMultiFaces) ? detectState : [detectState];

      // update detection states then poses:
      detect(ds);
      update_poses(ds, threeCamera);

      if (_isSeparateThreeCanvas){
        // render the video texture on the faceFilter canvas:
        _gl.viewport(0, 0, _faceFilterCv.width, _faceFilterCv.height);
        _gl.useProgram(_glShpCopyCut);
        _gl.uniformMatrix2fv(_glShpCopyCutVideoMatUniformPointer, false, _videoTransformMat2);
        _gl.activeTexture(_gl.TEXTURE0);
        _gl.bindTexture(_gl.TEXTURE_2D, _glVideoTexture);
        _gl.drawElements(_gl.TRIANGLES, 3, _gl.UNSIGNED_SHORT, 0);
      } else {
        // reinitialize the state of THREE.JS because JEEFACEFILTER have changed stuffs:
        // -> can be VERY costly !
        _threeRenderer.state.reset();
      }

      // trigger the render of the THREE.JS SCENE:
      _threeRenderer.render(_threeScene, threeCamera);
    },

    sortFaces: function(bufferGeometry, axis, isInv){ // sort faces long an axis
      // Useful when a bufferGeometry has alpha: we should render the last faces first
      const axisOffset = {X:0, Y:1, Z:2}[axis.toUpperCase()];
      const sortWay = (isInv) ? -1 : 1;

      // fill the faces array:
      const nFaces = bufferGeometry.index.count/3;
      const faces = new Array(nFaces);
      for (let i=0; i<nFaces; ++i){
        faces[i] = [bufferGeometry.index.array[3*i], bufferGeometry.index.array[3*i+1], bufferGeometry.index.array[3*i+2]];
      }

      // compute centroids:
      const aPos = bufferGeometry.attributes.position.array;
      const centroids = faces.map(function(face, faceIndex){
        return [
          (aPos[3*face[0]]+aPos[3*face[1]]+aPos[3*face[2]])/3,       // X
          (aPos[3*face[0]+1]+aPos[3*face[1]+1]+aPos[3*face[2]+1])/3, // Y
          (aPos[3*face[0]+2]+aPos[3*face[1]+2]+aPos[3*face[2]+2])/3, // Z
          face
        ];
      });

      // sort centroids:
      centroids.sort(function(ca, cb){
        return (ca[axisOffset]-cb[axisOffset]) * sortWay;
      });

      // reorder bufferGeometry faces:
      centroids.forEach(function(centroid, centroidIndex){
        const face = centroid[3];
        bufferGeometry.index.array[3*centroidIndex] = face[0];
        bufferGeometry.index.array[3*centroidIndex+1] = face[1];
        bufferGeometry.index.array[3*centroidIndex+2] = face[2];
      });
    }, //end sortFaces

    get_threeVideoTexture: function(){
      return _threeVideoTexture;
    },

    apply_videoTexture: function(threeMesh){
      if (_isVideoTextureReady){
        return;
      }
      threeMesh.onAfterRender = function(){
        // Replace _threeVideoTexture.__webglTexture by the real video texture:
        try {
          _threeRenderer.properties.update(_threeVideoTexture, '__webglTexture', _glVideoTexture);
          _threeVideoTexture.magFilter = THREE.LinearFilter;
          _threeVideoTexture.minFilter = THREE.LinearFilter;
          _isVideoTextureReady = true;
        } catch(e){
          console.log('WARNING in JeelizThreeHelper: the glVideoTexture is not fully initialized');
        }
        delete(threeMesh.onAfterRender);
      };
    },

    // create an occluder, IE a transparent object which writes on the depth buffer:
    create_threejsOccluder: function(occluderURL, callback){
      const occluderMesh = new THREE.Mesh();
      new THREE.BufferGeometryLoader().load(occluderURL, function(occluderGeometry){
        const mat = new THREE.ShaderMaterial({
          vertexShader: THREE.ShaderLib.basic.vertexShader,
          fragmentShader: "precision lowp float;\n void main(void){\n gl_FragColor=vec4(1.,0.,0.,1.);\n }",
          uniforms: THREE.ShaderLib.basic.uniforms,
          colorWrite: false
        });

        occluderMesh.renderOrder = -1; //render first
        occluderMesh.material = mat;
        occluderMesh.geometry = occluderGeometry;
        if (typeof(callback)!=='undefined' && callback) callback(occluderMesh);
      });
      return occluderMesh;
    },

    set_pivotOffsetYZ: function(pivotOffset) {
      _settings.pivotOffsetYZ = pivotOffset;
    },

    create_camera: function(zNear, zFar){
      const threeCamera = new THREE.PerspectiveCamera(1, 1, (zNear) ? zNear : 0.1, (zFar) ? zFar : 100);
      that.update_camera(threeCamera);

      return threeCamera;
    },

    update_camera: function(threeCamera){
      // compute aspectRatio:
      const canvasElement = _threeRenderer.domElement;
      const cvw = canvasElement.width;
      const cvh = canvasElement.height;
      _canvasAspectRatio = cvw / cvh;

      // compute vertical field of view:
      const vw = _videoElement.videoWidth;
      const vh = _videoElement.videoHeight;
      const videoAspectRatio = vw / vh;
      const fovFactor = (vh > vw) ? (1.0 / videoAspectRatio) : 1.0;
      const fov = _settings.cameraMinVideoDimFov * fovFactor;
      console.log('INFO in JeelizThreeHelper - update_camera(): Estimated vertical video FoV is', fov);

      // compute X and Y offsets in pixels:
      let scale = 1.0;
      if (_canvasAspectRatio > videoAspectRatio) {
        // the canvas is more in landscape format than the video, so we crop top and bottom margins:
        scale = cvw / vw;
      } else {
        // the canvas is more in portrait format than the video, so we crop right and left margins:
        scale = cvh / vh;
      }
      const cvws = vw * scale, cvhs = vh * scale;
      const offsetX = (cvws - cvw) / 2.0;
      const offsetY = (cvhs - cvh) / 2.0;
      _scaleW = cvw / cvws;

      // apply parameters:
      threeCamera.aspect = _canvasAspectRatio;
      threeCamera.fov = fov;
      console.log('INFO in JeelizThreeHelper.update_camera(): camera vertical estimated FoV is', fov, 'deg');
      threeCamera.setViewOffset(cvws, cvhs, offsetX, offsetY, cvw, cvh);
      threeCamera.updateProjectionMatrix();

      // update drawing area:
      _threeRenderer.setSize(cvw, cvh, false);
      _threeRenderer.setViewport(0, 0, cvw, cvh);
    }, //end update_camera()

    resize: function(w, h, threeCamera){
      _threeRenderer.domElement.width = w;
      _threeRenderer.domElement.height = h;
      JEEFACEFILTERAPI.resize();
      if (threeCamera){
        that.update_camera(threeCamera);
      }
    }
  }
  return that;
})();


/*
This helper can help for:
* adjusting the canvas resolution to the good size -> this is crucial to
optimize the code because if the canvas is too large,
there are too much pixels to compute => it will be slow

* to mirror horizontally or not the canvas -> if the front camera is used we
need it flipped (mirror effect), while if the rear camera is used we need it not flipped

* to get the best camera resolution (either above the canvas resolution or closer)
to balance between performance and quality
*/
"use strict";

const JeelizResizer = (function(){
  // private vars:
  let _domCanvas = null,
      _whCanvasPx = null,
      _isApplyCSS = false,
      _resizeAttemptsCounter = 0,
      _overSamplingFactor = 1,
      _isFullScreen = false,
      _timerFullScreen = null,
      _callbackResize = null,
      _isInvFullscreenWH = false;

  const _cameraResolutions = [ // all resolutions should be in landscape mode
    [640,480],
    [768,480],
    [800,600],
    [960,640],
    [960,720],
    [1024,768],
    [1280,720],
    [1920, 1080]
  ];

  //private functions
  function add_CSStransform(domElement, CSS){
    const CSStransform = domElement.style.transform;
    if (CSStransform.indexOf(CSS) !== -1) return;
    domElement.style.transform = CSS + ' ' + CSStransform;
  }

  // Compute overlap between 2 rectangles A and B
  // characterized by their width and their height in pixels
  // the rectangles are centered
  // return the ratio (pixels overlaped)/(total pixels)
  function compute_overlap(whA, whB){
    const aspectRatioA = whA[0] / whA[1];
    const aspectRatioB = whB[0] / whB[1]; //higher aspectRatio -> more landscape

    var whLandscape, whPortrait;
    if (aspectRatioA > aspectRatioB){
      whLandscape = whA, whPortrait = whB;
    } else {
      whLandscape = whB, whPortrait = whA;
    }

    // The overlapped area will be always a rectangle
    const areaOverlap = Math.min(whLandscape[0], whPortrait[0]) * Math.min(whLandscape[1], whPortrait[1]);

    var areaTotal;
    if (whLandscape[0]>=whPortrait[0] && whLandscape[1]>=whPortrait[1]){ //union is a rectangle
      areaTotal = whLandscape[0]*whLandscape[1];
    } else if (whPortrait[0]>whLandscape[0] && whPortrait[1]>whLandscape[1]){ //union is a rectangle
      areaTotal = whPortrait[0]*whPortrait[1];
    } else { //union is a cross
      areaTotal = whLandscape[0]*whLandscape[1];
      areaTotal += (whPortrait[1]-whLandscape[1])*whPortrait[0];
    }

    return areaOverlap / areaTotal;
  } //end compute_overlap()

  function update_sizeCanvas(){
    const domRect = _domCanvas.getBoundingClientRect();
    apply_sizeCanvas(domRect.width, domRect.height);
  }

  function apply_sizeCanvas(width, height){
    _whCanvasPx = [
      Math.round(_overSamplingFactor * width),
      Math.round(_overSamplingFactor * height)
    ];

    // set canvas resolution:
    _domCanvas.setAttribute('width',  _whCanvasPx[0]);
    _domCanvas.setAttribute('height', _whCanvasPx[1]);

    // canvas display size:
    if (_isApplyCSS){
      _domCanvas.style.width = width.toString() + 'px';
      _domCanvas.style.height = height.toString() + 'px';
    }
  }

  function on_windowResize(){
    // avoid to resize too often using a timer
    // (it can create weird bug with some browsers)
    if (_timerFullScreen){
      clearTimeout(_timerFullScreen);
    }
    _timerFullScreen = setTimeout(resize_fullScreen, 50);
  }

  function resize_canvasToFullScreen(){
    const wh = [window['innerWidth'], window['innerHeight']];
    if (_isInvFullscreenWH){
      wh.reverse();
    }
    apply_sizeCanvas(wh[0], wh[1]);
  }

  function resize_fullScreen(){
    resize_canvasToFullScreen();
    JEEFACEFILTERAPI.resize();
    _timerFullScreen = null;
    if (_callbackResize) {
      _callbackResize();
    }
  }

  // public methods:
  const that = {
    // return true or false if the device is in portrait or landscape mode
    // see https://stackoverflow.com/questions/4917664/detect-viewport-orientation-if-orientation-is-portrait-display-alert-message-ad
    is_portrait: function(){
      try{
        if (window['matchMedia']("(orientation: portrait)")['matches']){
          return true;
        } else {
          return false;
        }
      } catch(e){
        return (window['innerHeight'] > window['innerWidth']);
      }
    },

    // check whether the user is using IOS or not
    // see https://stackoverflow.com/questions/9038625/detect-if-device-is-ios
    check_isIOS: function(){
      const isIOS = /iPad|iPhone|iPod/.test(navigator['userAgent']) && !window['MSStream'];
      return isIOS;
    },

    // Should be called only if IOS was detected
    // see https://stackoverflow.com/questions/8348139/detect-ios-version-less-than-5-with-javascript
    get_IOSVersion: function(){
      const v = (navigator['appVersion']).match(/OS (\d+)_(\d+)_?(\d+)?/);
      return (v.length > 2) ? [parseInt(v[1], 10), parseInt(v[2], 10), parseInt(v[3] || 0, 10)] : [0, 0, 0];
    },

    // Check whether the user is using Android or not
    // see https://stackoverflow.com/questions/6031412/detect-android-phone-via-javascript-jquery
    check_isAndroid: function(){
      const ua = navigator['userAgent'].toLowerCase();
      return (ua.indexOf('android') !== -1);
    },

    // Should be called only if Android was detected
    // see https://stackoverflow.com/questions/7184573/pick-up-the-android-version-in-the-browser-by-javascript
    get_androidVersion: function(){
      const ua = navigator['userAgent'].toLowerCase();
      const match = ua.match(/android\s([0-9\.]*)/i);
      if (!match || match.length<2){
        return [0,0,0];
      }
      const v = match[1].split('.');
      return [
        parseInt(v[0], 10),
        parseInt(v[1], 10),
        parseInt(v[2] || 0, 10)
      ];
    },

    // to get a video of 480x640 (480 width and 640 height)
    // with a mobile phone in portrait mode, the default implementation
    // should require a 480x640 video (Chrome, Firefox)
    // but bad implementations needs to always request landscape resolutions (so 640x480)
    // see https://github.com/jeeliz/jeelizFaceFilter/issues/144
    require_flipVideoWHIfPortrait: function(){
      // disabled because of https://github.com/jeeliz/jeelizFaceFilter/issues/144
      // seems quite a mess though...

      /* if (that.check_isIOS()){
        //the user is using IOS
        const version = that.get_IOSVersion();
        if (version[0] >= 13){
          if (version[1] <= 1 // IOS 13.0.X
              || (version[1] === 1 && version[2] < 3)){ // IOS 13.1.X with X<3
            return false;
          }
        }
      }

      if (that.check_isAndroid()){
        const version = that.get_androidVersion();
        if (version[0] >= 9){ // Android 9+
          return false;
        }
      } */

      // normal implementation
      return false;
    },

    // size canvas to the right resolution
    // should be called after the page loading
    // when the canvas has already the right size
    // options:
    //  - <string> canvasId: id of the canvas
    //  - <HTMLCanvasElement> canvas: if canvasId is not provided
    //  - <function> callback: function to launch if there was an error or not
    //  - <float> overSamplingFactor: facultative. If 1, same resolution than displayed size (default).
    //    If 2, resolution twice higher than real size
    //  - <boolean> CSSFlipX: if we should flip the canvas or not. Default: false
    //  - <boolean> isFullScreen: if we should set the canvas fullscreen. Default: false
    //  - <function> onResize: function called when the window is resized. Only enabled if isFullScreen = true
    //  - <boolean> isInvWH: if we should invert width and height for fullscreen mode only. default = false
    //  - <boolean> isApplyCSS: if we should also apply canvas dimensions as CSS. default = false
    size_canvas: function(optionsArg){
      const options = Object.assign({
        canvasId: 'undefinedCanvasId',
        canvas: null,
        overSamplingFactor: window.devicePixelRatio || 1,

        isFullScreen: false,
        isInvWH: false,
        CSSFlipX: false,
        isApplyCSS: false,

        onResize: null,
        callback: function(){}
      }, optionsArg);

      _domCanvas = (options.canvas) ? options.canvas : document.getElementById(options.canvasId);
      _isFullScreen = options.isFullScreen;
      _isInvFullscreenWH = options.isInvWH;
      _isApplyCSS = options.isApplyCSS;
      _overSamplingFactor = options.overSamplingFactor;

      if (_isFullScreen){
        // we are in fullscreen mode
        _callbackResize = options.onResize;

        resize_canvasToFullScreen();
        window.addEventListener('resize', on_windowResize, false);
        window.addEventListener('orientationchange', on_windowResize, false);

      } else { // not fullscreen mode

        // get display size of the canvas:
        const domRect = _domCanvas.getBoundingClientRect();
        if (domRect.width===0 || domRect.height===0){
          console.log('WARNING in JeelizResize.size_canvas(): the canvas has its width or its height null, Retry a bit later...');
          if (++_resizeAttemptsCounter > 20){
            options.callback('CANNOT_RESIZECANVAS');
            return;
          }
          setTimeout(that.size_canvas.bind(null, options), 50);
          return;
        }

        // do resize canvas:
        _resizeAttemptsCounter = 0;
        update_sizeCanvas();
      }

      // flip horizontally if required:
      if (options.CSSFlipX){
        add_CSStransform(_domCanvas, 'rotateY(180deg)');
      }

      // compute the best camera resolutions:
      const allResolutions = _cameraResolutions.map(function(x){
        return x.slice(0)
      });

      // if we are in portrait mode, the camera is also in portrait mode
      // so we need to set all resolutions to portrait mode
      if (that.is_portrait() && that.require_flipVideoWHIfPortrait()){
        allResolutions.forEach(function(wh){
          wh.reverse();
        });
      }

      // sort camera resolutions from the best to the worst:
      allResolutions.sort(function(resA, resB){
        return compute_overlap(resB, _whCanvasPx) - compute_overlap(resA, _whCanvasPx);
      });

      // pick the best camera resolution:
      const bestCameraResolution = {
        'idealWidth':  allResolutions[0][0],
        'idealHeight': allResolutions[0][1]
      };

      console.log('INFO in JeelizResizer: bestCameraResolution =', bestCameraResolution);

      // launch the callback function after a small interval to let it
      // some time to size:
      setTimeout(options.callback.bind(null, false, bestCameraResolution), 1);
    }, //end size_canvas()

    // Should be called if the canvas is resized to update the canvas resolution:
    resize_canvas: function(){
      if (_isFullScreen){
        resize_canvasToFullScreen()
      } else {
        update_sizeCanvas();
      }
    },

    get_canvasSize: function(){
      return _whCanvasPx;
    }
  }; //end that
  return that;
})();

export {JeelizThreeHelper, JeelizResizer};
