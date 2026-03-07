// Service worker for Web Share Target API
// Intercepts shared audio files and caches them for the app to pick up

const CACHE_NAME = 'share-target';
const CACHE_KEY = '/shared-audio';

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }
});

async function handleShareTarget(request) {
  const formData = await request.formData();
  const audioFile = formData.get('audio');

  if (audioFile) {
    const cache = await caches.open(CACHE_NAME);
    // Store the file as a Response so it can be retrieved later
    const response = new Response(audioFile, {
      headers: {
        'Content-Type': audioFile.type || 'audio/mp4',
        'X-File-Name': audioFile.name || 'shared-audio',
      },
    });
    await cache.put(CACHE_KEY, response);
  }

  return Response.redirect('/?share=1', 303);
}
