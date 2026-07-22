import jsPDF from 'jspdf';
import { Venta } from '../models/perfume.model';

export interface DatosNegocioFactura {
  nombre: string;
  moneda: string;
}

function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Dibuja el fondo de marca a baja opacidad sobre un canvas oscuro, listo
 *  para insertarse como imagen de fondo de la factura (cover-fit). */
async function fondoDesvanecido(width: number, height: number): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0c0c10';
  ctx.fillRect(0, 0, width, height);
  try {
    const img = await cargarImagen('/fondo-yaga.jpg');
    const scale = Math.max(width / img.width, height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.globalAlpha = 0.16;
    ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
    ctx.globalAlpha = 1;
  } catch {
    // Sin la imagen de fondo, queda el color oscuro sólido.
  }
  return canvas.toDataURL('image/jpeg', 0.92);
}

/** Genera y descarga la factura de una venta en PDF, con el fondo de marca
 *  semitransparente detrás de la información. */
export async function generarFacturaPdf(
  venta: Venta,
  negocio: DatosNegocioFactura
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a5' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  const fondo = await fondoDesvanecido(Math.round(w * 2), Math.round(h * 2));
  doc.addImage(fondo, 'JPEG', 0, 0, w, h);

  const dorado = '#d8ad5f';
  const claro = '#f2efe6';
  const tenue = '#b9b3a4';
  const margen = 40;
  let y = 54;

  doc.setTextColor(dorado);
  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  doc.text(negocio.nombre, w / 2, y, { align: 'center' });

  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(tenue);
  doc.text('FACTURA DE VENTA', w / 2, y, { align: 'center' });

  y += 22;
  doc.setDrawColor(dorado);
  doc.setLineWidth(0.75);
  doc.line(margen, y, w - margen, y);

  y += 22;
  doc.setFontSize(9);
  doc.setTextColor(claro);
  const fecha = new Date(venta.createdAt);
  doc.text(`Folio: ${venta.id.slice(0, 8).toUpperCase()}`, margen, y);
  doc.text(
    fecha.toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }),
    w - margen,
    y,
    { align: 'right' }
  );

  y += 18;
  doc.text(`Cliente: ${venta.clienteNombre?.trim() || 'Consumidor final'}`, margen, y);

  y += 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(dorado);
  doc.text('PRODUCTO', margen, y);
  doc.text('CANT.', w - 150, y, { align: 'right' });
  doc.text('PRECIO', w - margen, y, { align: 'right' });
  y += 8;
  doc.setDrawColor(tenue);
  doc.setLineWidth(0.5);
  doc.line(margen, y, w - margen, y);

  y += 20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(claro);
  doc.text(venta.perfumeNombre, margen, y);
  doc.text(String(venta.cantidad), w - 150, y, { align: 'right' });
  doc.text(`${negocio.moneda} ${venta.precioUnitario.toFixed(0)}`, w - margen, y, {
    align: 'right',
  });

  y += 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(tenue);
  doc.text(venta.presentacion, margen, y);

  y += 34;
  doc.setDrawColor(dorado);
  doc.setLineWidth(0.75);
  doc.line(margen, y, w - margen, y);

  y += 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(dorado);
  doc.text('TOTAL', margen, y);
  doc.text(`${negocio.moneda} ${venta.ingreso.toFixed(0)}`, w - margen, y, { align: 'right' });

  if (venta.nota?.trim()) {
    y += 28;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(tenue);
    doc.text(`Nota: ${venta.nota.trim()}`, margen, y, { maxWidth: w - margen * 2 });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(tenue);
  doc.text('¡Gracias por tu compra!', w / 2, h - 34, { align: 'center' });

  doc.save(`factura-${venta.id.slice(0, 8)}.pdf`);
}
