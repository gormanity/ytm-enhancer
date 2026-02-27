(function () {
  if (window.__ytmEnhancerAudioBridge) return;
  window.__ytmEnhancerAudioBridge = true;

  var audioCtx = null;
  var analyser = null;
  var source = null;
  var rafId = null;
  var running = false;

  function init() {
    var video = document.querySelector("video.html5-main-video");
    if (!video) return false;

    try {
      audioCtx = new AudioContext();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source = audioCtx.createMediaElementSource(video);
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      return true;
    } catch (e) {
      console.error("[YTM Enhancer] Audio bridge init failed:", e);
      return false;
    }
  }

  function pump() {
    if (!running || !analyser) return;
    var data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    window.postMessage(
      {
        type: "ytm-enhancer:frequency-data",
        data: Array.from(data),
      },
      "*",
    );
    rafId = requestAnimationFrame(pump);
  }

  function start() {
    if (!analyser && !init()) return;
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    running = true;
    pump();
  }

  function stop() {
    running = false;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function resume() {
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    if (!running) start();
  }

  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "ytm-enhancer:audio-bridge-cmd") return;
    switch (e.data.command) {
      case "start":
        start();
        break;
      case "stop":
        stop();
        break;
      case "resume":
        resume();
        break;
    }
  });
})();
