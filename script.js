const API_URL = "https://gamehub.crysthigpen.workers.dev/";

let allCharacters = [];
let activeOwner = "Luna";

const qs = selector => document.querySelector(selector);
const qsa = selector => Array.from(document.querySelectorAll(selector));

function cleanText(value) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value).trim();
}

function escapeHtml(value) {
  return cleanText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function looksLikeImagePath(value) {
  const text = cleanText(value).toLowerCase();

  return (
    text.startsWith("http://") ||
    text.startsWith("https://") ||
    text.startsWith("/") ||
    text.startsWith("./") ||
    text.startsWith("../") ||
    text.startsWith("images/") ||
    text.startsWith("assets/") ||
    /\.(png|jpg|jpeg|gif|webp|avif|svg)(\?.*)?$/.test(text)
  );
}

function splitImageTitleAndPath(value) {
  const text = cleanText(value);

  if (!text) {
    return {
      url: "",
      title: ""
    };
  }

  // Supports StarHub-style formats:
  // Title|/images/file.png
  // /images/file.png|Title
  // Title - /images/file.png
  // Title — /images/file.png
  // Title :: /images/file.png
  const separators = ["|", "::", "—", "–"];

  for (const separator of separators) {
    if (!text.includes(separator)) continue;

    const parts = text
      .split(separator)
      .map(part => part.trim())
      .filter(Boolean);

    if (parts.length < 2) continue;

    const first = parts[0];
    const second = parts.slice(1).join(separator).trim();

    if (looksLikeImagePath(first)) {
      return {
        url: first,
        title: second
      };
    }

    if (looksLikeImagePath(second)) {
      return {
        url: second,
        title: first
      };
    }
  }

  // Fallback: find the first image-looking token anywhere in the text.
  const match = text.match(/(?:https?:\/\/\S+|\.{0,2}\/\S+|(?:images|assets)\/\S+|\S+\.(?:png|jpg|jpeg|gif|webp|avif|svg)(?:\?\S*)?)/i);

  if (match) {
    const url = match[0].trim();
    const title = text.replace(url, "").replace(/[|:—–-]+$/g, "").trim();

    return {
      url,
      title
    };
  }

  return {
    url: text,
    title: ""
  };
}

function getImage(path) {
  const parsed = splitImageTitleAndPath(path);
  const value = cleanText(parsed.url || path);

  if (!value) return "/images/placeholder.png";

  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return value;

  return `/${value.replace(/^\.?\//, "")}`;
}

function normalizeImageItem(item) {
  if (!item) return null;

  if (typeof item === "string") {
    return splitImageTitleAndPath(item);
  }

  const rawUrl =
    item.url ||
    item.src ||
    item.image ||
    item.file ||
    item.path ||
    item.href ||
    "";

  const parsed = splitImageTitleAndPath(rawUrl);

  return {
    url: parsed.url,
    title: item.title || item.label || item.name || parsed.title || ""
  };
}

function getCharacterPortrait(character) {
  const raw =
    character.portrait ||
    character.Portrait ||
    character.image ||
    character.Image ||
    character.icon ||
    character.Icon ||
    character.mainRef ||
    character["Main Ref"] ||
    "";

  const item = normalizeImageItem(raw);

  return item?.url || raw || "";
}

async function fetchCharacters() {
  const response = await fetch(API_URL);
  if (!response.ok) throw new Error(`Worker returned ${response.status}`);
  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("Worker did not return a character list.");
  }

  return data;
}

/* ---------------------------
   Hub list page
--------------------------- */

function renderHub() {
  const grid = qs("#characterGrid");
  const status = qs("#statusMessage");
  if (!grid) return;

  const search = cleanText(qs("#searchInput")?.value).toLowerCase();

  const filtered = allCharacters.filter(character => {
    const owner = cleanText(character.owner || character.Owner);
    const ownerMatches = owner.toLowerCase() === activeOwner.toLowerCase();

    const searchable = [
      character.name,
      character.age,
      character.race,
      character.partner,
      character.game
    ].map(cleanText).join(" ").toLowerCase();

    return ownerMatches && (!search || searchable.includes(search));
  });

  grid.innerHTML = "";

  if (!filtered.length) {
    if (status) status.textContent = `No ${activeOwner} characters found.`;
    return;
  }

  if (status) status.textContent = "";

  filtered.forEach(character => {
    const slug = character.slug || slugify(character.name);
    const img = getImage(getCharacterPortrait(character));

    const card = document.createElement("a");
    card.className = "character-card";
    card.href = `characters/?slug=${encodeURIComponent(slug)}`;

    card.innerHTML = `
      <div class="card-image-wrap">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(character.name || "Character")}">
      </div>

      <div class="card-body">
        <h2>${escapeHtml(character.name || "Unnamed")}</h2>
        <p>${escapeHtml(character.race || "Unknown race")}</p>
        <p>${escapeHtml(character.game || "Unknown game")}</p>
        <span class="badge">${escapeHtml(character.owner || activeOwner)}</span>
      </div>
    `;

    grid.appendChild(card);
  });
}

function setupHubPage() {
  const grid = qs("#characterGrid");
  if (!grid) return;

  qsa(".owner-tab").forEach(button => {
    button.addEventListener("click", () => {
      qsa(".owner-tab").forEach(btn => btn.classList.remove("active"));
      button.classList.add("active");
      activeOwner = button.dataset.owner || "Luna";
      renderHub();
    });
  });

  qs("#searchInput")?.addEventListener("input", renderHub);

  fetchCharacters()
    .then(data => {
      allCharacters = data;
      renderHub();
    })
    .catch(error => {
      console.error("GameHub loading error:", error);
      const status = qs("#statusMessage");
      if (status) status.textContent = "Unable to load characters. Check the Worker URL and console.";
    });
}

/* ---------------------------
   Character profile page
--------------------------- */

function setText(id, value, fallback = "—") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = cleanText(value) || fallback;
}

function setImage(id, src) {
  const img = document.getElementById(id);
  if (!img) return;
  img.src = getImage(src || "../images/placeholder.png");
}

function setupProfileTabs(character) {
  qsa(".profile-tab").forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.tab;

      qsa(".profile-tab").forEach(btn => btn.classList.remove("active"));
      qsa(".tab-panel").forEach(panel => panel.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(target)?.classList.add("active");
    });
  });

  setProfileTabVisible("gallery", Array.isArray(character.gallery) && character.gallery.length > 0);
  setProfileTabVisible("nsfw", Array.isArray(character.nsfwGallery) && character.nsfwGallery.length > 0);
  setProfileTabVisible("screenshots", Array.isArray(character.dumbScreenshots) && character.dumbScreenshots.length > 0);
}

function setProfileTabVisible(tab, visible) {
  const button = qs(`.profile-tab[data-tab="${tab}"]`);
  const panel = document.getElementById(tab);
  if (button) button.style.display = visible ? "" : "none";
  if (!visible && panel) panel.classList.remove("active");
}

function renderImages(gridId, images, mature = false) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  grid.innerHTML = "";

  if (!Array.isArray(images) || images.length === 0) {
    grid.innerHTML = `<p class="status-message">No images yet.</p>`;
    return;
  }

  images.forEach(raw => {
    const item = normalizeImageItem(raw);
    if (!item || !item.url) return;

    const url = getImage(item.url);
    const card = document.createElement("article");
    card.className = mature ? "image-card nsfw-card" : "image-card";

    card.innerHTML = `
      <div class="${mature ? "nsfw-wrap" : ""}">
        <img src="${escapeHtml(url)}" alt="${escapeHtml(item.title || "Gallery image")}">
        ${mature ? `<div class="nsfw-overlay"><strong>🔞 Click to reveal</strong></div>` : ""}
      </div>
      ${item.title ? `<p class="image-title">${escapeHtml(item.title)}</p>` : ""}
    `;

    const img = card.querySelector("img");

    if (mature) {
      card.addEventListener("click", () => {
        if (!card.classList.contains("revealed")) {
          card.classList.add("revealed");
          return;
        }
        openLightbox(url);
      });
    } else {
      img.addEventListener("click", () => openLightbox(url));
    }

    grid.appendChild(card);
  });
}

function renderProfile(character) {
  document.title = `${character.name || "Character"} | GameHub`;

  setText("ownerLabel", character.owner ? `${character.owner}'s Character` : "Game Character");
  setText("characterName", character.name, "Unnamed");
  setText("gameLabel", character.game, "Unknown game");

  setImage("portraitImage", getCharacterPortrait(character));

  setText("factName", character.name);
  setText("factAge", character.age);
  setText("factRace", character.race);
  setText("factPartner", character.partner);
  setText("factGame", character.game);

  renderImages("galleryGrid", character.gallery, false);
  renderImages("nsfwGrid", character.nsfwGallery, true);
  renderImages("screenshotsGrid", character.dumbScreenshots, false);

  setupProfileTabs(character);
}

function setupCharacterPage() {
  const nameEl = qs("#characterName");
  if (!nameEl) return;

  const params = new URLSearchParams(window.location.search);
  const slug = cleanText(params.get("slug"));

  if (!slug) {
    setText("characterName", "No character selected");
    setText("gameLabel", "Go back and choose a character.");
    return;
  }

  fetchCharacters()
    .then(data => {
      allCharacters = data;
      const character = allCharacters.find(item => {
        const itemSlug = cleanText(item.slug || slugify(item.name)).toLowerCase();
        return itemSlug === slug.toLowerCase();
      });

      if (!character) {
        setText("characterName", "Character not found");
        setText("gameLabel", `No character found for slug: ${slug}`);
        return;
      }

      renderProfile(character);
    })
    .catch(error => {
      console.error("GameHub character loading error:", error);
      setText("characterName", "Unable to load character");
      setText("gameLabel", "Check the Worker URL and console.");
    });
}

function openLightbox(src) {
  const box = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImage");
  if (!box || !img) return;

  img.src = src;
  box.classList.add("active");
}

function closeLightbox() {
  const box = document.getElementById("lightbox");
  const img = document.getElementById("lightboxImage");
  if (!box || !img) return;

  box.classList.remove("active");
  img.src = "";
}

function setupLightbox() {
  const close = document.getElementById("lightboxClose");
  const box = document.getElementById("lightbox");

  close?.addEventListener("click", closeLightbox);
  box?.addEventListener("click", event => {
    if (event.target.id === "lightbox") closeLightbox();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeLightbox();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupLightbox();
  setupHubPage();
  setupCharacterPage();
});
