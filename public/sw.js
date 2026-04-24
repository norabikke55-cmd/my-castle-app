const CACHE_NAME = 'castle-app-v1';

// インストール時：起動に必要な最低限のファイルをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(['/']);
    })
  );
  self.skipWaiting();
});

// アクティベート時：古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ：ナビゲーションリクエスト（HTMLページ）はキャッシュ優先
// JS/CSSなどのアセットはネットワーク優先→キャッシュにフォールバック
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 外部リクエスト（Firebase, OSM等）はそのまま通す
  if (url.origin !== self.location.origin) {
    return;
  }

  // HTMLナビゲーション：キャッシュ優先（オフライン対応の核心）
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 成功したらキャッシュを更新
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // オフライン時はキャッシュから返す
          return caches.match('/') || caches.match(request);
        })
    );
    return;
  }

  // JS/CSS/画像：ネットワーク優先→キャッシュフォールバック
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
