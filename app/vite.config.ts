import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

/** serve ../audio/* at /media/* (streamed with Range support, kept out of the bundle) */
const media = (): Plugin => ({
  name: 'tahimik-media',
  configureServer(server) {
    server.middlewares.use('/media', (req, res, next) => {
      const file = join(root, 'audio', decodeURIComponent((req.url ?? '').split('?')[0]));
      if (!file.startsWith(join(root, 'audio')) || !existsSync(file)) return next();
      const size = statSync(file).size;
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'audio/mpeg');
      if (m) {
        const a = Number(m[1]), b = m[2] ? Number(m[2]) : size - 1;
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${a}-${b}/${size}`);
        res.setHeader('Content-Length', b - a + 1);
        createReadStream(file, { start: a, end: b }).pipe(res);
      } else {
        res.setHeader('Content-Length', size);
        createReadStream(file).pipe(res);
      }
    });
  },
});

export default defineConfig({
  plugins: [media()],
  server: { port: 5173, fs: { allow: [root] } },
  clearScreen: false,
});
