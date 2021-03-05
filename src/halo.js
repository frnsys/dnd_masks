import * as THREE from 'three';
import interpolate from 'color-interpolate';

class Halo {
  constructor(opts) {
    this.opts = opts;
    this.group = new THREE.Group();

    // Color setup
    // Interpolate between colors
    // as a->b->c->b->a
    this.colorIndex = 0;
    let tail = opts.colors.slice(0, opts.colors.length-1);
    tail.reverse()
    this.colormap = interpolate(opts.colors.concat(tail));

    let geom = new THREE.OctahedronGeometry(opts.size);
    geom.faces.forEach((face, i) => {
      face.vertexColors[0] = new THREE.Color(this.colormap(this.colorIndex % 2));
      face.vertexColors[1] = new THREE.Color(this.colormap((this.colorIndex + 0.5) % 2));
      face.vertexColors[2] = new THREE.Color(this.colormap((this.colorIndex + 1) % 2));
    });
    geom.colorsNeedUpdate = true;
    geom.elementsNeedUpdate = true

    let mat = new THREE.MeshBasicMaterial({
      opacity: opts.opacity,
      vertexColors: THREE.VertexColors
    });

    let n = opts.n;
    let angle = 2*Math.PI/n;
    for (let i=0; i<n; i++) {
      let x = Math.sin(angle*i) * opts.radius;
      let z = Math.cos(angle*i) * opts.radius;
      let thing = new THREE.Mesh(geom, mat);
      thing.position.setZ(z).setX(x).setY(opts.y);
      this.group.add(thing);
    }
    this.geom = geom;
  }

  show() {
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  toggle() {
    if (this.group.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  update() {
    this.group.rotation.y += this.opts.rotationStep;

    this.colorIndex += 0.001;
    this.geom.faces.forEach((face, i) => {
      face.vertexColors[0] = new THREE.Color(this.colormap(this.colorIndex % 2));
      face.vertexColors[1] = new THREE.Color(this.colormap((this.colorIndex + 0.5) % 2));
      face.vertexColors[2] = new THREE.Color(this.colormap((this.colorIndex + 1) % 2));
    });
    this.geom.colorsNeedUpdate = true;
    this.geom.elementsNeedUpdate = true
  }
}

export default Halo;
