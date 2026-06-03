// Local dev server — for testing only. Production uses Vercel serverless functions.
// Serves index.html and routes /api/generate to the same handler Vercel uses.
//
//   NVIDIA_API_KEY=nvapi-... node dev-server.js
//   open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const handler = require('./api/generate.js');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/api/generate') {
    return handler(req, res);
  }

  // Static files (only index.html and a couple of safe assets).
  let filePath = url === '/' ? '/index.html' : url;
  const resolved = path.join(ROOT, path.normalize(filePath));
  if (!resolved.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end('Forbidden');
  }
  fs.readFile(resolved, (err, buf) => {
    if (err) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    const ext = path.extname(resolved).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    };
    res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
    res.end(buf);
  });
});

server.listen(PORT, () => {
  console.log(`JEWEL SHOT dev server running at http://localhost:${PORT}`);
  console.log(
    process.env.NVIDIA_API_KEY
      ? 'NVIDIA_API_KEY found in environment (clients will not need to enter a key).'
      : 'No NVIDIA_API_KEY set — enter your key in the app UI.'
  );
});
