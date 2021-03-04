function detectAudio(cb) {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then((stream) => {
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(1024, 1, 1);

      source.connect(processor);
      processor.connect(context.destination);

      // Calculate input level
      // From <https://github.com/cwilso/volume-meter/blob/master/volume-meter.js>
      let vol = 0;
      processor.onaudioprocess = (e) => {
        let buf = e.inputBuffer.getChannelData(0);
        let bufLength = buf.length;
        let x, sum = 0;

        for (let i=0; i<bufLength; i++) {
          x = buf[i];
          sum += x * x;
        }

        let rms =  Math.sqrt(sum / bufLength);
        vol = Math.max(rms, vol*0.95);
        cb(vol);
      };
    }).catch(function(err) {
      console.log(`Error with audio detection: ${err}`);
    });
}

export default detectAudio;
