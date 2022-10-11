import controller from './notifications-controller.js';
import config from './config.js';
import { PexRtcWrapper } from './pexrtc-wrapper.js';

loadPexRtc(config.pexip.conferenceNode);

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
let confAlias = '';
var pexrtcWrapper;

const urlParams = new URLSearchParams(window.location.search);
conversationId = urlParams.get('conversationid');
pin = urlParams.get('pin');

const redirectUri = config.environment === 'development' ? config.developmentUri : config.prodUri;

const oauthClientID = config.environment === 'development' ? config.genesys.devOauthClientID : config.genesys.prodOauthClientID;

client.setEnvironment(config.genesys.region);
client.loginImplicitGrant(
  oauthClientID,
  redirectUri,
  //Add conversationId and pin to state to remember after redirect
  { state: JSON.stringify({
    conversationId: conversationId,
    pin: pin
})  }
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
    let videoElement = document.getElementById(config.videoElementId);
    let selfviewElement = document.getElementById(config.selfviewElement);
    let confNode = config.pexip.conferenceNode;
    let displayName = `Agent: ${agent.name}`;
    confAlias = conversation.participants?.filter((p) => p.purpose == "customer")[0]?.aniName;

    console.assert(confAlias, "Unable to determine the conference alias.");

    let prefixedConfAlias = `${config.pexip.conferencePrefix}${confAlias}`;

    pexrtcWrapper = new PexRtcWrapper(videoElement, selfviewElement, confNode, prefixedConfAlias, displayName, pin);
    pexrtcWrapper.makeCall().muteAudio();


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
            //ToDo Mute / Unmute cutomer video on hold
            if (agentParticipant?.held) {
              console.log("Agent has set the call on hold. Mute the agent and the customer video");
              pexrtcWrapper.muteVideo();
            } else {
              pexrtcWrapper.unMuteVideo();
            }

          });
      });



    getVideoDevices().then(videoDevices => {
      let videodeviceSelection = document.getElementById('video-devices-selection');

      //Add video devices to selection
      videoDevices.forEach((device) => {
        const deviceOption = document.createElement("option");

        deviceOption.text = device.label;
        deviceOption.value = device.deviceId;
        videodeviceSelection.add(deviceOption);
      })

      //Add selection listener
      videodeviceSelection.addEventListener('change', (event) => {
        var selectedDeviceId = videodeviceSelection.value;

        //Set getUserMedia constrain for device id 
        var specifiConstrain = {
          video: { deviceId: { exact: selectedDeviceId } }
        };

        navigator.mediaDevices.getUserMedia(specifiConstrain).then(slectedCam => {
          pexrtcWrapper.changeCam(slectedCam);
        });

      });

    });;

    return pexrtcWrapper;
  }).then(data => {
    console.log('Finished Setup');

  }).catch(e => console.log(e));


// An async function to get the video and audio devices
async function getVideoDevices() {

  let constraints = {
    video: true,
    audio: false,
  };

  // Request permission to list devices
  let test = await navigator.mediaDevices.getUserMedia(constraints);
  // Enumerate the devices
  let devices = await navigator.mediaDevices.enumerateDevices();
  // Filter only video devices
  var video_devices = devices.filter((d) => d.kind === 'videoinput');

  // Set the Video Devices so we can show on the UI
  return video_devices;
}

 function loadPexRtc(node){
  var location =  document.getElementsByTagName('head')[0];
  var scriptTag = document.createElement('script');
  scriptTag.src = "https://" + node + "/static/webrtc/js/pexrtc.js";
  location.appendChild(scriptTag);
};

