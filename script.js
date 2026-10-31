/* ============================================================
   PDF.studio — app logic
   ============================================================ */

const $ = (id) => document.getElementById(id);
const items = [];
const TEXT_EXT = /\.(txt|md|csv|json|html?|css|js|xml|log|ts|tsx|jsx|yml|yaml)$/i;
const MAX_IMAGE_SIDE = 2200;

const fmt = (n) =>
  n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/* ---------- Toast ------------------------------------------ */
let toastTimer;
function toast(message, isError) {
  const el = $('toast');
  el.textContent = message;
  el.className = 'show' + (isError ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ''), 3200);
}

/* ---------- Theme ------------------------------------------ */
const themeMeta = document.querySelector('meta[name="theme-color"]');
let hasThemePref = false;
try { hasThemePref = !!localStorage.getItem('pdf-theme'); } catch (e) {}

function applyTheme(theme, persist = true) {
  document.documentElement.dataset.theme = theme;
  themeMeta.setAttribute('content', theme === 'dark' ? '#080b14' : '#f4f5fb');
  $('theme').setAttribute('aria-label', theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro');
  if (persist) {
    hasThemePref = true;
    try { localStorage.setItem('pdf-theme', theme); } catch (e) {}
  }
}

$('theme').addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

const darkQuery = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
if (darkQuery && darkQuery.addEventListener) {
  darkQuery.addEventListener('change', (e) => {
    if (!hasThemePref) applyTheme(e.matches ? 'dark' : 'light', false);
  });
}
applyTheme(document.documentElement.dataset.theme || 'light', false);

/* ---------- Icons ------------------------------------------ */
const ICONS = {
  grip: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>',
  up: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m0 0-5 5m5-5 5 5"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14m0 0 5-5m-5 5-5-5"/></svg>',
  del: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/><path d="M10 11v5M14 11v5"/></svg>',
};

function actionButton(icon, label, onClick, extraClass = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mini ' + extraClass;
  b.innerHTML = ICONS[icon];
  b.setAttribute('aria-label', label);
  b.title = label;
  b.addEventListener('click', onClick);
  return b;
}

/* ---------- Render ----------------------------------------- */
function extension(name) {
  const parts = name.split('.');
  return (parts.length > 1 ? parts.pop() : 'TXT').slice(0, 4).toUpperCase();
}

function render() {
  const ul = $('list');
  ul.innerHTML = '';

  items.forEach((item, index) => {
    const li = document.createElement('li');
    li.draggable = true;
    li.dataset.index = index;

    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.innerHTML = ICONS.grip;
    grip.setAttribute('aria-hidden', 'true');

    let media;
    if (item.kind === 'img') {
      media = document.createElement('img');
      media.className = 'thumb';
      media.src = item.data;
      media.alt = '';
      media.loading = 'lazy';
    } else {
      media = document.createElement('div');
      media.className = 'ico';
      media.textContent = extension(item.name);
      media.setAttribute('aria-hidden', 'true');
    }

    const name = document.createElement('div');
    name.className = 'nm';
    name.textContent = item.name;
    name.title = item.name;
    const meta = document.createElement('small');
    meta.textContent =
      item.kind === 'img'
        ? 'Imagem · ' + fmt(item.size)
        : item.text.length.toLocaleString('pt-BR') + ' caracteres';
    name.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'item-actions';
    actions.append(
      actionButton('up', 'Subir', () => move(index, -1)),
      actionButton('down', 'Descer', () => move(index, 1)),
      actionButton('del', 'Remover', () => { items.splice(index, 1); render(); }, 'del')
    );

    li.append(grip, media, name, actions);
    attachDrag(li, index);
    ul.appendChild(li);
  });

  const total = items.length;
  $('count').textContent = total;
  $('empty').hidden = total > 0;
  $('clear').hidden = total === 0;
  $('orderHint').textContent =
    total > 1 ? 'Arraste para reorganizar as páginas' : 'Cada item vira uma página';
  updateBar();
}

function updateBar() {
  const total = items.length;
  $('barCount').textContent = total === 1 ? '1 item' : total + ' itens';
  $('barHint').textContent = total ? 'Pronto para gerar seu PDF' : 'Adicione arquivos para começar';
  document.querySelector('.bar-dot').classList.toggle('ready', total > 0);
  $('gen').disabled = total === 0 || busy;
}

function move(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
  render();
}

/* ---------- Drag to reorder -------------------------------- */
let dragFrom = null;

function attachDrag(li, index) {
  li.addEventListener('dragstart', (event) => {
    dragFrom = index;
    li.classList.add('dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  });
  li.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    li.classList.add('drag-over');
  });
  li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
  li.addEventListener('drop', (event) => {
    event.preventDefault();
    li.classList.remove('drag-over');
    if (dragFrom === null || dragFrom === index) return;
    const [moved] = items.splice(dragFrom, 1);
    items.splice(index, 0, moved);
    dragFrom = null;
    render();
  });
  li.addEventListener('dragend', () => {
    dragFrom = null;
    document.querySelectorAll('#list li').forEach((el) => el.classList.remove('dragging', 'drag-over'));
  });
}

/* ---------- Files ------------------------------------------ */
const readAs = (file, how) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    how === 'text' ? reader.readAsText(file) : reader.readAsDataURL(file);
  });

async function addFiles(files) {
  let skipped = 0;
  let added = 0;

  for (const file of files) {
    try {
      if (file.type.startsWith('image/')) {
        items.push({ kind: 'img', name: file.name, size: file.size, data: await readAs(file, 'url') });
      } else if (file.type.startsWith('text/') || TEXT_EXT.test(file.name)) {
        items.push({ kind: 'txt', name: file.name, text: await readAs(file, 'text') });
      } else {
        skipped++;
        continue;
      }
      added++;
    } catch (e) {
      skipped++;
    }
  }

  render();
  if (skipped) toast(skipped + ' arquivo(s) não suportado(s) ignorado(s).', true);
  else if (added) toast(added === 1 ? 'Arquivo adicionado.' : added + ' arquivos adicionados.');
}

const drop = $('drop');
$('file').addEventListener('change', (event) => {
  addFiles([...event.target.files]);
  event.target.value = '';
});

['dragenter', 'dragover'].forEach((ev) =>
  drop.addEventListener(ev, (event) => {
    event.preventDefault();
    drop.classList.add('over');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  drop.addEventListener(ev, (event) => {
    event.preventDefault();
    drop.classList.remove('over');
  })
);
drop.addEventListener('drop', (event) => addFiles([...event.dataTransfer.files]));
drop.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    $('file').click();
  }
});

/* ---------- Text ------------------------------------------- */
const txt = $('txt');
txt.addEventListener('input', () => {
  $('txtCount').textContent = txt.value.length.toLocaleString('pt-BR');
});

$('addTxt').addEventListener('click', () => {
  const value = txt.value.trim();
  if (!value) return toast('Escreva algum texto antes de adicionar.', true);
  const n = items.filter((item) => item.name.startsWith('Texto digitado')).length + 1;
  items.push({ kind: 'txt', name: 'Texto digitado ' + n, text: value });
  txt.value = '';
  $('txtCount').textContent = '0';
  render();
  toast('Texto adicionado.');
});

/* ---------- Clear ------------------------------------------ */
$('clear').addEventListener('click', () => $('confirmDialog').showModal());
$('cancelClear').addEventListener('click', () => $('confirmDialog').close());
$('confirmClear').addEventListener('click', () => {
  items.length = 0;
  $('confirmDialog').close();
  render();
  toast('Itens removidos.');
});

/* ---------- Font size -------------------------------------- */
const fsInput = $('fs');
function updateFontSize() {
  const value = clamp(+fsInput.value || 12, 8, 24);
  $('fsOut').textContent = value + ' pt';
  fsInput.style.setProperty('--p', ((value - 8) / 16) * 100 + '%');
}
fsInput.addEventListener('input', updateFontSize);

/* ---------- Auto rotate ------------------------------------ */
const fullBleedInput = $('fullbleed');
const autoRotateInput = $('autorotate');
const rotateSwitch = $('rotateSwitch');

function syncRotateOption() {
  const enabled = fullBleedInput.checked;
  autoRotateInput.disabled = !enabled;
  rotateSwitch.classList.toggle('disabled', !enabled);
  rotateSwitch.title = enabled ? '' : 'Disponível quando a imagem ocupa a página inteira';
}
fullBleedInput.addEventListener('change', syncRotateOption);
syncRotateOption();

/* ---------- Generate --------------------------------------- */
const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

const genButton = $('gen');
let busy = false;

genButton.addEventListener('click', async () => {
  if (!items.length || busy) return;
  if (!window.jspdf) {
    return toast('A biblioteca jsPDF não carregou. Conecte-se à internet uma vez e recarregue.', true);
  }

  busy = true;
  genButton.disabled = true;
  genButton.classList.add('is-loading');
  genButton.setAttribute('aria-busy', 'true');
  $('progress').hidden = false;
  $('progressBar').style.width = '0%';
  if (previewDialog.open) previewDialog.close();

  try {
    const { jsPDF } = window.jspdf;
    const pageSize = document.querySelector('input[name="size"]:checked').value;
    const orientation = document.querySelector('input[name="orient"]:checked').value;
    const doc = new jsPDF({ unit: 'mm', format: pageSize, orientation });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 18;
    const fontSize = clamp(+fsInput.value || 12, 8, 24);
    const lineHeight = fontSize * 0.3528 * 1.45;
    const showTitles = $('titles').checked;
    const fullBleed = $('fullbleed').checked;
    const autoRotate = $('autorotate').checked;
    const usableWidth = pageWidth - margin * 2;
    let firstPage = true;

    for (const [index, item] of items.entries()) {
      $('genLabel').textContent = 'Gerando ' + (index + 1) + ' de ' + items.length + '…';
      $('progressBar').style.width = (index / items.length) * 100 + '%';
      await new Promise((resolve) => setTimeout(resolve));

      if (!firstPage) doc.addPage();
      firstPage = false;

      let y = margin;

      if (item.kind === 'txt') {
        if (showTitles) {
          const titleSize = Math.min(fontSize + 5, 26);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(titleSize);
          const titleLines = doc.splitTextToSize(item.name, usableWidth);
          for (const line of titleLines) {
            if (y > pageHeight - margin) {
              doc.addPage();
              y = margin;
            }
            doc.text(line, margin, y + 5);
            y += titleSize * 0.3528 * 1.3;
          }
          y += 3;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(fontSize);
        const body = item.text.replace(/\t/g, '    ').replace(/\r/g, '');
        const lines = doc.splitTextToSize(body, usableWidth);
        for (const line of lines) {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin;
          }
          doc.text(line, margin, y + 4);
          y += lineHeight;
        }
      } else {
        const image = await loadImage(item.data);
        let canvas = document.createElement('canvas');
        const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

        const context = canvas.getContext('2d');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        // Gira a imagem 90° quando ela está "de lado" em relação à folha.
        const pageLandscape = pageWidth > pageHeight;
        const imageLandscape = canvas.width > canvas.height;
        const imagePortrait = canvas.height > canvas.width;
        if (fullBleed && autoRotate && ((pageLandscape && imagePortrait) || (!pageLandscape && imageLandscape))) {
          const rotated = document.createElement('canvas');
          rotated.width = canvas.height;
          rotated.height = canvas.width;
          const rotatedContext = rotated.getContext('2d');
          rotatedContext.translate(rotated.width / 2, rotated.height / 2);
          rotatedContext.rotate(Math.PI / 2);
          rotatedContext.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
          canvas = rotated;
        }

        let width, height;
        if (fullBleed) {
          // Preenche a folha inteira, cortando o excesso nas bordas.
          const ratio = Math.max(pageWidth / canvas.width, pageHeight / canvas.height);
          width = canvas.width * ratio;
          height = canvas.height * ratio;
        } else {
          const ratio = Math.min(
            (pageWidth - margin * 2) / canvas.width,
            (pageHeight - margin * 2) / canvas.height
          );
          width = canvas.width * ratio;
          height = canvas.height * ratio;
        }

        doc.addImage(
          canvas.toDataURL('image/jpeg', 0.92),
          'JPEG',
          (pageWidth - width) / 2,
          (pageHeight - height) / 2,
          width,
          height
        );
      }
    }

    const fileName = (($('name').value.trim() || 'documento').replace(/[\\/:*?"<>|]+/g, '-') || 'documento') + '.pdf';
    doc.setProperties({
      title: fileName.replace(/\.pdf$/i, ''),
      creator: 'PDF.studio',
      subject: 'Documento gerado no navegador',
    });

    $('progressBar').style.width = '100%';
    showResult(doc.output('blob'), fileName, doc.getNumberOfPages());
    toast('PDF gerado com sucesso!');
  } catch (error) {
    console.error(error);
    $('progress').hidden = true;
    toast('Não foi possível gerar o PDF. Tente remover o último item.', true);
  } finally {
    busy = false;
    genButton.classList.remove('is-loading');
    genButton.removeAttribute('aria-busy');
    $('genLabel').textContent = 'Gerar meu PDF';
    updateBar();
    setTimeout(() => {
      if (!busy) {
        $('progress').hidden = true;
        $('progressBar').style.width = '0%';
      }
    }, 700);
  }
});

/* ---------- Result / preview ------------------------------- */
let pdfFile = null;
let previewUrl = null;

function showResult(blob, fileName, pages) {
  pdfFile = new File([blob], fileName, { type: 'application/pdf' });
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(blob);

  $('resInfo').textContent =
    fileName + ' · ' + fmt(pdfFile.size) + ' · ' + (pages === 1 ? '1 página' : pages + ' páginas');
  $('previewName').textContent = fileName;
  $('share').hidden = !(navigator.canShare && navigator.canShare({ files: [pdfFile] }));
  $('result').hidden = false;
  $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

$('dl').addEventListener('click', () => {
  if (!pdfFile) return;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(pdfFile);
  link.download = pdfFile.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
});

$('share').addEventListener('click', async () => {
  if (!pdfFile) return;
  try {
    await navigator.share({ files: [pdfFile], title: pdfFile.name });
  } catch (error) {
    if (error.name !== 'AbortError') toast('Não foi possível compartilhar. Use o botão Baixar.', true);
  }
});

const previewDialog = $('previewDialog');
$('preview').addEventListener('click', () => {
  if (!previewUrl) return;
  $('previewFrame').src = previewUrl;
  previewDialog.showModal();
});
$('closePreview').addEventListener('click', () => previewDialog.close());
previewDialog.addEventListener('close', () => { $('previewFrame').src = 'about:blank'; });
previewDialog.addEventListener('click', (event) => {
  if (event.target === previewDialog) previewDialog.close();
});
$('confirmDialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

/* ---------- Install (PWA) ---------------------------------- */
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  $('install').hidden = false;
});
$('install').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('install').hidden = true;
});
window.addEventListener('appinstalled', () => {
  $('install').hidden = true;
  toast('App instalado!');
});

/* ---------- Shortcut --------------------------------------- */
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    genButton.click();
  }
});

/* ---------- Service worker --------------------------------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

/* ---------- Init ------------------------------------------- */
updateFontSize();
render();
