/* FS25 -> FS26 doku dönüştürücü arayüzü (fsconv.js gerektirir, JSZip varsa mod .zip'i de işler) */
(function () {
  'use strict';
  const css = `
#convModal .auth-box{max-width:560px}
#convModal h2{margin-top:0}
#convModal .cv-lead{font-size:14px;color:#b9c2b3;margin:0 0 12px;line-height:1.5}
#cvDrop{display:block;border:2px dashed #526052;border-radius:12px;padding:26px 14px;text-align:center;cursor:pointer;color:#d7dfd0;background:#0c100d;transition:border-color .15s,background .15s}
#cvDrop.over,#cvDrop:hover{border-color:#a6c400;background:#141a10}
#cvDrop b{display:block;font-size:16px;margin-bottom:4px}
#cvDrop small{color:#9aa294}
#cvFile{display:none}
.cv-opts{margin:12px 0 4px;display:grid;gap:8px}
.cv-opts label{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:#e3e9dd;cursor:pointer}
.cv-opts input{width:auto!important;margin:3px 0 0!important;flex:none}
.cv-opts span small{display:block;color:#9aa294;font-size:12px}
#cvGo{display:block;width:100%;margin-top:12px;padding:13px;border:0;border-radius:8px;background:#7d9000;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
#cvGo:disabled{opacity:.5;cursor:default}
#cvBar{height:8px;border-radius:4px;background:#252b21;margin-top:14px;overflow:hidden;display:none}
#cvBar i{display:block;height:100%;width:0;background:#a6c400;transition:width .1s}
#cvLog{margin:10px 0 0;padding:0;list-style:none;font-size:13px;color:#c9d2c2;max-height:190px;overflow:auto}
#cvLog li{padding:5px 0;border-bottom:1px solid #2e332b;display:flex;justify-content:space-between;gap:10px}
#cvLog li.err{color:#ff8a7a}
#cvLog li.warn{color:#f0b24a}
#cvLog em{font-style:normal;color:#9aa294;white-space:nowrap}
#cvOut{margin-top:12px;display:grid;gap:8px}
#cvOut a{display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:8px;background:#7d9000;color:#fff;text-decoration:none;font-weight:700;font-size:14px;word-break:break-all}
#cvOut canvas{max-width:72px;max-height:48px;border-radius:4px;background:#333;flex:none}
.cv-note{font-size:12px;color:#9aa294;margin:12px 0 0;line-height:1.5}
`;
  const html = `
<div id="convModal" class="auth-modal" hidden>
  <div class="auth-box">
    <button id="closeConv" aria-label="Kapat">✕</button>
    <h2>FS25 → FS26 Doku Dönüştürücü</h2>
    <p class="cv-lead">.dds veya .png dokularını FS26'nın .ast biçimine çevirir. Tüm mod .zip dosyasını da yükleyebilirsin: içindeki .dds dosyaları .ast olur, diğer dosyalar aynen kalır. Her şey tarayıcında çalışır, dosyaların yüklenmez.</p>
    <label id="cvDrop" for="cvFile"><b>Dosyaları seç veya buraya bırak</b><small>.zip, .dds, .png, .jpg, .webp</small></label>
    <input id="cvFile" type="file" multiple accept=".zip,.dds,.png,.jpg,.jpeg,.webp">
    <div class="cv-opts">
      <label><input type="checkbox" id="cvMips" checked><span>Mipmap oluştur<small>Doku dosyaları için önerilir. İkonlar her zaman mipsiz yazılır.</small></span></label>
      <label><input type="checkbox" id="cvSpec" checked><span>Specular haritalarını en fazla 512 px yap<small>Örnek FS26 paketinde böyle küçültülmüş.</small></span></label>
      <label><input type="checkbox" id="cvIcon" checked><span>Mağaza ikonlarını 512 px yap<small>iconFilename ve store ikonları.</small></span></label>
    </div>
    <button id="cvGo" disabled>Dönüştür</button>
    <div id="cvBar"><i></i></div>
    <ul id="cvLog"></ul>
    <div id="cvOut"></div>
    <p class="cv-note">Büyük dokular (2048 px) birkaç saniye sürebilir. Sonucu oyunda denemeden yayınlama; .ast başlığındaki 16 baytlık kimlik alanının anlamı belgelenmemiştir.</p>
  </div>
</div>`;

  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend', html);

  const $ = id => document.getElementById(id);
  const modal = $('convModal'), fileIn = $('cvFile'), go = $('cvGo'), bar = $('cvBar'), log = $('cvLog'), out = $('cvOut'), drop = $('cvDrop');
  let files = [], busy = false;

  // menü bağlantısı
  const nav = document.getElementById('nav');
  if (nav) {
    const a = document.createElement('a'); a.href = '#'; a.id = 'navConv';
    a.innerHTML = '<i class="nico">🔄</i> Dönüştürücü';
    const contact = [...nav.querySelectorAll('a')].find(x => x.getAttribute('href') === '#contact');
    nav.insertBefore(a, contact || null);
    a.addEventListener('click', e => { e.preventDefault(); modal.hidden = false; const c = document.getElementById('nav'); if (c) c.classList.remove('open'); });
  }
  $('closeConv').addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });

  function setFiles(list) {
    files = [...list];
    drop.querySelector('b').textContent = files.length ? files.length + ' dosya seçildi' : 'Dosyaları seç veya buraya bırak';
    drop.querySelector('small').textContent = files.length ? files.map(f => f.name).slice(0, 3).join(', ') + (files.length > 3 ? '…' : '') : '.zip, .dds, .png, .jpg, .webp';
    go.disabled = !files.length || busy;
  }
  fileIn.addEventListener('change', () => setFiles(fileIn.files));
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => setFiles(e.dataTransfer.files));

  function addLog(text, cls, note) {
    const li = document.createElement('li'); if (cls) li.className = cls;
    li.innerHTML = '<span></span><em></em>'; li.firstChild.textContent = text; li.lastChild.textContent = note || '';
    log.appendChild(li); log.scrollTop = log.scrollHeight; return li;
  }
  const setBar = p => { bar.firstChild.style.width = Math.round(p * 100) + '%'; };
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
  const base = p => p.split('/').pop();

  async function imageToRGBA(file) {                       // PNG/JPG/WEBP
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let alpha = false; for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) { alpha = true; break; }
    return { rgba: d, width: c.width, height: c.height, hasAlpha: alpha };
  }

  // Tek doku -> {bytes,width,height,...}
  async function convertTexture(name, bytes, kind, onProg) {
    const lower = name.toLowerCase();
    const src = lower.endsWith('.dds') ? FSConv.decodeDDS(bytes) : await imageToRGBA(new Blob([bytes]));
    const opt = { channels: src.hasAlpha ? 4 : 3, onProgress: onProg };
    if (kind === 'icon' && $('cvIcon').checked) { opt.maxSize = 512; opt.mips = false; }
    else if (kind === 'icon') opt.mips = false;
    else {
      opt.mips = $('cvMips').checked;
      if (kind === 'spec' && $('cvSpec').checked) opt.maxSize = 512;
    }
    const r = await FSConv.encodeAST(src.rgba, src.width, src.height, opt);
    r.srcW = src.width; r.srcH = src.height; return r;
  }

  function kindOf(path, icons) {
    const b = base(path).toLowerCase();
    if (icons.has(path.toLowerCase()) || /^(icon|store)/.test(b)) return 'icon';
    if (/(specular|_spec(\.|_))/.test(b)) return 'spec';
    return 'tex';
  }
  function findIcons(texts) {
    const set = new Set(), re = /<(?:iconFilename|image|imageFilename)[^>]*>\s*([^<]+?\.dds)\s*</gi, re2 = /(?:iconFilename|image|imageFilename)\s*=\s*"([^"]+?\.dds)"/gi;
    for (const t of texts) { let m; while ((m = re.exec(t))) set.add(m[1].replace(/^\.?\//, '').toLowerCase()); while ((m = re2.exec(t))) set.add(m[1].replace(/^\.?\//, '').toLowerCase()); }
    return set;
  }

  function addDownload(name, blob, thumb) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    if (thumb) a.appendChild(thumb);
    a.appendChild(document.createTextNode('⬇ ' + name + ' (' + kb(blob.size) + ')')); out.appendChild(a);
  }
  function thumbOf(bytes) {
    try {
      const d = FSConv.decodeAST(bytes), c = document.createElement('canvas'), k = Math.min(1, 96 / Math.max(d.width, d.height));
      const full = document.createElement('canvas'); full.width = d.width; full.height = d.height;
      full.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d.rgba), d.width, d.height), 0, 0);
      c.width = Math.max(1, Math.round(d.width * k)); c.height = Math.max(1, Math.round(d.height * k));
      c.getContext('2d').drawImage(full, 0, 0, c.width, c.height); return c;
    } catch (e) { return null; }
  }

  async function run() {
    busy = true; go.disabled = true; log.innerHTML = ''; out.innerHTML = ''; bar.style.display = 'block'; setBar(0);
    try {
      for (const f of files) {
        const n = f.name, lower = n.toLowerCase();
        if (lower.endsWith('.zip')) await runZip(f);
        else if (/\.(dds|png|jpe?g|webp)$/.test(lower)) {
          const li = addLog(n, '', 'işleniyor…');
          try {
            const buf = new Uint8Array(await f.arrayBuffer());
            const kind = /^(icon|store)/.test(lower) ? 'icon' : /specular|_spec/.test(lower) ? 'spec' : 'tex';
            const r = await convertTexture(n, buf, kind, setBar);
            const astName = n.replace(/\.[^.]+$/, '') + '.ast';
            li.lastChild.textContent = `${r.width}×${r.height}, ${r.mips} mip, ${kb(r.bytes.length)}`;
            addDownload(astName, new Blob([r.bytes], { type: 'application/octet-stream' }), thumbOf(r.bytes));
          } catch (e) { li.className = 'err'; li.lastChild.textContent = e.message; }
        } else addLog(n, 'warn', 'desteklenmeyen tür, atlandı');
      }
    } finally { setBar(1); busy = false; go.disabled = !files.length; }
  }

  async function runZip(file) {
    if (typeof JSZip === 'undefined') { addLog(file.name, 'err', 'JSZip yüklenemedi'); return; }
    const head = addLog(file.name, '', 'açılıyor…');
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files).filter(e => !e.dir);
    const xmls = []; for (const e of entries) if (/\.xml$/i.test(e.name)) xmls.push(await e.async('string'));
    const icons = findIcons(xmls);
    const dds = entries.filter(e => /\.dds$/i.test(e.name));
    head.lastChild.textContent = dds.length + ' .dds bulundu';
    if (!dds.length) { head.className = 'warn'; head.lastChild.textContent = 'içinde .dds yok'; return; }
    let i = 0, fail = 0;
    for (const e of dds) {
      const li = addLog(e.name, '', 'işleniyor…');
      try {
        const buf = await e.async('uint8array'), kind = kindOf(e.name, icons);
        const r = await convertTexture(e.name, buf, kind, p => setBar((i + p) / dds.length));
        zip.remove(e.name);
        zip.file(e.name.replace(/\.dds$/i, '.ast'), r.bytes);
        li.lastChild.textContent = `${r.srcW}×${r.srcH} → ${r.width}×${r.height}, ${r.mips} mip, ${kb(r.bytes.length)}`;
      } catch (err) { fail++; li.className = 'err'; li.lastChild.textContent = err.message + ' (.dds korundu)'; }
      i++; setBar(i / dds.length);
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const name = /fs25/i.test(file.name) ? file.name.replace(/fs25/i, 'FS26') : file.name.replace(/\.zip$/i, '') + '_FS26.zip';
    addDownload(name, blob);
    if (fail) addLog(fail + ' dosya dönüştürülemedi', 'warn', 'zip içinde .dds olarak kaldı');
  }

  go.addEventListener('click', () => { if (!busy && files.length) run(); });
})();
