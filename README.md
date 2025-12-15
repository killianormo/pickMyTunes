# random-album
A webapp to choose a random selection of your saved albums on your streaming service


APP ARCHITECTURE:

  Browser (PickMyTunes)
          ↓
  Cloudflare Worker (API)
          ↓
  Spotify / TIDAL APIs
          ↓
  Cloudflare KV (cached albums)
