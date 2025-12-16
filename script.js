/* ============================================================
   GLOBAL STATE
============================================================ */
let accessToken = null;
let spotifyUserId = null;
let cachedAlbums = [];

/* ============================================================
   CONFIG
============================================================ */
const spotifyClientId = "a92e23077bdb4eed8e9f6e3e8b35b374";
const tidalClientId   = "FmWv0A27XqBaqknR";
const redirectUri     = "https://killianormo.github.io/pickMyTunes/";
const albumCountToPick = 3;

// 🔁 Cloudflare Worker base URL
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
const spotifyTile = document.getElementById("spotifySource");
const tidalTile   = document.getElementById("tidalSource");

if (spotifyTile) {
  spotifyTile.onclick = () => {
    localStorage.setItem("musicSource", "spotify");
    loginSpotify();
  };
}

if (tidalTile) {
  tidalTile.onclick = () => {
    localStorage.setItem("musicSource", "tidal");
    loginTidal();
  };
}

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
    code_verifier: verifier
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
   SPOTIFY USER ID
============================================================ */
async function getSpotifyUserId(token) {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Spotify /me failed:", err);
    throw new Error("Failed to fetch Spotify user ID");
  }

  const data = await res.json();
  return data.id;
}

/* ============================================================
   LOADING ANIMATION
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
  if (loadingInterval) {
    clearInterval(loadingInterval);
    loadingInterval = null;
  }
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

async function syncSpotifyToBackend(token, userId) {
  const res = await fetch(`${BACKEND_BASE}/sync/spotify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessToken: token,
      userId
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Spotify backend sync failed:", err);
    return false;
  }

  return true;
}

/* ============================================================
   RANDOM PICK
============================================================ */
function pickRandomAlbums(list, count) {
  let pool = [...list];
  let chosen = [];

  for (let i = 0; i < count && pool.length; i++) {
    const index = Math.floor(Math.random() * pool.length);
    chosen.push(pool[index]);
    pool.splice(index, 1);
  }

  return chosen;
}

/* ============================================================
   DISPLAY
============================================================ */
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

  const btn = document.getElementById("pickMoreBtn");
  if (btn) {
    btn.textContent = `Pick ${albumCountToPick} More!`;
    btn.style.display = "inline-block";
  }
}

/* ============================================================
   LOADING UI
============================================================ */
function showLoading() {
  document.getElementById("sourceSelector")?.style.setProperty("display", "none");
  document.getElementById("loadingTile")?.style.setProperty("display", "block");
  startLoadingAnimation();
}

function hideLoading() {
  document.getElementById("loadingTile")?.style.setProperty("display", "none");
  stopLoadingAnimation();
}

/* ============================================================
   INIT
============================================================ */
async function init() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get("code");
  const source = localStorage.getItem("musicSource");

  if (!code || !source) return;

  showLoading();

  if (source === "spotify") {
    const tokenData = await exchangeSpotifyToken(code);
    accessToken = tokenData.access_token;

    spotifyUserId = await getSpotifyUserId(accessToken);

    // Try cache first
    cachedAlbums =
      await loadAlbumsFromBackend("spotify", spotifyUserId);

    // If empty, sync then reload
    if (!cachedAlbums.length) {
      await syncSpotifyToBackend(accessToken, spotifyUserId);
      cachedAlbums =
        await loadAlbumsFromBackend("spotify", spotifyUserId);
    }
  }

  // (TIDAL left frontend-only for now)

  hideLoading();

  const picked = pickRandomAlbums(cachedAlbums, albumCountToPick);
  displayAlbums(picked);
}

init();

/* ============================================================
   PICK MORE
============================================================ */
document.getElementById("pickMoreBtn")?.addEventListener("click", () => {
  const picked = pickRandomAlbums(cachedAlbums, albumCountToPick);
  displayAlbums(picked);
});

/* ============================================================
   HEADER SCROLL EFFECT
============================================================ */
const header = document.querySelector(".app-header");

if (header) {
  let lastScroll = 0;
  window.addEventListener("scroll", () => {
    const current = window.scrollY;
    header.classList.toggle("shrink", current > 20);
    header.classList.toggle("scrolled-up", current < lastScroll);
    lastScroll = current;
  });
}
