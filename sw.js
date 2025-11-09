// Service Worker (sw.js)
// このファイルはオフライン対応とアセットのキャッシュを行います。

const CACHE_NAME = 'stretch-kintore-cache-v1';

// インストール時にキャッシュするアセットのリスト
const urlsToCache = [
  '/', // アプリのメインページ (index.html)
  'manifest.json', // Web App Manifest
  'stretch.png', // アプリアイコン
  'https://cdn.tailwindcss.com', // Tailwind CSS
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap', // Google Fonts
  // Firebase SDK (バージョンを固定)
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'
];

// 1. インストールイベント
// Service Workerがインストールされるときに、アセットをキャッシュします。
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // 指定されたアセットをすべてキャッシュに追加
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.error('Cache install failed:', err);
      })
  );
});

// 2. アクティベートイベント
// 古いキャッシュを削除します。
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME]; // 保持するキャッシュ名
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // ホワイトリストに含まれていない古いキャッシュを削除
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. フェッチイベント
// ネットワークリクエストをインターセプトし、キャッシュ戦略を適用します。
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);

  // (A) Firebase Firestoreへのリクエストは常にネットワーク（キャッシュしない）
  if (requestUrl.hostname === 'firestore.googleapis.com') {
    return event.respondWith(fetch(event.request));
  }
  
  // (B) Google Fonts (API とフォントファイル) は Stale-While-Revalidate
  //     キャッシュから返しつつ、バックグラウンドで新しいバージョンを取得しにいく
  if (requestUrl.hostname === 'fonts.googleapis.com' || requestUrl.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          // ネットワークリクエストを非同期で実行
          const fetchPromise = fetch(event.request).then(networkResponse => {
            // ネットワークから取得したレスポンスをキャッシュに保存
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
          // キャッシュがあればそれを返し、なければネットワークの結果を待つ
          return response || fetchPromise;
        });
      })
    );
    return;
  }

  // (C) その他のリクエスト (アプリ本体やCDNアセット) はキャッシュファースト
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // キャッシュにヒットしたら、それを返す
        if (response) {
          return response;
        }
        // キャッシュになければ、ネットワークに取りに行く
        return fetch(event.request);
      })
  );
});
