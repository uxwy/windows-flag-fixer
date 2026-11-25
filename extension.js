// Windows Flag Fixer - restores country flag emojis in the Spotify desktop client on Windows.
(async function WindowsFlagFixer() {
  "use strict";

  const ID = "windows-flag-fixer";
  const VERSION = "1.2.0";
  const FLAG_FONT = "Twemoji Country Flags";
  const FLAG_URL =
    "https://cdn.jsdelivr.net/npm/country-flag-emoji-polyfill@0.1/dist/TwemojiCountryFlags.woff2";
  // Regional indicators (flags) + black flag + tag characters (England/Scotland/Wales)
  const FLAG_RANGE = "U+1F1E6-1F1FF, U+1F3F4, U+E0062-E007F";

  // Emoji code points only. Deliberately excludes ASCII 0-9, # and * so numbers keep the normal font.
  const EMOJI_RANGE =
    "U+00A9, U+00AE, U+203C, U+2049, U+20E3, U+2122, U+2139, U+2194-21AA, U+231A-23FF, U+24C2, " +
    "U+25AA-25FE, U+2600-27BF, U+2934-2935, U+2B05-2B55, U+3030, U+303D, U+3297, U+3299, " +
    "U+FE0F, U+200D, U+1F000-1FAFF, U+E0020-E007F";

  const KEY_STYLE = `${ID}:style`;
  const KEY_CUSTOM = `${ID}:custom-url`;
  const KEY_FORCE = `${ID}:force`;

  // IndexedDB constants for storing large local font files (50MB-150MB+)
  const DB_NAME = `${ID}-db`;
  const DB_STORE = "fonts";
  const DB_LOCAL_KEY = "local-font";

  const STYLES = {
    twemoji: {
      label: "Twemoji flags (default)",
      family: null,
    },
    noto: {
      label: "Noto Color Emoji",
      family: "Noto Color Emoji",
      css: "https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap",
    },
    custom: {
      label: "Custom font URL...",
      family: "Windows Flag Fixer Custom Emoji",
    },
    local: {
      label: "Local font file...",
      family: "Windows Flag Fixer Local Emoji",
    },
  };

  // Spotify CSS variables that hold the app font stack
  const FONT_VARS = ["--encore-body-font-stack", "--font-family", "--encore-title-font-stack"];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(check, timeout = 60000, step = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (check()) return true;
      } catch (e) {
        /* not ready yet */
      }
      await sleep(step);
    }
    return false;
  }

  const ready = await waitFor(
    () =>
      window.Spicetify &&
      Spicetify.Platform &&
      Spicetify.LocalStorage &&
      Spicetify.Menu &&
      document.head &&
      document.body
  );
  if (!ready) {
    console.warn(`[${ID}] Spicetify did not finish loading, giving up.`);
    return;
  }

  // ---------- storage (LocalStorage for settings, IndexedDB for large font files) ----------
  const store = {
    get(key, fallback) {
      try {
        const v = Spicetify.LocalStorage.get(key);
        return v === null || v === undefined ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        Spicetify.LocalStorage.set(key, String(value));
      } catch (e) {
        console.warn(`[${ID}] could not save setting`, e);
      }
    },
  };

  const fontDB = {
    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            db.createObjectStore(DB_STORE);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async get() {
      try {
        const db = await this.open();
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(DB_STORE, "readonly");
          const req = tx.objectStore(DB_STORE).get(DB_LOCAL_KEY);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.warn(`[${ID}] IndexedDB read failed`, e);
        return null;
      }
    },
    async set(blob, name) {
      const db = await this.open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put({ blob, name }, DB_LOCAL_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async clear() {
      const db = await this.open();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(DB_LOCAL_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };

  let currentStyle = store.get(KEY_STYLE, "twemoji");
  if (!STYLES[currentStyle]) currentStyle = "twemoji";
  let customUrl = store.get(KEY_CUSTOM, "");
  let force = store.get(KEY_FORCE, "false") === "true";

  // Local font state (Blob URL lives only in memory for the current session)
  let localBlobUrl = "";
  let localFileName = "";

  function setLocalBlob(blob, name) {
    if (localBlobUrl) {
      URL.revokeObjectURL(localBlobUrl);
      localBlobUrl = "";
    }
    if (blob) {
      localBlobUrl = URL.createObjectURL(blob);
      localFileName = name || "Local Font";
    } else {
      localFileName = "";
    }
  }

  // Restore saved local font file from IndexedDB on startup
  const savedLocal = await fontDB.get();
  if (savedLocal && savedLocal.blob) {
    setLocalBlob(savedLocal.blob, savedLocal.name);
  } else if (currentStyle === "local") {
    currentStyle = "twemoji";
    store.set(KEY_STYLE, currentStyle);
  }

  // ---------- DOM helpers ----------
  function getOrCreate(tag, id, attrs = {}) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tag);
      el.id = id;
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    }
    return el;
  }

  // Capture the original font stacks ONCE, before we override anything,
  // so the user's theme fonts stay intact as the fallback.
  let base = null;
  function captureBase() {
    if (base) return;
    const rootStyle = getComputedStyle(document.documentElement);
    base = { vars: {}, body: getComputedStyle(document.body).fontFamily || "sans-serif" };
    FONT_VARS.forEach((name) => {
      const v = rootStyle.getPropertyValue(name).trim();
      if (v) base.vars[name] = v;
    });
  }

  function buildStack(style) {
    const fonts = [];
    if (style.family) fonts.push(`"${style.family}"`);
    fonts.push(`"${FLAG_FONT}"`);
    return fonts.join(", ");
  }

  function safeUrl(url) {
    if (/^blob:/i.test(url)) return url;
    return String(url).trim().replace(/["'()\\\s]/g, (c) => encodeURIComponent(c));
  }

  // Finds the theme's own "font-family: ... !important" rules (e.g. Liquify's
  // "body, body :not(svg):not(svg *)") so we can re-declare them with the flag font in front.
  function collectThemeFontRules() {
    const out = [];
    const seen = new Set();
    const ours = document.getElementById(`${ID}-style`);
    for (const sheet of document.styleSheets) {
      if (ours && sheet.ownerNode === ours) continue;
      let rules;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        continue; // cross-origin sheet
      }
      for (const r of rules) {
        if (!r.style || !r.selectorText) continue;
        const val = r.style.getPropertyValue("font-family");
        if (!val || r.style.getPropertyPriority("font-family") !== "important") continue;
        if (val.includes(FLAG_FONT)) continue;
        const key = r.selectorText + "|" + val;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ sel: r.selectorText, val });
      }
    }
    return out;
  }

  function apply() {
    captureBase();
    const style = STYLES[currentStyle];
    const stack = buildStack(style);

    // 1) Flag font (always loaded, only used for flag characters thanks to unicode-range)
    let css = `@font-face{font-family:"${FLAG_FONT}";src:url("${FLAG_URL}") format("woff2");unicode-range:${FLAG_RANGE};font-display:swap;}\n`;

    // 2) Optional full emoji font (external CSS, custom HTTPS URL, or local Blob URL)
    const linkId = `${ID}-emoji-css`;
    const oldLink = document.getElementById(linkId);
    if (style.css) {
      const link = getOrCreate("link", linkId, { rel: "stylesheet" });
      if (link.getAttribute("href") !== style.css) link.setAttribute("href", style.css);
    } else if (oldLink) {
      oldLink.remove();
    }

    if (currentStyle === "custom" && customUrl) {
      css += `@font-face{font-family:"${style.family}";src:url("${safeUrl(customUrl)}");unicode-range:${EMOJI_RANGE};font-display:swap;}\n`;
    } else if (currentStyle === "local" && localBlobUrl) {
      css += `@font-face{font-family:"${style.family}";src:url("${safeUrl(localBlobUrl)}");unicode-range:${EMOJI_RANGE};font-display:swap;}\n`;
    }

    // 3) Prepend our fonts to Spotify's own stacks (keeps theme fonts as fallback)
    const usable =
      (currentStyle !== "custom" && currentStyle !== "local") ||
      (currentStyle === "custom" && customUrl) ||
      (currentStyle === "local" && localBlobUrl);
    const effectiveStack = usable ? stack : `"${FLAG_FONT}"`;

    let rootVars = "";
    Object.entries(base.vars).forEach(([name, value]) => {
      rootVars += `${name}:${effectiveStack}, ${value} !important;`;
    });
    css += `:root,body,#main,.Root,[class*="encore-"]{${rootVars}}\n`;
    css += `body,#main,.Root{font-family:${effectiveStack}, ${base.body};}\n`;

    // Ensure Spotify context/profile menus and popovers render the flag preview with our font stack
    css += `#context-menu,#context-menu *,[role="menu"],[role="menu"] *,[role="menuitem"],[role="menuitem"] *,[data-tippy-root],[data-tippy-root] *{font-family:${effectiveStack}, var(--encore-body-font-stack, var(--font-family, ${base.body})) !important;}\n`;

    // Direct top border & subtle styling on the Preview row
    css += `[data-wff-preview="true"]{border-top:1px solid rgba(255,255,255,0.12) !important;margin-top:4px !important;padding-top:8px !important;cursor:default;opacity:0.9;font-size:13px;letter-spacing:0.08em;}\n`;

    // 4) Optional "force everywhere" mode
    if (force) {
      css += `*,*::before,*::after{font-family:${effectiveStack}, var(--font-family, sans-serif) !important;}\n`;
    }

    // 5) Beat the theme's own !important font rules by repeating their selector (we are last in <head>)
    collectThemeFontRules().forEach(({ sel, val }) => {
      css += `${sel}{font-family:${effectiveStack}, ${val} !important;}\n`;
    });

    getOrCreate("style", `${ID}-style`).textContent = css;
  }

  apply();

  // Keep our <style> as the LAST element in <head>, so themes that load later can't override it
  let keepTimer;
  function keepLast() {
    const el = document.getElementById(`${ID}-style`);
    if (el && document.head.lastElementChild !== el) document.head.appendChild(el);
  }
  new MutationObserver((mutations) => {
    const ours = document.getElementById(`${ID}-style`);
    const external = mutations.some((m) => !(ours && (m.target === ours || ours.contains(m.target))));
    if (!external) return;
    clearTimeout(keepTimer);
    keepTimer = setTimeout(() => {
      apply();
      keepLast();
    }, 300);
  }).observe(document.head, { childList: true, subtree: true, characterData: true });
  keepLast();

  // Some themes inject their fonts a moment after start-up; re-apply once to be safe
  setTimeout(() => {
    base = null;
    const styleEl = document.getElementById(`${ID}-style`);
    if (styleEl) styleEl.textContent = "";
    apply();
  }, 4000);

  // Release Blob URL if the page unloads
  window.addEventListener("beforeunload", () => {
    if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
  });

  // ---------- menu ----------
  const items = {};

  function refreshMenu() {
    Object.keys(items).forEach((k) => items[k].setState(k === currentStyle));
  }

  function selectStyle(key) {
    if (key === "custom") {
      openCustomDialog();
      return;
    }
    if (key === "local") {
      openLocalDialog();
      return;
    }
    currentStyle = key;
    store.set(KEY_STYLE, key);
    apply();
    refreshMenu();
  }

  const FONT_FILE = /\.(ttf|otf|woff2?)(\?[^#]*)?(#.*)?$/i;

  function openCustomDialog() {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:10px;max-width:420px;";

    const hint = document.createElement("div");
    hint.style.cssText = "font-size:13px;color:#b3b3b3;";
    hint.textContent = "Direct .woff2, .woff, .ttf, or .otf URL.";

    const input = document.createElement("input");
    input.type = "text";
    input.value = customUrl;
    input.placeholder = "https://example.com/font.woff2";
    input.style.cssText =
      "width:100%;padding:9px 11px;border-radius:6px;border:1px solid #404040;background:#121212;color:#fff;font-size:13px;outline:none;box-sizing:border-box;";

    const msg = document.createElement("div");
    msg.style.cssText = "min-height:1.2em;font-size:12px;color:#f15e6c;";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;align-items:center;";
    const btnBase =
      "padding:7px 14px;border-radius:999px;border:0;cursor:pointer;font-size:13px;font-weight:700;";

    const save = document.createElement("button");
    save.textContent = "Save";
    save.style.cssText = btnBase + "background:#1ed760;color:#000;";

    const clear = document.createElement("button");
    clear.textContent = "Remove";
    clear.style.cssText = btnBase + "background:transparent;color:#b3b3b3;border:1px solid #404040;";
    clear.hidden = !customUrl;

    const busy = (on) => {
      save.disabled = on;
      clear.disabled = on;
    };

    save.onclick = async () => {
      const url = input.value.trim();
      if (!/^https:\/\//i.test(url)) {
        msg.textContent = "URL must start with https://";
        return;
      }
      if (!FONT_FILE.test(url)) {
        msg.textContent = "Must end in .woff2, .woff, .ttf, or .otf";
        return;
      }
      const before = { url: customUrl, style: currentStyle };
      msg.style.color = "#b3b3b3";
      msg.textContent = "Loading…";
      busy(true);
      customUrl = url;
      currentStyle = "custom";
      apply();
      try {
        const loaded = await Promise.race([
          document.fonts.load(`16px "${STYLES.custom.family}"`, "\u{1F1F3}\u{1F1F1}"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000)),
        ]);
        if (!loaded || !loaded.length) throw new Error("font did not load");
      } catch (e) {
        customUrl = before.url;
        currentStyle = before.style;
        apply();
        refreshMenu();
        msg.style.color = "#f15e6c";
        msg.textContent = "Could not load font from URL.";
        busy(false);
        return;
      }
      store.set(KEY_CUSTOM, customUrl);
      store.set(KEY_STYLE, currentStyle);
      refreshMenu();
      Spicetify.PopupModal.hide();
    };

    clear.onclick = () => {
      customUrl = "";
      store.set(KEY_CUSTOM, "");
      if (currentStyle === "custom") {
        currentStyle = "twemoji";
        store.set(KEY_STYLE, currentStyle);
      }
      apply();
      refreshMenu();
      Spicetify.PopupModal.hide();
    };

    row.append(save, clear);
    wrap.append(hint, input, msg, row);
    Spicetify.PopupModal.display({ title: "Custom font URL", content: wrap });
  }

  function openLocalDialog() {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;flex-direction:column;gap:10px;max-width:420px;";

    const status = document.createElement("div");
    status.style.cssText = "font-size:13px;color:#b3b3b3;";
    status.textContent = localFileName ? `File: ${localFileName}` : "No file selected.";

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".woff2,.woff,.ttf,.otf";
    fileInput.style.display = "none";

    const msg = document.createElement("div");
    msg.style.cssText = "min-height:1.2em;font-size:12px;color:#f15e6c;";

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;align-items:center;";
    const btnBase =
      "padding:7px 14px;border-radius:999px;border:0;cursor:pointer;font-size:13px;font-weight:700;";

    const pickBtn = document.createElement("button");
    pickBtn.textContent = localFileName ? "Replace file" : "Choose file";
    pickBtn.style.cssText = btnBase + "background:#1ed760;color:#000;";

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Remove";
    clearBtn.style.cssText = btnBase + "background:transparent;color:#b3b3b3;border:1px solid #404040;";
    clearBtn.hidden = !localFileName;

    const busy = (on) => {
      pickBtn.disabled = on;
      clearBtn.disabled = on;
    };

    pickBtn.onclick = () => fileInput.click();

    fileInput.onchange = async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;

      if (!FONT_FILE.test(file.name)) {
        msg.style.color = "#f15e6c";
        msg.textContent = "Use .woff2, .woff, .ttf, or .otf";
        fileInput.value = "";
        return;
      }

      msg.style.color = "#b3b3b3";
      msg.textContent = "Validating…";
      busy(true);

      const testUrl = URL.createObjectURL(file);
      try {
        const tester = new FontFace(`${ID}-validator`, `url("${testUrl}")`);
        await Promise.race([
          tester.load(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 20000)),
        ]);

        await fontDB.set(file, file.name);
        setLocalBlob(file, file.name);
        currentStyle = "local";
        store.set(KEY_STYLE, currentStyle);
        apply();
        refreshMenu();
        Spicetify.PopupModal.hide();
      } catch (e) {
        msg.style.color = "#f15e6c";
        msg.textContent = "Could not load font file.";
        busy(false);
        fileInput.value = "";
      } finally {
        URL.revokeObjectURL(testUrl);
      }
    };

    clearBtn.onclick = async () => {
      busy(true);
      try {
        await fontDB.clear();
        setLocalBlob(null, "");
        if (currentStyle === "local") {
          currentStyle = "twemoji";
          store.set(KEY_STYLE, currentStyle);
        }
        apply();
        refreshMenu();
        Spicetify.PopupModal.hide();
      } catch (e) {
        msg.style.color = "#f15e6c";
        msg.textContent = "Could not remove file.";
        busy(false);
      }
    };

    row.append(pickBtn, clearBtn);
    wrap.append(status, fileInput, msg, row);
    Spicetify.PopupModal.display({ title: "Local font file", content: wrap });
  }

  function styleSubmenuRows() {
    const menuItems = document.querySelectorAll('[role="menu"] [role="menuitem"], #context-menu [role="menuitem"]');
    menuItems.forEach((el) => {
      const text = (el.textContent || "").trim();
      if (text.startsWith("Preview:")) {
        el.setAttribute("data-wff-preview", "true");
      }
    });
  }

  // Menu.Item builds its UI with Spicetify.ReactJSX, which can load later than Menu itself
  const reactReady = await waitFor(
    () => Spicetify.React && Spicetify.ReactJSX && Spicetify.ReactJSX.jsx,
    30000
  );
  if (!reactReady) {
    console.warn(`[${ID}] Spicetify React helpers never loaded, skipping menu (flags still work).`);
  }

  try {
    if (!reactReady) throw new Error("React helpers unavailable");
    const menuItems = [];

    // 1–4: Style options
    Object.entries(STYLES).forEach(([key, def]) => {
      items[key] = new Spicetify.Menu.Item(def.label, key === currentStyle, () => selectStyle(key));
      menuItems.push(items[key]);
    });

    // 5: Preview row with top border divider
    const previewItem = new Spicetify.Menu.Item(
      "Preview:  \u{1F1F2}\u{1F1E6}  \u{1F1FA}\u{1F1F8}  \u{1F1EF}\u{1F1F5}  \u{1F1E7}\u{1F1F7}",
      false,
      () => {}
    );
    menuItems.push(previewItem);

    if (Spicetify.Menu.SubMenu) {
      new Spicetify.Menu.SubMenu("Windows Flag Fixer", menuItems).register();
    } else {
      menuItems.forEach((i) => i.register());
    }

    // Apply top border & styling to the Preview row whenever menus open
    new MutationObserver(styleSubmenuRows).observe(document.body, {
      childList: true,
      subtree: true,
    });
  } catch (e) {
    console.warn(`[${ID}] menu could not be created, flags will still work.`, e);
  }

  console.log(`[${ID}] v${VERSION} loaded (style: ${currentStyle})`);
})();
