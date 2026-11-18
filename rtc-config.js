// Voice chat uses WebRTC (audio goes directly between the players' devices; Firebase only carries the handshake).
// STUN lets devices find each other across routers. Most home Wi-Fi networks work with STUN alone.
// Some networks (mobile data / CGNAT, strict office Wi-Fi) need a TURN relay. If two players cannot hear each other,
// add a TURN server here (for example a free tier from metered.ca or a Cloudflare Calls TURN key):
//   { urls: 'turn:YOUR_HOST:3478', username: 'USER', credential: 'PASSWORD' },
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
