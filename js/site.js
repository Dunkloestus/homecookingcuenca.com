(function () {
  var KEY = "hcc-locale";
  var locale = localStorage.getItem(KEY) === "es" ? "es" : "en";
  var filter = "all";
  var qty = {};
  var planOn = true;
  var runId = "thursday";
  var cfg = window.HCC_CONFIG;
  var dishes = window.HCC_DISHES;

  function t() { return window.HCC_I18N[locale]; }

  function apply() {
    var d = t();
    document.documentElement.lang = locale;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (d[key] != null) el.textContent = d[key];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (d[key] != null) el.setAttribute("placeholder", d[key]);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-aria");
      if (d[key] != null) el.setAttribute("aria-label", d[key]);
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-alt");
      if (d[key] != null) el.setAttribute("alt", d[key]);
    });
    document.querySelectorAll(".lang button").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-locale") === locale ? "true" : "false");
    });
    var priceEls = document.querySelectorAll("[data-plan-price]");
    priceEls.forEach(function (el) {
      el.textContent = d.weeklyPlanKicker + " · $" + cfg.weeklyPlanPrice;
    });
    renderDinners();
    renderDishes();
    renderOrderLabels();
    var soon = document.getElementById("store-soon");
    var store = document.getElementById("open-store");
    if (cfg.orderSiteUrl) {
      if (soon) soon.hidden = true;
      if (store) { store.hidden = false; store.href = cfg.orderSiteUrl; }
    } else {
      if (soon) soon.hidden = false;
      if (store) store.hidden = true;
    }
    if (window.HCC_SITE.onApply) window.HCC_SITE.onApply();
  }

  function renderDinners() {
    var d = t();
    var ol = document.getElementById("plan-dinners");
    if (!ol) return;
    var items = [
      [d.dinner1, d.dinner1Note],
      [d.dinner2, d.dinner2Note],
      [d.dinner3, d.dinner3Note],
      [d.dinner4, d.dinner4Note]
    ];
    ol.innerHTML = items.map(function (it, i) {
      return '<li><span class="num">0' + (i + 1) + '</span><span><strong>' + it[0] + '</strong> — ' + it[1] + '</span></li>';
    }).join("");
  }

  function renderDishes() {
    var d = t();
    var box = document.getElementById("dishes");
    var list = dishes.filter(function (x) { return filter === "all" || x.cat === filter; });
    box.innerHTML = list.map(function (x) {
      var primary = x.name[locale];
      var secondary = locale === "es" ? x.name.en : x.name.es;
      var sub = secondary !== primary ? '<p class="dish-sub">' + secondary + "</p>" : "";
      return '<article class="dish"><img src="' + x.img + '" alt="' + primary + '"><div class="dish-body"><div class="dish-top"><div><p class="dish-name">' + primary + "</p>" + sub + '</div><p>$' + x.price + '</p></div><p class="dish-desc">' + x.desc[locale] + "</p></div></article>";
    }).join("");
    document.querySelectorAll(".chip").forEach(function (c) {
      c.classList.toggle("active", c.getAttribute("data-filter") === filter);
    });
  }

  function renderOrderLabels() {
    if (window.HCC_LIVE && window.HCC_LIVE.active) return; /* order-live.js renders the panel */
    var d = t();
    document.getElementById("run-thu-label").textContent = d.deliveryThu;
    document.getElementById("run-thu-due").textContent = d.due + " " + d.dueTue;
    document.getElementById("run-sun-label").textContent = d.deliverySun;
    document.getElementById("run-sun-due").textContent = d.due + " " + d.dueFri;
    document.getElementById("plan-name").textContent = d.weeklyPlanName + " — $" + cfg.weeklyPlanPrice;
    var list = document.getElementById("order-items");
    list.innerHTML = dishes.map(function (x) {
      var label = x.name[locale];
      var n = qty[x.id] || 0;
      return '<li class="item-row"><div><p style="margin:0;font-size:.9rem;font-weight:500">' + label + '</p><p style="margin:0;font-size:.75rem;color:var(--muted)">$' + x.price + '</p></div><div class="qty"><button type="button" data-minus="' + x.id + '" aria-label="' + d.fewer + " " + label + '">−</button><span>' + n + '</span><button type="button" data-plus="' + x.id + '" aria-label="' + d.more + " " + label + '">+</button></div></li>';
    }).join("");
    var waBtn = document.getElementById("wa-primary");
    waBtn.textContent = cfg.whatsappNumber ? d.sendWa : d.copyWa;
    document.getElementById("checkout-hint").textContent = cfg.orderSiteUrl ? d.checkoutReady : d.checkoutSoon;
  }

  function setLocale(next) {
    locale = next;
    localStorage.setItem(KEY, locale);
    apply();
  }

  function buildMessage() {
    var d = t();
    var day = runId === "sunday" ? d.deliverySun : d.deliveryThu;
    var due = runId === "sunday" ? d.dueFri : d.dueTue;
    var name = document.getElementById("f-name").value.trim();
    var area = document.getElementById("f-area").value.trim();
    var servings = document.getElementById("f-servings").value.trim() || "1";
    var notes = document.getElementById("f-notes").value.trim();
    function fill(s, map) {
      return s.replace(/\{(\w+)\}/g, function (_, k) { return map[k] || ""; });
    }
    var lines = [
      fill(d.msgHello, { host: cfg.host, name: cfg.siteName }),
      "",
      d.msgName + ": " + (name || d.addName),
      d.msgArea + ": " + (area || d.addArea),
      d.msgHouse + ": " + servings,
      d.msgDelivery + ": " + day + " (" + d.msgOrderBy + " " + due + ")",
      "",
      planOn ? d.msgPlanYes + " — $" + cfg.weeklyPlanPrice : d.msgPlanNo
    ];
    var chosen = dishes.filter(function (x) { return (qty[x.id] || 0) > 0; });
    if (chosen.length) {
      lines.push("", d.msgItems + ":");
      chosen.forEach(function (x) {
        lines.push("- " + x.name[locale] + " × " + qty[x.id] + " ($" + x.price + " " + d.msgEach + ")");
      });
    }
    if (notes) lines.push("", d.msgNotes + ": " + notes);
    lines.push("", fill(d.msgConfirm, { day: day, due: due }));
    return lines.join("\n");
  }

  function copyMsg(text) {
    if (typeof text !== "string") text = buildMessage();
    var d = t();
    function done() {
      var b = document.getElementById("copy-msg");
      b.innerHTML = d.copied;
      setTimeout(function () { apply(); }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { window.prompt(d.copyMsg, text); });
    } else {
      window.prompt(d.copyMsg, text);
    }
  }

  function sendWa(text) {
    if (typeof text !== "string") text = buildMessage();
    if (cfg.whatsappNumber) {
      window.open("https://wa.me/" + cfg.whatsappNumber + "?text=" + encodeURIComponent(text), "_blank", "noopener");
    } else {
      copyMsg();
    }
  }

  function openOrder() { document.getElementById("order").classList.add("open"); }
  function closeOrder() { document.getElementById("order").classList.remove("open"); }

  document.addEventListener("click", function (e) {
    var loc = e.target.closest("[data-locale]");
    if (loc) setLocale(loc.getAttribute("data-locale"));
    if (e.target.closest("[data-open-order]")) openOrder();
    if (e.target.closest("[data-close-order]")) closeOrder();
    var chip = e.target.closest("[data-filter]");
    if (chip) { filter = chip.getAttribute("data-filter"); renderDishes(); }
    var plus = e.target.closest("[data-plus]");
    if (plus) { var id = plus.getAttribute("data-plus"); qty[id] = (qty[id] || 0) + 1; renderOrderLabels(); }
    var minus = e.target.closest("[data-minus]");
    if (minus) { var id2 = minus.getAttribute("data-minus"); qty[id2] = Math.max(0, (qty[id2] || 0) - 1); renderOrderLabels(); }
    var run = e.target.closest("[data-run]");
    if (run) {
      runId = run.getAttribute("data-run");
      document.querySelectorAll("[data-run]").forEach(function (b) {
        b.classList.toggle("active", b.getAttribute("data-run") === runId);
      });
    }
  });

  document.getElementById("menu-btn").addEventListener("click", function () {
    var m = document.getElementById("nav-mob");
    m.classList.toggle("open");
  });
  document.getElementById("nav-mob").addEventListener("click", function (e) {
    if (e.target.tagName === "A" || e.target.closest("[data-open-order]")) {
      document.getElementById("nav-mob").classList.remove("open");
    }
  });
  document.getElementById("plan-check").addEventListener("change", function (e) {
    planOn = e.target.checked;
  });
  /* Online ordering (js/order-live.js) takes over these buttons when the kitchen is reachable;
     otherwise this WhatsApp flow is the legacy fallback. */
  function live() { return window.HCC_LIVE && window.HCC_LIVE.active ? window.HCC_LIVE : null; }
  document.getElementById("wa-primary").addEventListener("click", function () { live() ? live().primary() : sendWa(); });
  document.getElementById("copy-msg").addEventListener("click", function () { live() ? live().whatsapp() : copyMsg(); });

  window.HCC_SITE = { locale: function () { return locale; }, sendWa: sendWa, onApply: null };
  apply();
})();
