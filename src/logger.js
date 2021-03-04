class Logger {
  constructor(selector) {
    // Override console.log to also print to
    // logger element
    console._log = console.log;
    console.log = (...args) => {
      console._log(...args);

      let el = document.createElement('div');
      el.innerText = args.join(' ')
      this.element.appendChild(el);
    }

    this.element = document.querySelector(selector);
  }

  show() {
    this.element.style.display = 'block';
  }

  hide() {
    this.element.style.display = 'none';
  }

  toggle() {
    if (this.element.style.display == 'none') {
      this.show();
    } else {
      this.hide();
    }
  }
}

export default Logger;
