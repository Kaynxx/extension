# Manga / webtoon P5 MVP

Manga processing is an independent static-image pipeline and is off by default
(`mangaEnabled: false`). The popup toggle is explicit opt-in. It observes only
eligible `<img>` elements lazily with `IntersectionObserver`; video, canvas,
audio and common animated sources are rejected. Processing draws a tiled,
non-generative canvas overlay, leaving the original image element and its
source untouched. `stop()` or `restore()` removes the overlay and immediately
returns the page to its original rendering.

The extension currently keeps the existing minimal `storage` permission and
YouTube content-script match. It deliberately does **not** add `<all_urls>` or
host permissions: the P5 module can be unit-tested and used on the already
supported content-script surface without broadening access. A future arbitrary
site rollout must request optional host access at runtime using
`chrome.permissions.request({ origins: ["https://site.example/*"] })`, explain
the origin to the user, and only construct `MangaImagePipeline` after the
request resolves. No production path should silently process arbitrary sites.
