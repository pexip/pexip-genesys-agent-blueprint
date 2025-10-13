import controller from "./notifications-controller.js";
import config from "./config.js";
import { PexRtcWrapper } from "./pexrtc-wrapper.js";

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
      (p) => p.userId == agent.id
    )[0];
    console.log(`PEX: initAgent: `, initAgent);
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
      console.log(`PEX: Starting video... ${pexrtcWrapper.displayName}`);
      pexrtcWrapper.makeCall().muteAudio();
    };

    controller
      .createChannel()
      .then((_) => {
        return controller.addSubscription(
          `v2.users.${agent.id}.conversations.calls`,
          (callEvent) => {
            let activeAgentParticipants =
              callEvent?.eventBody?.participants?.filter(
                (p) => p.user?.id === agent.id && p.state === "connected"
              );
            // Sort in reverse chronological order in order to pull the latest
            if (activeAgentParticipants.length > 1) {
              activeAgentParticipants.sort((a, b) => a.endTime > b.endTime);
            }
            console.log(
              `PEX: activeAgentParticipants: ${JSON.stringify(
                activeAgentParticipants
              )}`
            );

            let inactiveAgentParticipants =
              callEvent?.eventBody?.participants?.filter(
                (p) => p.user?.id === agent.id && p.state === "disconnected"
              );
            // Sort in reverse chronological order in order to pull the latest
            if (inactiveAgentParticipants.length > 1) {
              inactiveAgentParticipants.sort((a, b) => a.endTime > b.endTime);
            }
            console.log(
              `PEX: inactiveAgentParticipants: ${JSON.stringify(
                inactiveAgentParticipants
              )}`
            );

            if (
              agentIsConnected !== true &&
              activeAgentParticipants.length > 0 &&
              activeAgentParticipants[0].state === "connected"
            ) {
              agentIsConnected = true;
              startVideo();
            }

            let mute_state = activeAgentParticipants[0]?.held || false;
            pexrtcWrapper.muteVideo(mute_state);
            if (mute_state === true) {
              videoElement.style["display"] = "none";
            } else {
              videoElement.style["display"] = null;
            }

            if (
              activeAgentParticipants.length === 0 &&
              inactiveAgentParticipants.length > 0 &&
              inactiveAgentParticipants[0]?.disconnectType === "transfer"
            ) {
              console.log(
                `PEX: Agent is transferring the call. Only disconnecting the current agent: ${pexrtcWrapper.displayName}.`
              );
              pexrtcWrapper.disconnect();
            } else if (
              activeAgentParticipants.length === 0 &&
              inactiveAgentParticipants.length > 0 &&
              inactiveAgentParticipants[0]?.disconnectType === "client"
            ) {
              if (agentIsConnected === true) {
                console.log(
                  "PEX: Agent has ended the call. Disconnecting all conference participants."
                );
                pexrtcWrapper.disconnectAll();
              } else {
                console.log(
                  `PEX: Agent has declined the call. Only disconnecting the current agent: ${pexrtcWrapper.displayName}.`
                );
                pexrtcWrapper.disconnect();
              }
            }
          }
        );
      })
      .then(() => {
        if (agentIsConnected === true) startVideo();
      });

    clientApp.lifecycle.addStopListener(() => {
      console.log("Application is closing. Cleaning up resources.");
      pexrtcWrapper.disconnect();
    }, true);

    return pexrtcWrapper;
  })
  .then((data) => {
    console.log("Finished Setup");
  })
  .catch((e) => console.log(e));
