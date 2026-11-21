// Voice chat uses WebRTC (audio goes directly between the players' devices; Firebase only carries the handshake).
// STUN lets devices find each other across routers. Most home Wi-Fi networks work with STUN alone.
// Some networks (mobile data / CGNAT, strict office Wi-Fi) need a TURN relay. A relay is only used when a direct link
// is impossible, so having one configured costs nothing when it is not needed. Two ways to add one (both optional):
//
// 1) EASIEST — a free Metered "Open Relay" account (20 GB/month free): sign up at https://metered.ca, create an app,
//    open Dashboard -> TURN Server -> "Instructions", and paste the credentials URL here, e.g.
//      export const TURN_CREDENTIALS_URL = 'https://YOURAPP.metered.live/api/v1/turn/credentials?apiKey=YOUR_KEY';
//    The game asks that URL for fresh servers each time voice starts (3 s timeout; if it fails, STUN-only is used).
//
// 2) A fixed server you run or rent (coturn, Cloudflare, ...): add it to TURN_SERVERS below, e.g.
//      { urls: 'turn:YOUR_HOST:3478', username: 'USER', credential: 'PASSWORD' },
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
export const TURN_CREDENTIALS_URL = '';
export const TURN_SERVERS = [];
