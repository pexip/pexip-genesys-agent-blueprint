export class PexRtcWrapper {

  constructor(videoElement, selfviewElement, presentationElement, confNode, confName, displayName, pin, bandwidth = "1264") {
    this.videoElement = videoElement;
    this.selfviewElement = selfviewElement
    this.presentationElement = presentationElement;
    this.confNode = confNode;
    this.confName = confName;
    this.displayName = displayName;
    this.pin = pin;
    this.bandwidth = parseInt(bandwidth);

    this.pexrtc = new PexRTC();

    this.attachEvents();

    console.debug(`Video Element: ${this.videoElement}`);
    console.debug(`Video Element: ${this.selfviewElement}`);
    console.debug(`Bandwidth: ${this.bandwidth}`);
  }

  _hangupHandler(event) {
    this.pexrtc.disconnect();
    this.videoElement.src = "";
    this.selfviewElement.src = "";
  }

  _setupHandler(videoUrl, pinStatus) {
    console.debug(`PIN status: ${pinStatus}`);
    if (typeof (MediaStream) !== "undefined" && videoUrl instanceof MediaStream) {
      this.selfviewElement.srcObject = videoUrl;
    }
    else {
      this.selfviewElement.src = videoUrl;
    }
    this.pexrtc.connect(this.pin);
  }

  _errorHandler(err) {
    console.error({ err });
  }

  _connectHandler(videoUrl) {
    this.videoElement.poster = "";
    if (typeof (MediaStream) !== "undefined" && videoUrl instanceof MediaStream) {
      this.videoElement.srcObject = videoUrl;
    }
    else {
      this.videoElement.src = videoUrl;
    }
  }

  _disconnectHandler(reason) {
    console.debug({ reason });
    window.removeEventListener('beforeunload', (...args) => this._hangupHandler(...args));
    window.close();
  }

  _presentationHandler(setting, presenter, uuid) {
    if (setting) {
      this.pexrtc.getPresentation();
    }
  }

  _presentationConnectedHandler(stream) {
    if (typeof(MediaStream) !== "undefined" && stream instanceof MediaStream) {
      this.presentationElement.srcObject = stream;
    } else {
      this.presentationElement.src = stream;
    }
    this.presentationElement.classList.add("active");
    this.videoElement.classList.add("secondary");
  }

  _presentationDisconnectedHandler() {
    this.presentationElement.classList.remove("active");
    this.videoElement.classList.remove("secondary");
  }

  attachEvents() {
    window.addEventListener('beforeunload', (...args) => this._hangupHandler(...args));
    this.pexrtc.onSetup = (...args) => this._setupHandler(...args);
    this.pexrtc.onError = (...args) => this._errorHandler(...args);
    this.pexrtc.onConnect = (...args) => this._connectHandler(...args);
    this.pexrtc.onDisconnect = (...args) => this._disconnectHandler(...args);
    this.pexrtc.onPresentation = (...args) => this._presentationHandler(...args);
    this.pexrtc.onPresentationConnected = (...args) => this._presentationConnectedHandler(...args);
    this.pexrtc.onPresentationDisconnected = (...args) => this._presentationDisconnectedHandler(...args);
  }

  makeCall() {
    this.pexrtc.makeCall(
      this.confNode, this.confName, this.displayName, this.bandwidth);
    return this;
  }

  muteAudio() {
    this.pexrtc.muteAudio(true);
    return this;
  }

  muteVideo() {
    this.pexrtc.muteVideo(true);
    return this;
  }

  unMuteVideo() {
    this.pexrtc.muteVideo(false);
    return this;
  }

  disconnectAll() {
    this.pexrtc.disconnectAll();
    return this;
  }

  changeCam(mediaStream) {

    if (window.stream) {
      window.stream.getTracks().forEach(track => {
        track.stop();
      });
    }
    window.stream = mediaStream;

    this.pexrtc.user_media_stream = mediaStream;

    this.pexrtc.renegotiate();

  }


}
