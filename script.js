/* ------------------------------------------------------------
   CONFIG
------------------------------------------------------------ */
const clientId = "a92e23077bdb4eed8e9f6e3e8b35b374";  // <-- Replace this!
const redirectUri = window.location.origin + window.location.pathname;
const albumCountToPick = 3;

/* ------------------------------------------------------------
   PKCE HELPERS
------------------------------------------------------------ */
async function generateCodeVerifier(length = 64) {
  let text = "";
  let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  for (let i = 0; i < length; i++) text += possible.charAt(Math.random() * possible.length | 0);
  return text;
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/* ------------------------------------------------------------
   LOGIN
------------------------------------------------------------ */
async function login() {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  localStorage.setItem("verifier", verifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: "user-library-read"
  });

  window.location = "https://accounts.spotify.com/authorize?" + params.toString();
}

/* ------------------------------------------------------------
   TOKEN EXCHANGE
------------------------------------------------------------ */
async function getAccessToken(code) {
  const verifier = localStorage.getItem("verifier");

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  return response.json();
}

/* ------------------------------------------------------------
   FETCH SAVED ALBUMS
------------------------------------------------------------ */
async function fetchSavedAlbums(accessToken) {
  let albums = [];
  let url = "https://api.spotify.com/v1/me/albums?limit=50";

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: "Bearer " + accessToken }
    });

    const data = await response.json();
    albums = albums.concat(data.items);
    url = data.next;
  }

  return albums;
}

/* ------------------------------------------------------------
   RANDOM SELECTION
------------------------------------------------------------ */
function pickRandomAlbums(list, count) {
  let arr = [...list];
  let chosen = [];

  for (let i = 0; i < count; i++) {
    let index = Math.floor(Math.random() * arr.length);
    chosen.push(arr[index]);
    arr.splice(index, 1); // no duplicates
  }

  return chosen;
}

/* ------------------------------------------------------------
   DISPLAY RESULTS
------------------------------------------------------------ */
function displayAlbums(list) {
  const div = document.getElementById("results");
  div.innerHTML = "";

  list.forEach(item => {
    const alb = item.album;

    div.innerHTML += `
      <div class="album">
        <img src="${alb.images[0].url}">
        <h3>${alb.name}</h3>
        <p>${alb.artists.map(a => a.name).join(", ")}</p>
        <a href="${alb.external_urls.spotify}" target="_blank">Open in Spotify</a>
      </div>
    `;
  });
}

/* ------------------------------------------------------------
   INIT
------------------------------------------------------------ */
document.getElementById("loginBtn").onclick = login;

let accessToken = null;
let savedAlbums = [];

async function init() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");

  if (code) {
    document.getElementById("loginBtn").style.display = "none";

    const tokenData = await getAccessToken(code);
    accessToken = tokenData.access_token;

    savedAlbums = await fetchSavedAlbums(accessToken);

    document.getElementById("pickBtn").style.display = "inline-block";
  }
}

document.getElementById("pickBtn").onclick = () => {
  const selected = pickRandomAlbums(savedAlbums, albumCountToPick);
  displayAlbums(selected);
};

init();
