const items = [];
const $ = id => document.getElementById(id);
const TEXT_EXT = /\.(txt|md|csv|json|html?|css|js|xml|log|ts|tsx|jsx|yml|yaml)$/i;
const fmt = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

let tt;
function toast(t, err) {
  const el = $('toast');
  el.textContent = t; el.className = 'show' + (err ? ' err' : '');
  clearTimeout(tt); tt = setTimeout(() => el.className = '', 3200);
}

function btn(label, cls, aria, fn) {
  const b = document.createElement('button');
  b.className = 'x ' + cls; b.textContent = label; b.setAttribute('aria-label', aria); b.onclick = fn;
  return b;
}

function render() {
  const ul = $('list');
  ul.innerHTML = '';
  items.forEach((it, i) => {
    const li = document.createElement('li');
    const th = it.kind === 'img'
      ? Object.assign(document.createElement('img'), { src: it.data, alt: '' })
      : Object.assign(document.createElement('div'), { className: 'ico', textContent: 'TXT' });
    const nm = document.createElement('div');
    nm.className = 'nm'; nm.textContent = it.name;
    const sm = document.createElement('small');
    sm.textContent = it.kind === 'img' ? 'Imagem · ' + fmt(it.size) : it.text.length.toLocaleString('pt-BR') + ' caracteres';
    nm.appendChild(sm);
    li.append(th, nm,
      btn('↑', '', 'Subir', () => move(i, -1)),
      btn('↓', '', 'Descer', () => move(i, 1)),
      btn('✕', 'del', 'Remover', () => { items.splice(i, 1); render(); }));
    ul.appendChild(li);
  });
  $('count').textContent = items.length;
  $('empty').hidden = items.length > 0;
  $('clear').hidden = !items.length;
  $('gen').disabled = !items.length;
}

function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]]; render();
}

const readAs = (f, how) => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(r.result); r.onerror = () => no(r.error);
  how === 'text' ? r.readAsText(f) : r.readAsDataURL(f);
});

async function addFiles(files) {
  let skipped = 0, added = 0;
  for (const f of files) {
    try {
      if (f.type.startsWith('image/')) items.push({ kind: 'img', name: f.name, size: f.size, data: await readAs(f, 'url') });
      else if (f.type.startsWith('text/') || TEXT_EXT.test(f.name)) items.push({ kind: 'txt', name: f.name, text: await readAs(f, 'text') });
      else { skipped++; continue; }
      added++;
    } catch (e) { skipped++; }
  }
  render();
  if (skipped) toast(skipped + ' arquivo(s) não suportado(s) ignorado(s).', true);
  else if (added) toast(added + ' item(ns) adicionado(s).');
}

const drop = $('drop');
$('file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });

$('addTxt').onclick = () => {
  const t = $('txt').value.trim();
  if (!t) return toast('Escreva algum texto antes de adicionar.', true);
  const n = items.filter(i => i.name.startsWith('Texto digitado')).length + 1;
  items.push({ kind: 'txt', name: 'Texto digitado ' + n, text: t });
  $('txt').value = ''; render(); toast('Texto adicionado.');
};

$('clear').onclick = () => { if (confirm('Remover todos os itens?')) { items.length = 0; render(); } };

const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });

$('gen').onclick = async () => {
  if (!window.jspdf) return toast('A biblioteca jsPDF não carregou. Conecte-se à internet uma vez e recarregue.', true);
  const g = $('gen'), label = g.textContent;
  g.disabled = true;
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: $('size').value, orientation: $('orient').value });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 18;
    const fs = Math.min(24, Math.max(8, +$('fs').value || 12));
    const lh = fs * 0.3528 * 1.4;
    let first = true;
    for (const [n, it] of items.entries()) {
      g.textContent = 'Gerando ' + (n + 1) + ' de ' + items.length + '...';
      await new Promise(r => setTimeout(r));
      if (!first) doc.addPage();
      first = false;
      let y = M;
      if (it.kind === 'txt') {
        if ($('titles').checked) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(fs + 4);
          doc.text(doc.splitTextToSize(it.name, W - 2 * M), M, y + 4);
          y += lh + 8;
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
        for (const ln of doc.splitTextToSize(it.text.replace(/\t/g, '    ').replace(/\r/g, ''), W - 2 * M)) {
          if (y > H - M) { doc.addPage(); y = M; }
          doc.text(ln, M, y + 4); y += lh;
        }
      } else {
        const im = await loadImg(it.data);
        const c = document.createElement('canvas');
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        const cx = c.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(im, 0, 0);
        const r = Math.min((W - 2 * M) / c.width, (H - 2 * M) / c.height);
        const w = c.width * r, h = c.height * r;
        doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, (H - h) / 2, w, h);
      }
    }
    const nome = ($('name').value.trim() || 'documento').replace(/[\\/:*?"<>|]+/g, '-');
    showResult(doc.output('blob'), nome + '.pdf');
    toast('PDF gerado!');
  } catch (e) {
    console.error(e);
    toast('Não foi possível gerar o PDF. Tente remover o último item.', true);
  }
  g.textContent = label; g.disabled = !items.length;
};

let pdfFile;
function showResult(blob, fileName) {
  pdfFile = new File([blob], fileName, { type: 'application/pdf' });
  $('resInfo').textContent = fileName + ' · ' + fmt(pdfFile.size);
  $('share').hidden = !(navigator.canShare && navigator.canShare({ files: [pdfFile] }));
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('dl').onclick = () => {
  if (!pdfFile) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(pdfFile); a.download = pdfFile.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

$('share').onclick = async () => {
  if (!pdfFile) return;
  try { await navigator.share({ files: [pdfFile], title: pdfFile.name }); }
  catch (e) { if (e.name !== 'AbortError') toast('Não foi possível compartilhar. Use o botão Baixar.', true); }
};

let deferred;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('install').hidden = false; });
$('install').onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('install').hidden = true; };
window.addEventListener('appinstalled', () => { $('install').hidden = true; toast('App instalado!'); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
render();
