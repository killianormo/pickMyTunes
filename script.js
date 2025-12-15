/* ------------------------------------------------------------
   CONFIG
------------------------------------------------------------ */
const spotifyClientId = "a92e23077bdb4eed8e9f6e3e8b35b374";
const tidalClientId   = "FmWv0A27XqBaqknR";
const redirectUri     = "https://killianormo.github.io/pickMyTunes/";
const albumCountToPick = 3;


/* ------------------------------------------------------------
   PKCE HELPERS (Spotify)
------------------------------------------------------------ */
async function generateCodeVerifier(length = 64) {
    let text = "";
    let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
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


/* ------------------------------------------------------------
   SOURCE SELECTION
------------------------------------------------------------ */
let selectedSource = localStorage.getItem("musicSource");

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


/* ------------------------------------------------------------
   LOGIN FLOWS
------------------------------------------------------------ */
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

    window.location = "https://accounts.spotify.com/authorize?" + params.toString();
}

function loginTidal() {
    const params = new URLSearchParams({
        client_id: tidalClientId,
        response_type: "code",
        redirect_uri: redirectUri,
        scope: "r_usr+w_usr"
    });

    window.location = "https://login.tidal.com/authorize?" + params.toString();
}


/* ------------------------------------------------------------
   TOKEN EXCHANGE
------------------------------------------------------------ */
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
    const body = new URLSearchParams({
        client_id: tidalClientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
    });

    const res = await fetch("https://auth.tidal.com/v1/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body
    });

    return res.json();
}

/* ------------------------------------------------------------
   LOADING DOT ANIMATION
------------------------------------------------------------ */
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


/* ------------------------------------------------------------
   FETCH & NORMALIZE ALBUMS
------------------------------------------------------------ */

/* Spotify */
async function fetchSpotifyAlbums(token) {
    let albums = [];
    let url = "https://api.spotify.com/v1/me/albums?limit=50";

    while (url) {
        const res = await fetch(url, {
            headers: { Authorization: "Bearer " + token }
        });
        const data = await res.json();
        albums = albums.concat(data.items);
        url = data.next;
    }

    return albums.map(item => ({
        title: item.album.name,
        artist: item.album.artists.map(a => a.name).join(", "),
        image: item.album.images[0]?.url,
        link: item.album.external_urls.spotify
    }));
}

/* Tidal */
async function fetchTidalAlbums(token) {
    const res = await fetch("https://api.tidal.com/v1/users/me/albums", {
        headers: { Authorization: "Bearer " + token }
    });

    const data = await res.json();

    return data.items.map(item => ({
        title: item.album.title,
        artist: item.album.artist.name,
        image: item.album.cover
            ? `https://resources.tidal.com/images/${item.album.cover.replace(/-/g, "/")}/640x640.jpg`
            : "",
        link: item.album.url
    }));
}


/* ------------------------------------------------------------
   RANDOM PICK
------------------------------------------------------------ */
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


/* ------------------------------------------------------------
   DISPLAY
------------------------------------------------------------ */
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

    const pickMoreBtn = document.getElementById("pickMoreBtn");
    if (pickMoreBtn) {
        pickMoreBtn.textContent = `Pick ${albumCountToPick} More!`;
        pickMoreBtn.style.display = "inline-block";
    }
}


/* ------------------------------------------------------------
   LOADING UI
------------------------------------------------------------ */
function showLoading() {
    const tile = document.getElementById("loadingTile");
    if (tile) tile.style.display = "block";
    startLoadingAnimation();
}

function hideLoading() {
    const tile = document.getElementById("loadingTile");
    if (tile) tile.style.display = "none";
    stopLoadingAnimation();
}

/* ------------------------------------------------------------
   INIT
------------------------------------------------------------ */
let cachedAlbums = [];

function handleSourceVisibility() {
    const sourceSelector = document.getElementById("sourceSelector");
    if (!sourceSelector) return;

    const params = new URLSearchParams(window.location.search);
    const hasCode = params.has("code");
    const source = localStorage.getItem("musicSource");

    // Show ONLY on true home page
    if (!hasCode && !source) {
        sourceSelector.style.display = "block";
    } else {
        sourceSelector.style.display = "none";
    }
}

async function init() {
    handleSourceVisibility();

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const source = localStorage.getItem("musicSource");

    if (!code || !source) return;

    showLoading();

    if (source === "spotify") {
        const token = await exchangeSpotifyToken(code);
        cachedAlbums = await fetchSpotifyAlbums(token.access_token);
    }

    if (source === "tidal") {
        const token = await exchangeTidalToken(code);
        cachedAlbums = await fetchTidalAlbums(token.access_token);
    }

    hideLoading();

    const picked = pickRandomAlbums(cachedAlbums, albumCountToPick);
    displayAlbums(picked);
}

init();


/* ------------------------------------------------------------
   PICK MORE
------------------------------------------------------------ */
const pickMoreBtn = document.getElementById("pickMoreBtn");
if (pickMoreBtn) {
    pickMoreBtn.onclick = () => {
        const picked = pickRandomAlbums(cachedAlbums, albumCountToPick);
        displayAlbums(picked);
    };
}


/* ------------------------------------------------------------
   HEADER SCROLL LOGIC
------------------------------------------------------------ */
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
