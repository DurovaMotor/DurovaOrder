(function () {
  var CART_KEY = "hightac-cart-v1";
  var LAST_SUBMISSION_KEY = "hightac-last-submission-v1";
  var CART_UPDATED_EVENT = "cart:updated";
  var WHATSAPP_PHONE = "8613602489689";
  var STEP = 10;
  var CHUNK_SIZE = 80;
  var state = {
    catalog: [],
    filtered: [],
    rendered: 0,
    index: {},
    observer: null,
  };

  function getCatalog() {
    if (window.HIGHTAC_PARTS_DATA && Array.isArray(window.HIGHTAC_PARTS_DATA.parts)) {
      return window.HIGHTAC_PARTS_DATA;
    }
    return null;
  }

  function readStorage(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn("Unable to read storage:", key, error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.warn("Unable to write storage:", key, error);
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(value || 0);
  }

  function getPartTitle(part) {
    return part.nameZh || part.displayName || part.nameEn || part.code || "Unnamed Part";
  }

  function getPartSubtitle(part) {
    if (part.nameEn && part.nameEn !== part.nameZh) {
      return part.nameEn;
    }
    if (part.nameZh && part.displayName && part.displayName !== part.nameZh) {
      return part.displayName;
    }
    return "";
  }

  function getInquiryName(part) {
    return part.displayName || part.nameEn || part.nameZh || part.code || "Unnamed Part";
  }

  function resolveImage(part) {
    if (part && part.picture) {
      return "./" + part.picture;
    }

    var title = escapeHtml(getInquiryName(part));
    var code = escapeHtml((part && part.code) || "NO CODE");
    return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop stop-color="#fef3c7" offset="0%"/>' +
        '<stop stop-color="#fb923c" offset="100%"/>' +
        "</linearGradient></defs>" +
        '<rect width="320" height="240" rx="24" fill="url(#g)"/>' +
        '<text x="24" y="100" fill="#12213d" font-size="18" font-family="Arial, sans-serif">No product image</text>' +
        '<text x="24" y="136" fill="#12213d" font-size="22" font-weight="700" font-family="Arial, sans-serif">' + code + "</text>" +
        '<text x="24" y="172" fill="#12213d" font-size="14" font-family="Arial, sans-serif">' + title + "</text>" +
      "</svg>"
    );
  }

  function loadCart() {
    return readStorage(CART_KEY, {});
  }

  function saveCart(cart) {
    writeStorage(CART_KEY, cart);
    window.dispatchEvent(new CustomEvent(CART_UPDATED_EVENT, { detail: getCartSummary(cart) }));
  }

  function getCartItems(cart) {
    var source = cart || loadCart();
    return Object.values(source)
      .filter(function (item) {
        return item && item.code && item.quantity > 0;
      })
      .sort(function (left, right) {
        return getInquiryName(left).localeCompare(getInquiryName(right), "en", { sensitivity: "base" });
      });
  }

  function getCartSummary(cart) {
    var items = getCartItems(cart);
    return {
      items: items,
      lineCount: items.length,
      totalQuantity: items.reduce(function (sum, item) {
        return sum + item.quantity;
      }, 0),
    };
  }

  function getPartQuantity(code) {
    if (!code) {
      return 0;
    }
    var cart = loadCart();
    return cart[code] ? cart[code].quantity : 0;
  }

  function updateCartQuantity(part, quantity) {
    if (!part || !part.code) {
      return 0;
    }

    var nextQuantity = Math.max(0, Number(quantity) || 0);
    var cart = loadCart();

    if (nextQuantity === 0) {
      delete cart[part.code];
      saveCart(cart);
      return 0;
    }

    cart[part.code] = {
      code: part.code,
      displayName: getInquiryName(part),
      nameZh: part.nameZh || "",
      nameEn: part.nameEn || "",
      picture: part.picture || null,
      quantity: nextQuantity,
    };
    saveCart(cart);
    return nextQuantity;
  }

  function changeCartQuantity(part, delta) {
    return updateCartQuantity(part, getPartQuantity(part.code) + delta);
  }

  function showToast(message) {
    var root = document.getElementById("toast-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "toast-root";
      document.body.appendChild(root);
    }

    var toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    root.appendChild(toast);

    window.requestAnimationFrame(function () {
      toast.classList.add("toast--visible");
    });

    window.setTimeout(function () {
      toast.classList.remove("toast--visible");
      toast.addEventListener("transitionend", function () {
        toast.remove();
      }, { once: true });
    }, 2200);
  }

  function buildWhatsAppMessage(items, modelName) {
    var lines = items.map(function (item, index) {
      return (index + 1) + ". " + getInquiryName(item) + " | " + item.code + " | Qty: " + item.quantity;
    });

    return [
      "Hello HIGHTAC, I want to inquire about these parts:",
      "",
      "Model: " + modelName,
      "",
      lines.join("\n"),
      "",
      "Please send me the price and delivery time."
    ].join("\n");
  }

  function buildWhatsAppUrl(items, modelName) {
    return "https://wa.me/" + WHATSAPP_PHONE + "?text=" + encodeURIComponent(buildWhatsAppMessage(items, modelName));
  }

  function saveSubmission(payload) {
    writeStorage(LAST_SUBMISSION_KEY, payload);
  }

  function readSubmission() {
    return readStorage(LAST_SUBMISSION_KEY, null);
  }

  function submitCart() {
    var catalog = getCatalog();
    var modelName = catalog && catalog.model ? catalog.model.name : "SYMPHONY ST";
    var summary = getCartSummary();

    if (!summary.lineCount) {
      showToast("Cart is empty.");
      return false;
    }

    saveSubmission({
      createdAt: new Date().toISOString(),
      model: modelName,
      items: summary.items,
      message: buildWhatsAppMessage(summary.items, modelName),
      url: buildWhatsAppUrl(summary.items, modelName),
    });

    window.location.href = "./success.html";
    return true;
  }

  function createCartShell() {
    var wrap = document.createElement("div");
    wrap.innerHTML = '' +
      '<button class="cart-fab" type="button" data-cart-toggle aria-label="Open cart">' +
        '<span class="cart-fab__icon">Cart</span>' +
        '<span class="cart-fab__count" data-cart-count>0</span>' +
      "</button>" +
      '<div class="cart-mask" data-cart-mask hidden></div>' +
      '<aside class="cart-drawer" data-cart-drawer aria-hidden="true">' +
        '<div class="cart-drawer__header">' +
          "<div>" +
            '<p class="section-kicker">Inquiry Cart</p>' +
            "<h2>Selected Parts</h2>" +
          "</div>" +
          '<button class="cart-drawer__close" type="button" data-cart-close aria-label="Close cart">x</button>' +
        "</div>" +
        '<div class="cart-drawer__summary">' +
          '<span data-cart-lines>0 items</span>' +
          '<span data-cart-total>0 qty</span>' +
        "</div>" +
        '<div class="cart-drawer__body" data-cart-items></div>' +
        '<div class="cart-drawer__footer">' +
          '<button class="primary-button primary-button--full" type="button" data-cart-submit>Submit Inquiry</button>' +
        "</div>" +
      "</aside>";
    document.body.appendChild(wrap);
  }

  function syncQuantityViews(root) {
    var scope = root || document;

    scope.querySelectorAll("[data-quantity-for]").forEach(function (node) {
      node.textContent = String(getPartQuantity(node.getAttribute("data-quantity-for")));
    });

    scope.querySelectorAll("[data-decrease-for]").forEach(function (button) {
      button.disabled = getPartQuantity(button.getAttribute("data-decrease-for")) <= 0;
    });

    scope.querySelectorAll("[data-in-cart-for]").forEach(function (node) {
      var qty = getPartQuantity(node.getAttribute("data-in-cart-for"));
      node.hidden = qty <= 0;
      node.textContent = "In cart: " + qty;
    });
  }

  function renderCartDrawer() {
    var shell = document.querySelector("[data-cart-drawer]");
    if (!shell) {
      return;
    }

    var summary = getCartSummary();
    var itemsHost = shell.querySelector("[data-cart-items]");
    shell.querySelector("[data-cart-lines]").textContent = summary.lineCount + " item" + (summary.lineCount === 1 ? "" : "s");
    shell.querySelector("[data-cart-total]").textContent = summary.totalQuantity + " qty";

    document.querySelectorAll("[data-cart-count]").forEach(function (node) {
      node.textContent = String(summary.lineCount);
      node.hidden = summary.lineCount === 0;
    });

    shell.querySelector("[data-cart-submit]").disabled = summary.lineCount === 0;

    if (!summary.lineCount) {
      itemsHost.innerHTML = '' +
        '<div class="empty-card">' +
          "<p>Cart is empty.</p>" +
        "</div>";
      return;
    }

    itemsHost.innerHTML = summary.items.map(function (item) {
      return '' +
        '<article class="cart-row">' +
          '<img class="cart-row__image" src="' + resolveImage(item) + '" alt="' + escapeHtml(getInquiryName(item)) + '">' +
          '<div class="cart-row__content">' +
            '<h3>' + escapeHtml(getPartTitle(item)) + "</h3>" +
            (getPartSubtitle(item) ? '<p class="cart-row__sub">' + escapeHtml(getPartSubtitle(item)) + "</p>" : "") +
            '<p class="cart-row__code">' + escapeHtml(item.code) + "</p>" +
          "</div>" +
          '<div class="qty-control qty-control--compact">' +
            '<button type="button" data-cart-action="decrease" data-code="' + escapeHtml(item.code) + '"' + (item.quantity <= 0 ? " disabled" : "") + '>-10</button>' +
            '<strong>' + item.quantity + "</strong>" +
            '<button type="button" data-cart-action="increase" data-code="' + escapeHtml(item.code) + '">+10</button>' +
          "</div>" +
        "</article>";
    }).join("");
  }

  function initCartShell() {
    if (!document.querySelector("[data-cart-toggle]")) {
      createCartShell();
    }

    var toggle = document.querySelector("[data-cart-toggle]");
    var mask = document.querySelector("[data-cart-mask]");
    var drawer = document.querySelector("[data-cart-drawer]");
    var closeButton = document.querySelector("[data-cart-close]");
    var submitButton = document.querySelector("[data-cart-submit]");

    function setOpen(open) {
      drawer.classList.toggle("cart-drawer--open", open);
      drawer.setAttribute("aria-hidden", String(!open));
      mask.hidden = !open;
      document.body.classList.toggle("is-cart-open", open);
    }

    toggle.addEventListener("click", function () {
      setOpen(true);
    });
    closeButton.addEventListener("click", function () {
      setOpen(false);
    });
    mask.addEventListener("click", function () {
      setOpen(false);
    });
    submitButton.addEventListener("click", submitCart);
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    });

    drawer.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-cart-action]");
      var item;
      if (!button) {
        return;
      }
      item = loadCart()[button.getAttribute("data-code")];
      if (!item) {
        return;
      }
      changeCartQuantity(item, button.getAttribute("data-cart-action") === "increase" ? STEP : -STEP);
    });

    window.addEventListener(CART_UPDATED_EVENT, renderCartDrawer);
    renderCartDrawer();
  }

  function updateHomeStats() {
    var catalog = getCatalog();
    if (!catalog) {
      document.querySelectorAll("[data-home-parts]").forEach(function (node) {
        node.textContent = "Data unavailable";
      });
      document.querySelectorAll("[data-home-photos]").forEach(function (node) {
        node.textContent = "Images unavailable";
      });
      return;
    }

    document.querySelectorAll("[data-home-model]").forEach(function (node) {
      node.textContent = catalog.model.name;
    });
    document.querySelectorAll("[data-home-parts]").forEach(function (node) {
      node.textContent = formatNumber(catalog.stats.totalParts) + " parts";
    });
    document.querySelectorAll("[data-home-photos]").forEach(function (node) {
      node.textContent = formatNumber(catalog.stats.partsWithImages) + " images";
    });
    document.querySelectorAll("[data-home-image]").forEach(function (node) {
      node.src = "./" + catalog.model.motorPicture;
      node.alt = catalog.model.name;
    });
  }

  function buildPartRow(part) {
    return '' +
      '<article class="part-row" data-part-code="' + escapeHtml(part.code) + '">' +
        '<div class="part-row__image-wrap">' +
          '<img class="part-row__image" src="' + resolveImage(part) + '" alt="' + escapeHtml(getInquiryName(part)) + '" loading="lazy">' +
        "</div>" +
        '<div class="part-row__content">' +
          '<div class="part-row__text">' +
            '<h3>' + escapeHtml(getPartTitle(part)) + "</h3>" +
            (getPartSubtitle(part) ? '<p class="part-row__sub">' + escapeHtml(getPartSubtitle(part)) + "</p>" : "") +
            '<p class="part-row__code">Code: ' + escapeHtml(part.code) + "</p>" +
            '<span class="part-row__badge" data-in-cart-for="' + escapeHtml(part.code) + '" hidden>In cart: 0</span>' +
          "</div>" +
          '<div class="qty-control">' +
            '<button type="button" data-row-action="decrease" data-decrease-for="' + escapeHtml(part.code) + '">-10</button>' +
            '<div class="qty-control__center">' +
              '<span class="qty-control__label">Qty</span>' +
              '<strong data-quantity-for="' + escapeHtml(part.code) + '">0</strong>' +
            "</div>" +
            '<button type="button" data-row-action="increase">+10</button>' +
          "</div>" +
        "</div>" +
      "</article>";
  }

  function renderPartsInfo(filteredLength) {
    var total = state.catalog.length;
    var status = document.getElementById("parts-status");
    var meta = document.getElementById("parts-meta");
    var summary = getCartSummary();

    if (status) {
      status.textContent = formatNumber(filteredLength) + " parts";
    }
    if (meta) {
      meta.textContent = summary.lineCount + " selected / " + summary.totalQuantity + " qty";
    }

    var progress = document.getElementById("parts-progress");
    if (progress) {
      progress.textContent = "Showing " + formatNumber(Math.min(state.rendered, filteredLength)) + " / " + formatNumber(filteredLength || total);
    }
  }

  function renderNextChunk() {
    var host = document.getElementById("parts-list");
    var footer = document.getElementById("parts-loading");
    var empty = document.getElementById("parts-empty");
    var sentinel = document.getElementById("parts-sentinel");

    if (!host || !footer || !sentinel || !empty) {
      return;
    }

    if (!state.filtered.length) {
      empty.hidden = false;
      footer.hidden = true;
      sentinel.hidden = true;
      renderPartsInfo(0);
      return;
    }

    empty.hidden = true;

    if (state.rendered >= state.filtered.length) {
      footer.textContent = "All parts loaded";
      sentinel.hidden = true;
      renderPartsInfo(state.filtered.length);
      return;
    }

    var nextSlice = state.filtered.slice(state.rendered, state.rendered + CHUNK_SIZE);
    host.insertAdjacentHTML("beforeend", nextSlice.map(buildPartRow).join(""));
    state.rendered += nextSlice.length;
    syncQuantityViews(host);
    footer.hidden = false;
    footer.textContent = state.rendered >= state.filtered.length ? "All parts loaded" : "Loading more parts...";
    sentinel.hidden = state.rendered >= state.filtered.length;
    renderPartsInfo(state.filtered.length);
  }

  function resetPartsList(parts) {
    var host = document.getElementById("parts-list");
    var footer = document.getElementById("parts-loading");
    var sentinel = document.getElementById("parts-sentinel");

    state.filtered = parts;
    state.rendered = 0;

    if (host) {
      host.innerHTML = "";
    }
    if (footer) {
      footer.hidden = false;
      footer.textContent = "Loading parts...";
    }
    if (sentinel) {
      sentinel.hidden = false;
    }

    renderNextChunk();
  }

  function initPartsPage() {
    var catalog = getCatalog();
    var list = document.getElementById("parts-list");
    var search = document.getElementById("parts-search");
    var submit = document.getElementById("page-submit");
    var sentinel = document.getElementById("parts-sentinel");
    var image = document.getElementById("parts-model-image");
    var count = document.getElementById("parts-count-chip");
    var photo = document.getElementById("parts-photo-chip");

    if (!catalog) {
      document.getElementById("parts-loading").textContent = "Unable to load parts data";
      return;
    }

    image.src = "./" + catalog.model.motorPicture;
    image.alt = catalog.model.name;
    count.textContent = formatNumber(catalog.stats.totalParts) + " total parts";
    photo.textContent = formatNumber(catalog.stats.partsWithImages) + " matched images";

    state.catalog = catalog.parts.slice();
    state.filtered = state.catalog.slice();
    state.index = {};
    state.catalog.forEach(function (part) {
      state.index[part.code] = part;
    });

    submit.addEventListener("click", submitCart);
    list.addEventListener("click", function (event) {
      var button = event.target.closest("button[data-row-action]");
      var row;
      var part;

      if (!button) {
        return;
      }

      row = button.closest("[data-part-code]");
      part = state.index[row.getAttribute("data-part-code")];
      if (!part) {
        return;
      }

      changeCartQuantity(part, button.getAttribute("data-row-action") === "increase" ? STEP : -STEP);
      syncQuantityViews(list);
      renderPartsInfo(state.filtered.length);
    });

    search.addEventListener("input", function () {
      var term = search.value.trim().toLowerCase();
      if (!term) {
        resetPartsList(state.catalog.slice());
        return;
      }

      resetPartsList(state.catalog.filter(function (part) {
        return String(part.searchText || "").includes(term);
      }));
    });

    window.addEventListener(CART_UPDATED_EVENT, function () {
      syncQuantityViews(list);
      renderCartDrawer();
      renderPartsInfo(state.filtered.length);
    });

    if ("IntersectionObserver" in window && sentinel) {
      state.observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            renderNextChunk();
          }
        });
      }, { rootMargin: "220px 0px" });
      state.observer.observe(sentinel);
    }

    resetPartsList(state.catalog.slice());
    renderPartsInfo(state.filtered.length);
  }

  function initSuccessPage() {
    var submission = readSubmission();
    var button = document.getElementById("success-open");
    var list = document.getElementById("success-items");
    var text = document.getElementById("success-text");
    var status = document.getElementById("success-status");

    if (!submission || !submission.items || !submission.items.length) {
      text.textContent = "No inquiry found.";
      button.href = "./parts.html";
      button.textContent = "Back to Parts";
      status.textContent = "";
      list.innerHTML = '<div class="empty-card"><p>No inquiry found.</p></div>';
      return;
    }

    button.href = submission.url;
    text.textContent = "Inquiry ready.";
    list.innerHTML = submission.items.map(function (item) {
      return '' +
        '<article class="summary-row">' +
          "<div>" +
            '<h3>' + escapeHtml(getInquiryName(item)) + "</h3>" +
            '<p>' + escapeHtml(item.code) + "</p>" +
          "</div>" +
          "<strong>Qty: " + item.quantity + "</strong>" +
        "</article>";
    }).join("");

    status.textContent = "Redirecting...";
    window.setTimeout(function () {
      window.location.href = submission.url;
    }, 1200);
  }

  function initPage() {
    var page = document.body.getAttribute("data-page");
    initCartShell();
    updateHomeStats();

    if (page === "parts") {
      initPartsPage();
    } else if (page === "success") {
      initSuccessPage();
    }
  }

  document.addEventListener("DOMContentLoaded", initPage);
})();
