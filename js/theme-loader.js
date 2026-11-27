import { db, auth } from "./firebase.js";
import { collection, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

const DEFAULT_THEME = "midnight-blue";
const THEME_KEY = "cruz_theme";

const VALID_THEMES = new Set(["black-gold","royal-purple","midnight-blue","emerald-forest","crimson-obsidian","cyber-neon","sunset-copper","slate-graphite","arctic-light","ivory-gold-light","rose-quartz","lavender-mist","mint-cream","peach-sorbet","cotton-candy","aurora-dream"]);
function normalizeTheme(name){ return VALID_THEMES.has(name) ? name : DEFAULT_THEME; }
function normalizeSavedTheme(name){ return VALID_THEMES.has(name) ? name : null; }
export function applyTheme(name) {
  const theme = normalizeTheme(name);
  document.documentElement.setAttribute("data-theme", theme);
  document.body?.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_KEY, theme);
}

const saved = localStorage.getItem(THEME_KEY);
applyTheme(saved || DEFAULT_THEME);

async function syncTheme() {
  try {
    const snapshot = await getDoc(doc(db, "settings", "business"));
    const raw = snapshot.exists() ? snapshot.data().appTheme : null;
    if (VALID_THEMES.has(raw)) {
      applyTheme(raw);
      const dropdown = document.getElementById("appTheme");
      if (dropdown) dropdown.value = raw;
    }
  } catch (error) {
    console.error("Could not load application theme:", error);
  }
}

syncTheme();

onAuthStateChanged(auth, () => {
  syncTheme();
});

onSnapshot(doc(db, "settings", "business"), snapshot => {
  const raw = snapshot.exists() ? snapshot.data().appTheme : null;
  if (VALID_THEMES.has(raw)) {
    applyTheme(raw);
    const dropdown = document.getElementById("appTheme");
    if (dropdown) dropdown.value = raw;
  }
}, error => console.warn("Theme sync listener error:", error?.message || error));
/* Spotlight hover tracking for supported themes */
(function(){
  const themes = new Set(['royal-purple','rose-quartz','cotton-candy']);
  function onMove(e){
    const t = document.documentElement.getAttribute('data-theme');
    if(!themes.has(t)) return;
    const card = e.target.closest('.content-card,.stat-card,.cmh-panel');
    if(!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX-r.left)/r.width*100)+'%');
    card.style.setProperty('--my', ((e.clientY-r.top)/r.height*100)+'%');
  }
  document.addEventListener('pointermove', onMove, {passive:true});
})();

let _notifBadgesStarted=false;
function initNotificationBadges(user) {
  if (_notifBadgesStarted) return;
  _notifBadgesStarted = true;
  const links = document.querySelectorAll('a[href="notifications.html"].side-link');
  if (!links.length || !user) return;
  onSnapshot(collection(db, "notifications"), snapshot => {
    const unread = snapshot.docs.map(d => d.data()).filter(n => n.businessId === "cruz-mobile-hub" && n.read !== true).length;
    links.forEach(link => {
      let badge = link.querySelector('.nav-badge');
      if (unread > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'nav-badge'; link.appendChild(badge); }
        badge.textContent = unread > 99 ? '99+' : String(unread);
      } else if (badge) badge.remove();
    });
  }, err => console.warn('Notification badge error:', err?.message || err));
}

onAuthStateChanged(auth, user => { if (user) initNotificationBadges(user); });
/* Page intro logo animation */
(function initPageIntro(){
  try {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (document.getElementById("cmh-page-intro")) return;
    const intro = document.createElement("div");
    intro.id = "cmh-page-intro";
    intro.setAttribute("aria-hidden", "true");
    intro.innerHTML = `<div class="cmh-page-intro-inner"><img src="images/cruz1.png" alt="" class="cmh-page-intro-logo"></div>`;
    document.body.appendChild(intro);
    const remove = () => { if (!intro.isConnected) return; intro.classList.add("is-hide"); setTimeout(() => intro.remove(), 500); };

    window.addEventListener("load", () => setTimeout(remove, 1700), { once: true });
    setTimeout(remove, 3000); // fallback
  } catch (e) { /* ignore */ }
})();