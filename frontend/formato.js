/*
 * Formato de fechas y números.
 * La API entrega las horas en UTC (terminan en "Z"); aquí todo se muestra
 * en hora de Colombia (America/Bogota, UTC-5).
 */
const Formato = (() => {
  const ZONA = "America/Bogota";
  const LOCALE = "es-CO";

  const fmtHora = new Intl.DateTimeFormat(LOCALE, {
    timeZone: ZONA, hour: "numeric", minute: "2-digit", hour12: true,
  });
  const fmtFechaHora = new Intl.DateTimeFormat(LOCALE, {
    timeZone: ZONA, weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
  const fmtDia = new Intl.DateTimeFormat(LOCALE, {
    timeZone: ZONA, weekday: "short", day: "numeric", month: "short",
  });
  const fmtHoraNum = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA, hour: "numeric", hour12: false,
  });
  const fmtReloj = new Intl.DateTimeFormat(LOCALE, {
    timeZone: ZONA, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  /** "2026-10-27T15:00:00Z" -> Date */
  const aFecha = (iso) => new Date(iso);

  /** Hora local de Colombia (0-23) de una fecha. */
  const horaColombia = (fecha) => Number(fmtHoraNum.format(fecha)) % 24;

  const numero = (v, decimales = 2) =>
    Number(v).toLocaleString(LOCALE, {
      minimumFractionDigits: decimales, maximumFractionDigits: decimales,
    });

  const haceCuanto = (fecha) => {
    const minutos = Math.round((Date.now() - fecha.getTime()) / 60000);
    if (minutos < 1) return "hace un momento";
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const resto = minutos % 60;
    if (horas < 24) return resto ? `hace ${horas} h ${resto} min` : `hace ${horas} h`;
    const dias = Math.floor(horas / 24);
    return `hace ${dias} día${dias === 1 ? "" : "s"}`;
  };

  return {
    ZONA,
    aFecha,
    horaColombia,
    numero,
    haceCuanto,
    hora: (f) => fmtHora.format(f),
    fechaHora: (f) => fmtFechaHora.format(f),
    dia: (f) => fmtDia.format(f),
    reloj: (f) => fmtReloj.format(f),
  };
})();
