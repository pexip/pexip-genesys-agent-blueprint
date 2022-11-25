export class PexRtcWrapper {
  constructor(
    videoElement,
    selfviewElement,
    presentationElement,
    toolbar,
    confNode,
    confName,
    displayName,
    pin,
    bandwidth = '1264'
  ) {
    this.videoElement = videoElement
    this.selfviewElement = selfviewElement
    this.presentationElement = presentationElement
    this.toolbar = toolbar
    this.confNode = confNode
    this.confName = confName
    this.displayName = displayName
    this.pin = pin
    this.bandwidth = parseInt(bandwidth)

    this.pexrtc = new PexRTC()

    //Disable audio layer
    this.pexrtc.audio_source = false

    this.isSharingScreen = false

    this.attachEvents()

    console.debug(`Video Element: ${this.videoElement}`)
    console.debug(`Video Element: ${this.selfviewElement}`)
    console.debug(`Bandwidth: ${this.bandwidth}`)
  }

  _hangupHandler(event) {
    this.pexrtc.disconnect()
    this.videoElement.src = ''
    this.selfviewElement.src = ''
    this.presentationElement.src = ''
    this.toolbar.style.display = 'none'
  }

  _setupHandler(videoUrl, pinStatus) {
    console.debug(`PIN status: ${pinStatus}`)
    if (typeof MediaStream !== 'undefined' && videoUrl instanceof MediaStream) {
      this.selfviewElement.srcObject = videoUrl
    } else {
      this.selfviewElement.src = videoUrl
    }
    this.pexrtc.connect(this.pin)
  }

  _errorHandler(err) {
    console.error({ err })
  }

  _connectHandler(videoUrl) {
    this.videoElement.poster = ''
    this.toolbar.style.display = 'flex'
    if (typeof MediaStream !== 'undefined' && videoUrl instanceof MediaStream) {
      this.videoElement.srcObject = videoUrl
    } else {
      this.videoElement.src = videoUrl
    }
  }

  _disconnectHandler(reason) {
    console.debug({ reason })
    window.removeEventListener('beforeunload', (...args) =>
      this._hangupHandler(...args)
    )
    window.close()
  }

  _presentationHandler(setting, presenter, uuid) {
    if (setting) {
      this.pexrtc.getPresentation()
    }
  }

  _presentationConnectedHandler(stream) {
    if (typeof MediaStream !== 'undefined' && stream instanceof MediaStream) {
      this.presentationElement.srcObject = stream
    } else {
      this.presentationElement.src = stream
    }
    this.presentationElement.classList.add('active')
    this.presentationElement.classList.remove('secondary')
    this.videoElement.classList.add('secondary')
  }

  _presentationDisconnectedHandler() {
    if (!this.isSharingScreen) {
      this.presentationElement.classList.remove('active')
      this.presentationElement.classList.remove('secondary')
      this.videoElement.classList.remove('secondary')
    }
  }

  _screenshareConnectedHandler(stream) {
    if (typeof MediaStream !== 'undefined' && stream instanceof MediaStream) {
      this.presentationElement.srcObject = stream
    } else {
      this.presentationElement.src = stream
    }
    this.isSharingScreen = true
    this.screenSharingButton.classList.add('selected')
    this.presentationElement.classList.add('active')
    this.presentationElement.classList.add('secondary')
    this.videoElement.classList.remove('secondary')
  }

  _screenshareStoppedHandler(reason) {
    this.isSharingScreen = false
    this.screenSharingButton.classList.remove('selected')
    this.presentationElement.classList.remove('active')
    this.videoElement.classList.remove('secondary')
  }

  attachEvents() {
    window.addEventListener('beforeunload', (...args) =>
      this._hangupHandler(...args)
    )
    this.pexrtc.onSetup = (...args) => this._setupHandler(...args)
    this.pexrtc.onError = (...args) => this._errorHandler(...args)
    this.pexrtc.onConnect = (...args) => this._connectHandler(...args)
    this.pexrtc.onDisconnect = (...args) => this._disconnectHandler(...args)
    this.pexrtc.onPresentation = (...args) => this._presentationHandler(...args)
    this.pexrtc.onPresentationConnected = (...args) =>
      this._presentationConnectedHandler(...args)
    this.pexrtc.onPresentationDisconnected = (...args) =>
      this._presentationDisconnectedHandler(...args)
    this.pexrtc.onScreenshareConnected = (...args) =>
      this._screenshareConnectedHandler(...args)
    this.pexrtc.onScreenshareStopped = (...args) =>
      this._screenshareStoppedHandler(...args)
  }

  makeCall(localMediaStream) {
    this.pexrtc.user_media_stream = localMediaStream
    this.pexrtc.makeCall(
      this.confNode,
      this.confName,
      this.displayName,
      this.bandwidth
    )
    return this
  }

  muteAudio() {
    this.pexrtc.muteAudio(true)
    return this
  }

  muteVideo() {
    this.pexrtc.muteVideo(true)
    return this
  }

  unMuteVideo() {
    this.pexrtc.muteVideo(false)
    return this
  }

  disconnectAll() {
    var participantList = this.pexrtc.getRosterList()
    //this.pexrtc.disconnectAll();
    //DisconnectAll takes a couple of seconds, thats why we disconnect each participant dedicated
    participantList
      .filter((participant) => participant.uuid !== this.pexrtc.uuid)
      .forEach(
        async (participant) =>
          await this.pexrtc.disconnectParticipant(participant.uuid)
      )

    let selectedDeviceId = this.pexrtc.user_media_stream
      .getVideoTracks()[0]
      .getSettings().deviceId

    var senderList = this.pexrtc.call.pc.getSenders()
    var sender = senderList.find(
      (sender) => sender?.track?.getSettings()?.deviceId == selectedDeviceId
    )

    if (sender) {
      sender.track.stop()
    }

    this.pexrtc.disconnect();
    return this
  }

  changeCam(mediaStream) {
    if (window.stream) {
      window.stream.getTracks().forEach((track) => {
        track.stop()
      })
    }
    window.stream = mediaStream

    this.pexrtc.user_media_stream = mediaStream

    this.pexrtc.renegotiate()
  }

  //Set the video to mute for all participants
  onHoldVideo(onHold) {
    let participantList = this.pexrtc.getRosterList()

    //Mute current user video
    this.pexrtc.muteVideo(onHold)

    //Mute other participants video
    if (onHold) {
      participantList.forEach((participant) =>
        this.pexrtc.videoMuted(participant.uuid)
      )
    } else {
      participantList.forEach((participant) =>
        this.pexrtc.videoUnmuted(participant.uuid)
      )
    }
  }

  toggleScreenSharing(screenSharingButton) {
    this.screenSharingButton = screenSharingButton
    if (this.isSharingScreen) {
      this.pexrtc.present(null)
    } else {
      this.pexrtc.present('screen')
    }
    return this
  }
}
