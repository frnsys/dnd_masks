class Background {
  constructor(selector, imagePaths) {
    this.index = 0;
    this.imagePaths = imagePaths;
    this.element = document.querySelector(selector);
    this.set();
  }

  next() {
    this.index += 1;
    if (this.index >= this.imagePaths.length) {
      this.index = 0;
    }
    this.set();
  }

  set() {
    let bg = this.imagePaths[this.index];
    this.element.style.backgroundImage = `url(assets/backgrounds/${bg})`;
  }
}

export default Background;
