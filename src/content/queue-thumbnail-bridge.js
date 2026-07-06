/* global document, MutationObserver, window */

(function () {
  if (window.__ytmEnhancerQueueThumbnailBridge) return;
  window.__ytmEnhancerQueueThumbnailBridge = true;

  var THUMBNAIL_ATTRIBUTE = "data-ytm-enhancer-thumbnail-url";
  var scheduled = false;

  function thumbnailUrls(value) {
    var thumbnails =
      value && value.thumbnail && Array.isArray(value.thumbnail.thumbnails)
        ? value.thumbnail.thumbnails
        : [];
    var urls = [];
    for (var index = 0; index < thumbnails.length; index += 1) {
      var url = thumbnails[index] && thumbnails[index].url;
      if (typeof url === "string" && url.trim()) {
        urls.push(url);
      }
    }
    return urls;
  }

  function queueItemArtworkUrl(item) {
    var candidates = [
      thumbnailUrls(item.data),
      thumbnailUrls(item.__data && item.__data.data),
      thumbnailUrls(
        item.__dataHost &&
          item.__dataHost.__data &&
          item.__dataHost.__data.data,
      ),
      thumbnailUrls(item.__dataHost && item.__dataHost.data),
    ];

    for (var index = 0; index < candidates.length; index += 1) {
      var urls = candidates[index];
      if (urls.length > 0) {
        return urls[urls.length - 1];
      }
    }
    return null;
  }

  function annotateQueueItems() {
    scheduled = false;
    var items = document.querySelectorAll("ytmusic-player-queue-item");
    for (var index = 0; index < items.length; index += 1) {
      var item = items[index];
      var artworkUrl = queueItemArtworkUrl(item);
      if (artworkUrl) {
        item.setAttribute(THUMBNAIL_ATTRIBUTE, artworkUrl);
      } else {
        item.removeAttribute(THUMBNAIL_ATTRIBUTE);
      }
    }
  }

  function scheduleAnnotation() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(annotateQueueItems);
  }

  var observer = new MutationObserver(scheduleAnnotation);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["play-button-state", "selected", "src"],
  });

  annotateQueueItems();
  window.setInterval(annotateQueueItems, 1000);
})();
