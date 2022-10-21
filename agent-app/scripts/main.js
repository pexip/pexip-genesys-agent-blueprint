import controller from './notifications-controller.js';
import config from './config.js';
import { PexRtcWrapper } from './pexrtc-wrapper.js';

loadPexRtc(config.pexip.conferenceNode);


//Video elements
const videoElement = document.getElementById(config.videoElementId);
const selfviewElement = document.getElementById(config.selfviewElementId);
const videoPopoutButtonContainer = document.getElementById("video-popout-button-container");

// Obtain a reference to the platformClient object
const platformClient = require('platformClient');
const client = platformClient.ApiClient.instance;

// API instances
const usersApi = new platformClient.UsersApi();
const conversationsApi = new platformClient.ConversationsApi();

// Client App
let ClientApp = window.purecloud.apps.ClientApp;
let clientApp = new ClientApp({
  pcEnvironment: config.genesys.region
});

let conversationId = '';
let pin = '';
let agent = null;

const urlParams = new URLSearchParams(window.location.search);
conversationId = urlParams.get('conversationid');
pin = urlParams.get('pin');

const redirectUri = config.environment === 'development' ? config.developmentUri : config.prodUri;

const oauthClientID = config.environment === 'development' ? config.genesys.devOauthClientID : config.genesys.prodOauthClientID;

let pexrtcWrapper;

document.getElementById(config.videoElementId).onclick = togglePresentationRemoteVideo;
document.getElementById(config.presentationElementId).onclick = togglePresentationRemoteVideo;

//Draggable feature for selfview
var selfviewContainer = $('#pexip-self-view-container');
var dragzone = $('#dragzone');



conPercent();

$(selfviewContainer).draggable({
  containment: dragzone, scroll: false,
  stop: function () {
    selfviewContainer.removeClass("upper-right-corner");
    conPercent();
    console.log(parseInt($(this).css("bottom")) / (dragzone.width() / 100) + "%");
    console.log(parseInt($(this).css("right")) / (dragzone.height() / 100) + "%");
  }
});


$(document).mouseleave(function () {
  conPercent();
});

function conPercent() {

  var containerWidth = parseInt(dragzone.innerWidth());

  var selfViewLeft = parseInt(selfviewContainer.css("left"));
  selfviewContainer.css('left', '');

  var selfViewWidth = parseInt(selfviewContainer.css("width"));

  var containerHeight = parseInt(dragzone.innerHeight());

  var slefViewTop = parseInt(selfviewContainer.css("top"));
  selfviewContainer.css('top', '');

  var selfViewHeigth = parseInt(selfviewContainer.css("height"));

  selfviewContainer.css("right", '');
  selfviewContainer.css("bottom", '');

  if ((selfViewLeft + (selfViewWidth / 2)) > containerWidth / 2) {

    var selfViewRight = selfViewLeft + selfViewWidth;

    var brightGap = containerWidth - selfViewRight;

    var oLPer = (brightGap / containerWidth) * 100;
    oLPer += "%";
    selfviewContainer.css("right", oLPer);

  } else {
    var oLPer = (selfViewLeft / containerWidth) * 100;
    oLPer += "%";
    selfviewContainer.css("left", oLPer);
  }


  if ((slefViewTop + (selfViewHeigth / 2)) > containerHeight / 2) {
    var selfviewBottom = slefViewTop + selfViewHeigth;

    var bottomGap = containerHeight - selfviewBottom;

    var oHPer = (bottomGap / containerHeight) * 100;
    oHPer += "%";
    selfviewContainer.css("bottom", oHPer);


    console.log("left percent: " + oLPer);
    console.log("top percent: " + oHPer);

  } else {
    var oHPer = (slefViewTop / containerHeight) * 100;
    oHPer += "%";
    selfviewContainer.css("top", oHPer);
  }

}




/*  // Watch for resize
$(window).resize(function() {       
  $( "#pexip-self-view-container" ).draggable({containment: "#dragzone", scroll: false});
}); */

client.setEnvironment(config.genesys.region);
client.loginImplicitGrant(
  oauthClientID,
  redirectUri,
  //Add conversationId and pin to state to remember after redirect
  {
    state: JSON.stringify({
      conversationId: conversationId,
      pin: pin
    })
  }
)
  .then(data => {
    //Read conversationId and pin from state
    let stateData = JSON.parse(data.state);
    conversationId = stateData.conversationId;
    pin = stateData.pin;
    return usersApi.getUsersMe();
  }).then(currentUser => {
    agent = currentUser;
    return conversationsApi.getConversation(conversationId);
  }).then((conversation) => {


    const presentationElement = document.getElementById(config.presentationElementId);
    const toolbar = document.getElementById('toolbar');
    const confNode = config.pexip.conferenceNode;
    const displayName = `Agent: ${agent.name}`;
    const confAlias = conversation.participants?.filter((p) => p.purpose == "customer")[0]?.aniName;

    console.assert(confAlias, "Unable to determine the conference alias.");


    const prefixedConfAlias = `${config.pexip.conferencePrefix}${confAlias}`;


    pexrtcWrapper = new PexRtcWrapper(
      videoElement,
      selfviewElement,
      presentationElement,
      toolbar,
      confNode,
      prefixedConfAlias,
      displayName,
      pin
    );
    
    getLocalMediaStream().then( (localMediaStream) => {
      pexrtcWrapper.makeCall(localMediaStream);
    });

    controller.createChannel()
      .then(_ => {

        controller.addSubscription(
          `v2.users.${agent.id}.conversations.calls`,
          (callEvent) => {
            let agentParticipant = callEvent?.eventBody?.participants?.filter((p) => p.purpose == "agent")[0];

            //Disconnected event
            if (agentParticipant?.state === "disconnected") {
              console.log("Agent has ended the call. Disconnecting all conference participants");
              pexrtcWrapper.disconnectAll();
            }

            //Hold event
            console.log("Agent has set the call on hold. Mute the agent and the customer video");
            pexrtcWrapper.onHoldVideo(agentParticipant?.held);

          });
      });



    getVideoDevices().then(videoDevices => {

      const videoDeviceSelection = document.getElementById('video-devices-selection');

      const selectedDeviceId = localStorage.getItem('settings.cameraDeviceId');

      //Add video devices to selection
      videoDevices.forEach((device) => {

        const deviceOption = document.createElement("option");
        deviceOption.text = device.label;
        deviceOption.value = device.deviceId;
        deviceOption.selected = device.deviceId === selectedDeviceId ? true : false;

        videoDeviceSelection.add(deviceOption);
      })

      videoDeviceSelection.onchange = () => {
        const selectedDeviceId = videoDeviceSelection.value;

        //Set getUserMedia constrain for device id 
        const constraints = {
          video: { deviceId: { exact: selectedDeviceId } }
        };

        navigator.mediaDevices.getUserMedia(constraints).then(mediaStream => {
          console.log('Change camera');
          pexrtcWrapper.changeCam(mediaStream);
          localStorage.setItem('settings.cameraDeviceId', selectedDeviceId);
        });

      }

    });;

    return pexrtcWrapper;
  }).then(data => {
    console.log('Finished Setup');

  }).catch(e => console.log(e));


// An async function to get the video and audio devices
async function getVideoDevices() {

  const constraints = {
    video: true,
    audio: false,
  };

  // Request permission to list devices
  await navigator.mediaDevices.getUserMedia(constraints);
  // Enumerate the devices
  const devices = await navigator.mediaDevices.enumerateDevices();
  // Filter only video devices
  const video_devices = devices.filter((d) => d.kind === 'videoinput');

  // Set the Video Devices so we can show on the UI
  return video_devices;
}

async function getLocalMediaStream() {
  const videoDevices = await getVideoDevices();
  const selectedDeviceId = localStorage.getItem('settings.cameraDeviceId');
  let device = videoDevices.find( (device) => device.deviceId === selectedDeviceId);
  if (!device) {
    device = videoDevices[0];
  }
  //Set getUserMedia constrain for device id 
  const constraints = {
    video: { deviceId: { exact: device.deviceId } }
  };
  const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
  return mediaStream;
}


function togglePresentationRemoteVideo(event) {
  event.target.classList.remove('secondary');
  if (event.target.id == config.videoElementId) {
    document.getElementById(config.presentationElementId).classList.add('secondary');
  } else {
    document.getElementById(config.videoElementId).classList.add('secondary');
  }
}

function loadPexRtc(node) {
  var location = document.getElementsByTagName('head')[0];
  var scriptTag = document.createElement('script');
  scriptTag.src = "https://" + node + "/static/webrtc/js/pexrtc.js";
  location.appendChild(scriptTag);
};

function toggleScreenSharing(buttonContainer) {
  pexrtcWrapper.toggleScreenSharing(buttonContainer);
}

function toggleLockRoom(buttonContainer) {
  pexrtcWrapper.toggleLockRoom(buttonContainer);
}

function toggleButtonDialog(buttonContainer) {
  buttonContainer.classList.toggle('selected');
}

//Popout feature for main video 
function toggleVideoPopOut() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture();
  } else if (document.pictureInPictureEnabled) {
    videoElement.requestPictureInPicture();
    videoPopoutButtonContainer.classList.add('selected')
  }
}

videoElement.hidden = !document.pictureInPictureEnabled || videoElement.disablePictureInPicture;
videoElement.addEventListener('leavepictureinpicture', (event) => {videoPopoutButtonContainer.classList.remove('selected')});

window.toggleScreenSharing = toggleScreenSharing;
window.toggleLockRoom = toggleLockRoom;
window.toggleButtonDialog = toggleButtonDialog;
window.toggleVideoPopOut = toggleVideoPopOut;