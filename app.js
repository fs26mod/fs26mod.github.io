const SUPABASE_URL = "https://tvnqnhmidlcixzmzorgf.supabase.co";
const SUPABASE_KEY = "sb_publishable_EQjBl66xjKHFfYtEXv5-og_rNchltsD";
const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
console.log("FS MOD Supabase bağlantısı hazır!");
const search = document.getElementById('search');
const cards = [...document.querySelectorAll('.mod-card')];
const cats = [...document.querySelectorAll('.cat')];
const platforms = [...document.querySelectorAll('.platform-filter')];
const games = [...document.querySelectorAll('.game-filter')];

const count = document.getElementById('resultCount');
const empty = document.getElementById('empty');
const toast = document.getElementById('toast');

let category = 'Tümü';
let platform = 'Tümü';
let game = 'Tümü';
let toastTimer;

function filterMods() {
  const q = search.value.trim().toLocaleLowerCase('tr');
  let shown = 0;

  cards.forEach(card => {
    const name = (card.dataset.name || '').toLocaleLowerCase('tr');

    const matchesText = name.includes(q);
    const matchesCat =
      category === 'Tümü' || card.dataset.category === category;
    const matchesPlatform =
      platform === 'Tümü' || card.dataset.platform === platform;
    const matchesGame =
      game === 'Tümü' || card.dataset.game === game;

    const visible =
      matchesText && matchesCat && matchesPlatform && matchesGame;

    card.hidden = !visible;

    if (visible) shown++;
  });

  count.textContent = `${shown} örnek mod`;
  empty.hidden = shown !== 0;
}

search.addEventListener('input', filterMods);

document.getElementById('searchBtn')
  .addEventListener('click', filterMods);

cats.forEach(btn => {
  btn.addEventListener('click', () => {
    category = btn.dataset.category;

    cats.forEach(x =>
      x.classList.toggle('selected', x === btn)
    );

    filterMods();
  });
});

platforms.forEach(btn => {
  btn.addEventListener('click', () => {
    platform = btn.dataset.platform;

    platforms.forEach(x =>
      x.classList.toggle('active', x === btn)
    );

    filterMods();
  });
});

games.forEach(btn => {
  btn.addEventListener('click', () => {
    game = btn.dataset.game;

    games.forEach(x =>
      x.classList.toggle('active', x === btn)
    );

    filterMods();
  });
});

document.querySelectorAll('.download').forEach(btn => {
  btn.addEventListener('click', () => {
    toast.textContent =
      `${btn.dataset.title}: Bu örnek karttır. Gerçek mod dosyası henüz eklenmedi.`;

    toast.classList.add('show');

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 3600);
  });
});

document.getElementById('menuToggle')
  .addEventListener('click', () => {
    document.getElementById('nav').classList.toggle('open');
  });

document.querySelectorAll('#nav a').forEach(a => {
  a.addEventListener('click', () => {
    document.getElementById('nav').classList.remove('open');
  });
});

filterMods();

const authModal = document.getElementById("authModal");
const authTitle = document.getElementById("authTitle");
const authForm = document.getElementById("authForm");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authSubmit = document.getElementById("authSubmit");
const authMessage = document.getElementById("authMessage");

let authMode = "login";

document.getElementById("loginBtn").addEventListener("click", () => {
  authMode = "login";
  authTitle.textContent = "Giriş Yap";
  authSubmit.textContent = "Giriş Yap";
  authMessage.textContent = "";
  authModal.hidden = false;
});

document.getElementById("registerBtn").addEventListener("click", () => {
  authMode = "register";
  authTitle.textContent = "Kayıt Ol";
  authSubmit.textContent = "Kayıt Ol";
  authMessage.textContent = "";
  authModal.hidden = false;
});

document.getElementById("closeAuth").addEventListener("click", () => {
  authModal.hidden = true;
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = authEmail.value.trim();
  const password = authPassword.value;

  authSubmit.disabled = true;
  authMessage.textContent = "İşlem yapılıyor...";

  try {
    const result = authMode === "register"
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });

    if (result.error) throw result.error;

    authMessage.textContent = authMode === "register"
      ? "Kayıt başarılı! E-postanı kontrol et."
      : "Giriş başarılı!";

    if (authMode === "login") {
      setTimeout(() => authModal.hidden = true, 1200);
    }
  } catch (error) {
    authMessage.textContent = "Hata: " + error.message;
  } finally {
    authSubmit.disabled = false;
  }
});
