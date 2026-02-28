(function () {
  if (window.__ytmEnhancerQualityBridge) return;
  window.__ytmEnhancerQualityBridge = true;

  var SETTING_CLIENT_ID = "MUSIC_WEB_AUDIO_QUALITY";
  var ready = false;
  var pendingCommands = [];

  function findQualityRenderer() {
    var renderers = document.querySelectorAll(
      "ytmusic-setting-single-option-menu-renderer",
    );
    for (var i = 0; i < renderers.length; i++) {
      if (renderers[i].data && renderers[i].data.itemId === SETTING_CLIENT_ID) {
        return renderers[i];
      }
    }
    return null;
  }

  function getCurrentQuality() {
    var renderer = findQualityRenderer();
    if (!renderer || !renderer.data || !renderer.data.items) return null;

    var items = renderer.data.items;
    for (var i = 0; i < items.length; i++) {
      var item = items[i].settingMenuItemRenderer;
      if (item && item.selected) {
        return item.value;
      }
    }
    return null;
  }

  function setQuality(value) {
    var renderer = findQualityRenderer();
    if (!renderer || !renderer.data || !renderer.data.items) return;

    var listbox = renderer.querySelector("tp-yt-paper-listbox");
    if (!listbox || typeof listbox.select !== "function") return;

    var items = renderer.data.items;
    for (var i = 0; i < items.length; i++) {
      var item = items[i].settingMenuItemRenderer;
      if (item && item.value === value) {
        listbox.select(i);
        return;
      }
    }
  }

  function handleCommand(data) {
    switch (data.command) {
      case "get-quality": {
        var current = getCurrentQuality();
        window.postMessage(
          { type: "ytm-enhancer:quality-data", current: current },
          "*",
        );
        break;
      }
      case "set-quality": {
        var value = data.value;
        if (value) setQuality(value);
        break;
      }
    }
  }

  function flushPending() {
    ready = true;
    for (var i = 0; i < pendingCommands.length; i++) {
      handleCommand(pendingCommands[i]);
    }
    pendingCommands = [];
  }

  /**
   * Force the YTM settings page to render so the quality renderer
   * exists in the DOM. Opens account menu -> Settings -> Playback,
   * then closes the dialog. The renderers persist after closing.
   */
  function ensureSettingsRendered() {
    if (findQualityRenderer()) {
      flushPending();
      return;
    }

    var settingsBtn = document.querySelector("ytmusic-settings-button");
    if (!settingsBtn) {
      flushPending();
      return;
    }

    var iconBtn = settingsBtn.querySelector("yt-icon-button");
    if (!iconBtn) {
      flushPending();
      return;
    }

    iconBtn.click();

    setTimeout(function () {
      var menuItems = document.querySelectorAll(
        "tp-yt-paper-item, ytmusic-navigation-button-renderer",
      );
      var settingsItem = null;
      menuItems.forEach(function (item) {
        if (item.textContent.trim().startsWith("Settings")) {
          settingsItem = item;
        }
      });

      if (!settingsItem) {
        flushPending();
        return;
      }

      settingsItem.click();

      setTimeout(function () {
        var page = document.querySelector("ytmusic-settings-page");
        if (!page) {
          flushPending();
          return;
        }

        var categories = page.querySelectorAll(
          "tp-yt-paper-item.category-menu-item",
        );
        var playback = null;
        categories.forEach(function (c) {
          if (c.textContent.trim() === "Playback") playback = c;
        });

        if (playback) playback.click();

        setTimeout(function () {
          var closeBtn = page.querySelector("yt-icon-button.close-icon");
          if (closeBtn) closeBtn.click();

          setTimeout(function () {
            flushPending();
          }, 200);
        }, 1500);
      }, 1500);
    }, 800);
  }

  window.addEventListener("message", function (e) {
    if (!e.data || e.data.type !== "ytm-enhancer:quality-bridge-cmd") return;

    if (ready) {
      handleCommand(e.data);
    } else {
      pendingCommands.push(e.data);
    }
  });

  ensureSettingsRendered();
})();
