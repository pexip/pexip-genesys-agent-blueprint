import controller from "./notifications-controller.js";
import config from "./config.js?_=20251008T175446";
import { PexRtcWrapper } from "./pexrtc-wrapper.js?_=20251008T175446";

// Obtain a reference to the platformClient object
const platformClient = require("platformClient");
const client = platformClient.ApiClient.instance;

// API instances
const usersApi = new platformClient.UsersApi();
const conversationsApi = new platformClient.ConversationsApi();

let agent = null;

const urlParams = new URLSearchParams(window.location.search);
let conversationId = urlParams.get("pcConversationId");
let confNode = urlParams.get("pexipNode");
let adminPin = urlParams.get("pexipAgentPin");
let conferencePrefix = urlParams.get("pexipAppPrefix");

let genesysRegion = config.genesys.region;
let oauthClientID = config.genesys.oauthClientID;
const redirectUri = window.location.href.split("?")[0];

// Client App
let ClientApp = window.purecloud.apps.ClientApp;
let clientApp = new ClientApp({
  pcEnvironment: genesysRegion,
});

client.setEnvironment(genesysRegion);
client
  .loginImplicitGrant(oauthClientID, redirectUri, {
    state: JSON.stringify({
      conversationId,
      confNode,
      adminPin,
      conferencePrefix,
    }),
  })
  .then((data) => {
    let state = JSON.parse(data.state);

    // Rehydrate state post-login
    conversationId = state.conversationId;
    confNode = state.confNode;
    adminPin = state.adminPin;
    conferencePrefix = state.conferencePrefix;

    return usersApi.getUsersMe();
  })
  .then((currentUser) => {
    agent = currentUser;
    return conversationsApi.getConversation(conversationId);
  })
  .then((conversation) => {
    console.log(
      JSON.parse(JSON.stringify({ "PEX: conversation": conversation }))
    );
    let videoElement = document.getElementById(config.videoElementId);
    let displayName = `Agent: ${agent.name}`;
    let confAlias = conversation.participants?.filter(
      (p) => p.purpose == "customer"
    )[0]?.aniName;

    let initAgent = conversation.participants?.filter(
      (p) => p.purpose == "agent"
    )[0];
    let agentIsConnected = initAgent?.calls[0].state === "connected";
    console.log(`PEX: agentIsConnected: ${agentIsConnected}`);

    console.assert(confAlias, "Unable to determine the conference alias.");

    let prefixedConfAlias = `${conferencePrefix}${confAlias}`;

    let pexrtcWrapper = new PexRtcWrapper(
      videoElement,
      confNode,
      prefixedConfAlias,
      displayName,
      adminPin
    );

    let startVideo = () => {
      pexrtcWrapper.makeCall().muteAudio();
    };

    controller
      .createChannel()
      .then((_) => {
        return controller.addSubscription(
          `v2.users.${agent.id}.conversations.calls`,
          (callEvent) => {
            const disconnectStates = ["disconnected", "terminated"];
            let agentParticipant = callEvent?.eventBody?.participants?.filter(
              (p) => p.purpose == "agent"
            )[0];

            if (
              agentIsConnected !== true &&
              agentParticipant.state === "connected"
            ) {
              agentIsConnected = true;
              startVideo();
            }

            if (
              disconnectStates.includes(agentParticipant.state) &&
              agentParticipant.disconnectType === "transfer"
            ) {
              console.log(
                "Agent is transferring the call. Only disconnecting the agent."
              );
              pexrtcWrapper.pexrtc.disconnect();
            } else if (disconnectStates.includes(agentParticipant.state)) {
              console.log(
                "Agent has ended the call. Disconnecting all conference participants"
              );
              pexrtcWrapper.disconnectAll();
            }

            let mute_state = agentParticipant?.held || false;
            pexrtcWrapper.muteVideo(mute_state);
            if (mute_state === true) {
              videoElement.style["display"] = "none";
            } else {
              videoElement.style["display"] = null;
            }
          }
        );
      })
      .then(() => {
        if (agentIsConnected === true) startVideo();
      });

    clientApp.lifecycle.addStopListener(() => {
      console.log("Application is closing. Cleaning up resources.");
      pexrtcWrapper.disconnectAll();
    }, true);

    return pexrtcWrapper;
  })
  .then((data) => {
    console.log("Finished Setup");
  })
  .catch((e) => console.log(e));
