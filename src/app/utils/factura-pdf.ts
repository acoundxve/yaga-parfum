import jsPDF from 'jspdf';
import { Pedido, Venta } from '../models/perfume.model';

export interface DatosNegocioFactura {
  nombre: string;
  moneda: string;
}

interface LineaFactura {
  nombre: string;
  presentacion: string;
  cantidad: number;
  precioUnitario: number;
}

interface DatosFactura {
  folio: string;
  fecha: Date;
  cliente: string;
  items: LineaFactura[];
  total: number;
  nota?: string;
}

const ANCHO = 420;
const MARGEN = 40;
const DORADO = '#d8ad5f';
const CLARO = '#f2efe6';
const TENUE = '#b9b3a4';

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

/** Alto de página según cuántas líneas trae la factura, para no dejar
 *  espacio vacío enorme en facturas de un solo ítem. */
function altoFactura(cantidadItems: number, tieneNota: boolean): number {
  const base = 230;
  const porItem = 34;
  const footer = 70;
  const notaAlto = tieneNota ? 26 : 0;
  return Math.max(360, base + cantidadItems * porItem + footer + notaAlto);
}

/** Construye el documento de la factura (sin guardarlo ni compartirlo). */
async function construirDocFactura(
  datos: DatosFactura,
  negocio: DatosNegocioFactura
): Promise<jsPDF> {
  const alto = altoFactura(datos.items.length, !!datos.nota?.trim());
  const doc = new jsPDF({ unit: 'pt', format: [ANCHO, alto] });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  const fondo = await fondoDesvanecido(Math.round(w * 2), Math.round(h * 2));
  doc.addImage(fondo, 'JPEG', 0, 0, w, h);

  let y = 54;

  doc.setTextColor(DORADO);
  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  doc.text(negocio.nombre, w / 2, y, { align: 'center' });

  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(TENUE);
  doc.text('FACTURA DE VENTA', w / 2, y, { align: 'center' });

  y += 22;
  doc.setDrawColor(DORADO);
  doc.setLineWidth(0.75);
  doc.line(MARGEN, y, w - MARGEN, y);

  y += 22;
  doc.setFontSize(9);
  doc.setTextColor(CLARO);
  doc.text(`Folio: ${datos.folio}`, MARGEN, y);
  doc.text(
    datos.fecha.toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' }),
    w - MARGEN,
    y,
    { align: 'right' }
  );

  y += 18;
  doc.text(`Cliente: ${datos.cliente.trim() || 'Consumidor final'}`, MARGEN, y);

  y += 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(DORADO);
  doc.text('PRODUCTO', MARGEN, y);
  doc.text('CANT.', w - 150, y, { align: 'right' });
  doc.text('PRECIO', w - MARGEN, y, { align: 'right' });
  y += 8;
  doc.setDrawColor(TENUE);
  doc.setLineWidth(0.5);
  doc.line(MARGEN, y, w - MARGEN, y);

  for (const item of datos.items) {
    y += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(CLARO);
    doc.text(item.nombre, MARGEN, y);
    doc.text(String(item.cantidad), w - 150, y, { align: 'right' });
    doc.text(`${negocio.moneda} ${(item.precioUnitario * item.cantidad).toFixed(0)}`, w - MARGEN, y, {
      align: 'right',
    });

    y += 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(TENUE);
    doc.text(item.presentacion, MARGEN, y);
  }

  y += 19;
  doc.setDrawColor(DORADO);
  doc.setLineWidth(0.75);
  doc.line(MARGEN, y, w - MARGEN, y);

  y += 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(DORADO);
  doc.text('TOTAL', MARGEN, y);
  doc.text(`${negocio.moneda} ${datos.total.toFixed(0)}`, w - MARGEN, y, { align: 'right' });

  if (datos.nota?.trim()) {
    y += 28;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(TENUE);
    doc.text(`Nota: ${datos.nota.trim()}`, MARGEN, y, { maxWidth: w - MARGEN * 2 });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(TENUE);
  doc.text('¡Gracias por tu compra!', w / 2, h - 34, { align: 'center' });

  return doc;
}

/** Genera y descarga la factura de una venta rápida en PDF. */
export async function generarFacturaPdf(
  venta: Venta,
  negocio: DatosNegocioFactura
): Promise<void> {
  const doc = await construirDocFactura(
    {
      folio: venta.id.slice(0, 8).toUpperCase(),
      fecha: new Date(venta.createdAt),
      cliente: venta.clienteNombre ?? '',
      items: [
        {
          nombre: venta.perfumeNombre,
          presentacion: venta.presentacion,
          cantidad: venta.cantidad,
          precioUnitario: venta.precioUnitario,
        },
      ],
      total: venta.ingreso,
      nota: venta.nota,
    },
    negocio
  );
  doc.save(`factura-${venta.id.slice(0, 8)}.pdf`);
}

/**
 * Genera la factura de un pedido (encargo) y se la hace llegar al cliente.
 * Sin backend ni WhatsApp Business API no hay forma de "enviar" el PDF sin
 * ningún paso manual: se intenta primero el Web Share API (abre el selector
 * nativo de compartir con el PDF ya adjunto, ideal desde el celular); si el
 * navegador no lo soporta o el share falla, se descarga el PDF y se abre
 * WhatsApp con el chat del cliente para que se adjunte manualmente.
 */
export async function enviarFacturaPedido(
  pedido: Pedido,
  negocio: DatosNegocioFactura
): Promise<'compartido' | 'descargado'> {
  const doc = await construirDocFactura(
    {
      folio: pedido.id.slice(0, 8).toUpperCase(),
      fecha: new Date(pedido.createdAt),
      cliente: pedido.clienteNombre,
      items: pedido.items.map((i) => ({
        nombre: i.nombre,
        presentacion: i.presentacion,
        cantidad: i.cantidad,
        precioUnitario: i.precio,
      })),
      total: pedido.total,
      nota: pedido.nota,
    },
    negocio
  );

  const nombreArchivo = `factura-${pedido.id.slice(0, 8)}.pdf`;
  const blob = doc.output('blob');
  const file = new File([blob], nombreArchivo, { type: 'application/pdf' });

  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files?: File[]; title?: string; text?: string }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: `Factura ${negocio.nombre}`,
        text: `Factura de tu encargo en ${negocio.nombre}. ¡Gracias por tu compra!`,
      });
      return 'compartido';
    } catch {
      // El admin canceló el share o el navegador lo rechazó: cae al plan B.
    }
  }

  doc.save(nombreArchivo);
  const msg = `¡Hola ${pedido.clienteNombre}! Aquí tienes la factura de tu pedido en ${negocio.nombre} (adjunta). ¡Gracias por tu compra!`;
  window.open(`https://wa.me/${pedido.clienteTelefono}?text=${encodeURIComponent(msg)}`, '_blank');
  return 'descargado';
}
