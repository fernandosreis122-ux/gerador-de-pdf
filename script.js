const items = [];
const $ = id => document.getElementById(id);
const TEXT_EXT = /\.(txt|md|csv|json|html?|css|js|xml|log|ts|tsx|jsx|yml|yaml)$/i;
const msg = (t, err) => { $('msg').textContent = t; $('msg').className = err ? 'err' : ''; };

function render() {
  const ul = $('list');
  ul.innerHTML = '';
  items.forEach((it, i) => {
    const li = document.createElement('li');
    const thumb = it.kind === 'img'
      ? Object.assign(document.createElement('img'), { src: it.data, alt: '' })
      : Object.assign(document.createElement('div'), { className: 'ico', textContent: 'TXT' });
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = it.name;
    const small = document.createElement('small');
    small.textContent = it.kind === 'img' ? 'Imagem' : it.text.length + ' caracteres';
    nm.appendChild(small);
    li.append(thumb, nm);
    [['↑', -1], ['↓', 1]].forEach(([s, d]) => {
      const b = document.createElement('button');
      b.className = 'mv'; b.textContent = s; b.setAttribute('aria-label', d < 0 ? 'Subir' : 'Descer');
      b.onclick = () => { const j = i + d; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; render(); };
      li.appendChild(b);
    });
    const rm = document.createElement('button');
    rm.className = 'mv'; rm.textContent = 'Remover';
    rm.onclick = () => { items.splice(i, 1); render(); };
    li.appendChild(rm);
    ul.appendChild(li);
  });
  $('empty').style.display = items.length ? 'none' : 'block';
  $('gen').disabled = !items.length;
}

const readAs = (f, how) => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = () => no(r.error);
  how === 'text' ? r.readAsText(f) : r.readAsDataURL(f);
});

async function addFiles(files) {
  let skipped = 0;
  for (const f of files) {
    try {
      if (f.type.startsWith('image/')) items.push({ kind: 'img', name: f.name, data: await readAs(f, 'url') });
      else if (f.type.startsWith('text/') || TEXT_EXT.test(f.name)) items.push({ kind: 'txt', name: f.name, text: await readAs(f, 'text') });
      else skipped++;
    } catch (e) { skipped++; }
  }
  render();
  skipped ? msg(skipped + ' arquivo(s) não suportado(s) foram ignorados.', true) : msg('');
}

const drop = $('drop');
$('file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });

$('addTxt').onclick = () => {
  const t = $('txt').value.trim();
  if (!t) return msg('Escreva algum texto antes de adicionar.', true);
  items.push({ kind: 'txt', name: 'Texto digitado ' + (items.filter(i => i.name.startsWith('Texto digitado')).length + 1), text: t });
  $('txt').value = ''; msg(''); render();
};

function loadImg(src) {
  return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
}

$('gen').onclick = async () => {
  if (!window.jspdf) return msg('A biblioteca jsPDF não carregou. Verifique sua conexão e recarregue.', true);
  $('gen').disabled = true; msg('Gerando PDF...');
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: $('size').value, orientation: $('orient').value });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 18;
    const fs = Math.min(24, Math.max(8, +$('fs').value || 12));
    const lh = fs * 0.3528 * 1.4;
    let first = true;
    const page = () => { if (!first) doc.addPage(); first = false; };

    for (const it of items) {
      page();
      let y = M;
      if (it.kind === 'txt') {
        if ($('titles').checked) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(fs + 4);
          doc.text(doc.splitTextToSize(it.name, W - 2 * M), M, y + 4);
          y += lh + 8;
        }
        doc.setFont('helvetica', 'normal'); doc.setFontSize(fs);
        const lines = doc.splitTextToSize(it.text.replace(/\t/g, '    ').replace(/\r/g, ''), W - 2 * M);
        for (const ln of lines) {
          if (y > H - M) { doc.addPage(); y = M; }
          doc.text(ln, M, y + 4);
          y += lh;
        }
      } else {
        const im = await loadImg(it.data);
        const c = document.createElement('canvas');
        c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0);
        const r = Math.min((W - 2 * M) / c.width, (H - 2 * M) / c.height);
        const w = c.width * r, h = c.height * r;
        doc.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, (H - h) / 2, w, h);
      }
    }
    doc.save('documento.pdf');
    msg('PDF gerado. Verifique sua pasta de downloads.');
  } catch (e) {
    console.error(e);
    msg('Não foi possível gerar o PDF. Tente remover o último item adicionado.', true);
  }
  $('gen').disabled = !items.length;
};

render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
