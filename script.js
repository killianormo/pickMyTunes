/* ============================================================
   GLOBAL STATE
============================================================ */
let accessToken = null;
let spotifyUserId = null;
let tidalUserId = null;
let cachedAlbums = [];

/* ============================================================
   CONFIG
============================================================ */
const spotifyClientId = "a92e23077bdb4eed8e9f6e3e8b35b374";
const tidalClientId   = "FmWv0A27XqBaqknR";
const redirectUri     = "https://killianormo.github.io/pickMyTunes/";
const albumCountToPick = 3;

const BACKEND_BASE =
  "https://pickmytunes-backend.killianormond.workers.dev";

/* ============================================================
   PKCE HELPERS
============================================================ */
async function generateCodeVerifier(length = 64) {
  let text = "";
  let possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.random() * possible.length | 0);
  }
  return text;
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* ============================================================
   SOURCE SELECTION
============================================================ */
document.getElementById("spotifySource")?.addEventListener("click", () => {
  localStorage.setItem("musicSource", "spotify");
  loginSpotify();
});

document.getElementById("tidalSource")?.addEventListener("click", () => {
  localStorage.setItem("musicSource", "tidal");
  loginTidal();
});

/* ============================================================
   LOGIN FLOWS
============================================================ */
async function loginSpotify() {
  const verifier  = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem("verifier", verifier);

  const params = new URLSearchParams({
    client_id: spotifyClientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: "user-library-read"
  });

  window.location =
    "https://accounts.spotify.com/authorize?" + params.toString();
}

async function loginTidal() {
  const verifier  = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem("tidal_verifier", verifier);

  const params = new URLSearchParams({
    client_id: tidalClientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: "collection.read collection.write"
  });

  window.location =
    "https://login.tidal.com/authorize?" + params.toString();
}

/* ============================================================
   TOKEN EXCHANGE
============================================================ */
async function exchangeSpotifyToken(code) {
  const verifier = localStorage.getItem("verifier");

  const body = new URLSearchParams({
    client_id: spotifyClientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  return res.json();
}

async function exchangeTidalToken(code) {
  const verifier = localStorage.getItem("tidal_verifier");

  const body = new URLSearchParams({
    client_id: tidalClientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
    resource: "https://openapi.tidal.com/"
  });

  const res = await fetch(
    "https://auth.tidal.com/v1/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }
  );

  return res.json();
}

/* ============================================================
   LOADING
============================================================ */
let loadingInterval = null;

function startLoadingAnimation() {
  const dots = document.getElementById("loadingDots");
  if (!dots) return;

  let count = 1;
  loadingInterval = setInterval(() => {
    dots.textContent = ".".repeat(count);
    count = count === 3 ? 1 : count + 1;
  }, 500);
}

function stopLoadingAnimation() {
  clearInterval(loadingInterval);
}

/* ============================================================
   BACKEND HELPERS
============================================================ */
async function loadAlbumsFromBackend(provider, userId) {
  const res = await fetch(
    `${BACKEND_BASE}/albums?provider=${provider}&userId=${userId}`
  );
  const data = await res.json();
  return data.albums || [];
}

/* ============================================================
   INIT
============================================================ */
async function init() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get("code");
  const source = localStorage.getItem("musicSource");

  if (!code) {
    document.getElementById("sourceSelector")?.style.setProperty("display", "block");
    document.getElementById("loadingTile")?.style.setProperty("display", "none");
    return;
  }

  document.getElementById("sourceSelector")?.style.setProperty("display", "none");
  document.getElementById("loadingTile")?.style.setProperty("display", "block");
  startLoadingAnimation();

  if (source === "spotify") {
    const tokenData = await exchangeSpotifyToken(code);
    accessToken = tokenData.access_token;

    const me = await fetch("https://api.spotify.com/v1/me", {
      headers: { Authorization: "Bearer " + accessToken }
    }).then(r => r.json());

    spotifyUserId = me.id;

    cachedAlbums = await loadAlbumsFromBackend("spotify", spotifyUserId);

    if (!cachedAlbums.length) {
      await fetch(`${BACKEND_BASE}/sync/spotify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, userId: spotifyUserId })
      });

      cachedAlbums = await loadAlbumsFromBackend("spotify", spotifyUserId);
    }
  }

  if (source === "tidal") {
    const tokenData = await exchangeTidalToken(code);
    accessToken = tokenData.access_token;

    const syncRes = await fetch(`${BACKEND_BASE}/sync/tidal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken })
    }).then(r => r.json());

    tidalUserId = syncRes.userId;

    cachedAlbums = await loadAlbumsFromBackend("tidal", tidalUserId);
  }

  stopLoadingAnimation();
  document.getElementById("loadingTile")?.style.setProperty("display", "none");

  displayAlbums(pickRandomAlbums(cachedAlbums, albumCountToPick));
}

init();

/* ============================================================
   DISPLAY
============================================================ */
function pickRandomAlbums(list, count) {
  const pool = [...list];
  const chosen = [];
  for (let i = 0; i < count && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(idx, 1)[0]);
  }
  return chosen;
}

function displayAlbums(list) {
  const results = document.getElementById("results");
  results.innerHTML = "";

  list.forEach(alb => {
    results.innerHTML += `
      <div class="album">
        <img src="${alb.image}">
        <h3>${alb.title}</h3>
        <p>${alb.artist}</p>
        <a href="${alb.link}" target="_blank">Open</a>
      </div>
    `;
  });

  document.getElementById("pickMoreBtn").style.display = "inline-block";
}

/* ============================================================
   PICK MORE
============================================================ */
document.getElementById("pickMoreBtn")?.addEventListener("click", () => {
  displayAlbums(pickRandomAlbums(cachedAlbums, albumCountToPick));
  pickMoreBtn.textContent = `Pick ${albumCountToPick} More!`;
});

/* ============================================================
   HOME RESET
============================================================ */
document.querySelector(".header-home")?.addEventListener("click", () => {
  localStorage.removeItem("musicSource");
});
