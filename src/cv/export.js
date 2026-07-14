// Export du CV en PDF et JPG. Les libs (html2canvas / jsPDF) sont importées
// dynamiquement : elles ne sont jamais chargées au build SSR (test de fumée).

function downloadURL(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function renderCanvas(node) {
  const { default: html2canvas } = await import('html2canvas')
  return html2canvas(node, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
    windowWidth: node.scrollWidth,
    windowHeight: node.scrollHeight,
  })
}

export async function exportJPG(node, filename = 'cv') {
  const canvas = await renderCanvas(node)
  downloadURL(canvas.toDataURL('image/jpeg', 0.95), filename + '.jpg')
}

export async function exportPDF(node, filename = 'cv') {
  const canvas = await renderCanvas(node)
  const img = canvas.toDataURL('image/jpeg', 0.95)
  const { default: jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
  const pw = pdf.internal.pageSize.getWidth()
  const ph = pdf.internal.pageSize.getHeight()
  // Largeur pleine page ; si le contenu dépasse une page A4 → pagination.
  const imgH = (canvas.height * pw) / canvas.width
  let remaining = imgH
  let position = 0
  if (imgH <= ph + 2) {
    pdf.addImage(img, 'JPEG', 0, 0, pw, imgH)
  } else {
    while (remaining > 0) {
      pdf.addImage(img, 'JPEG', 0, position, pw, imgH)
      remaining -= ph
      if (remaining > 0) { pdf.addPage(); position -= ph }
    }
  }
  pdf.save(filename + '.pdf')
}
