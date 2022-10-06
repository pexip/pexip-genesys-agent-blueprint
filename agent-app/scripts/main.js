import controller from './notifications-controller.js';
import config from './config.js';
import { PexRtcWrapper } from './pexrtc-wrapper.js';

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
let agent = null;
let confAlias = '';

const urlParams = new URLSearchParams(window.location.search);
conversationId = urlParams.get('conversationid');

const redirectUri = config.environment === 'development' ? config.developmentUri : config.prodUri;

const oauthClientID = config.environment === 'development' ? config.genesys.devOauthClientID : config.genesys.prodOauthClientID;

client.setEnvironment(config.genesys.region);
client.loginImplicitGrant(
  oauthClientID,
  redirectUri,
  { state: conversationId }
)
  .then(data => {
    conversationId = data.state;
    return usersApi.getUsersMe();
  }).then(currentUser => {
    agent = currentUser;
    return conversationsApi.getConversation(conversationId);
  }).then((conversation) => {
    let videoElement = document.getElementById(config.videoElementId);
    let selfviewElement = document.getElementById(config.selfviewElement);
    let confNode = config.pexip.conferenceNode;
    let displayName = `Agent: ${agent.name}`;
    let pin = config.pexip.conferencePin;
    confAlias = conversation.participants?.filter((p) => p.purpose == "customer")[0]?.aniName;

    console.assert(confAlias, "Unable to determine the conference alias.");

    let prefixedConfAlias = `${config.pexip.conferencePrefix}${confAlias}`;

    let pexrtcWrapper = new PexRtcWrapper(videoElement, selfviewElement, confNode, prefixedConfAlias, displayName, pin);
    pexrtcWrapper.makeCall().muteAudio();


    controller.createChannel()
      .then(_ => {

        controller.addSubscription(
          `v2.users.${agent.id}.conversations.calls`,
          (callEvent) => {
            let agentParticipant = callEvent?.eventBody?.participants?.filter((p) => p.purpose == "agent")[0];
            if (agentParticipant?.state === "disconnected") {
              console.log("Agent has ended the call. Disconnecting all conference participants");
              pexrtcWrapper.disconnectAll();
            }

            if (agentParticipant?.held) {
              console.log("Agent has hase set the call on hold. Mute the video");
              pexrtcWrapper.muteVideo();
            }else{
              pexrtcWrapper.unMuteVideo();
            }
            
          });
      });

    return pexrtcWrapper;
  }).then(data => {
    console.log('Finished Setup');

  }).catch(e => console.log(e));
