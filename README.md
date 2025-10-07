# Sora 2 Quickstart

This project contains a minimal Express proxy server and a static web interface for trying the
Sora 2 video generation API. The server forwards requests to the `/v1/videos` endpoints (or a
local mock runner) and serves the client application.

## Prerequisites

- Node.js 18+
- npm

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example environment file and update it with your own values:

   ```bash
   cp server/.env.example server/.env
   ```

   - Set `SORA_API_KEY` to your OpenAI API key that has access to Sora 2.
   - Set `MOCK_MODE` to `true` to use the in-memory simulator (no API calls) or `false` to proxy
     requests to the real API.
   - Adjust `PORT` if you want the Express server to listen on a different port.

3. Start the development server:

   ```bash
   npm run dev
   ```

   The Express proxy will be available at <http://localhost:3000>. The static client is served from
   the same origin.

## Available scripts

- `npm run dev` – start the Express server in watch mode with `tsx`.
- `npm run build` – compile the TypeScript source into the `dist/` directory.
- `npm start` – run the compiled JavaScript from `dist/`.

## How it works

- The Express server (see `server/server.ts`) exposes `/api/generate`, `/api/jobs/:id` (GET), and
  `/api/jobs/:id` (DELETE). In live mode these routes forward to the Sora 2 `/v1/videos` endpoints
  using your API key. In mock mode they simulate progress and completion in memory.
- The web client (see `web/index.html` and `web/app.js`) provides a form to submit prompts,
  configure duration/aspect ratio or custom resolution, poll job status, display the resulting video
  URL, and cancel running jobs.
