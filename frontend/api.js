/*
 * Servicio de acceso a la API de pronóstico.
 * Convierte cualquier falla (red, HTTP, JSON) en un ErrorApi con un mensaje claro.
 */
const Api = (() => {
  class ErrorApi extends Error {
    constructor(titulo, detalle, estado = null) {
      super(detalle);
      this.titulo = titulo;
      this.estado = estado;
    }
  }

  /** FastAPI devuelve `detail` como texto o, en errores 422, como lista. */
  function extraerDetalle(cuerpo) {
    if (!cuerpo || cuerpo.detail === undefined) return null;
    const d = cuerpo.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d.map((e) => {
        const campo = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : "";
        return campo ? `${campo}: ${e.msg}` : e.msg;
      }).join(" · ");
    }
    return JSON.stringify(d);
  }

  function tituloPorEstado(estado) {
    if (estado === 503) return "El servicio no está listo";
    if (estado === 502) return "No se pudo consultar InfluxDB";
    if (estado === 404) return "No hay datos para mostrar";
    if (estado === 422) return "Parámetros no válidos";
    if (estado >= 500) return "Error interno de la API";
    return "La API respondió con un error";
  }

  async function obtener(ruta, { timeoutMs = 45000 } = {}) {
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), timeoutMs);
    let respuesta;
    try {
      respuesta = await fetch(ruta, { signal: control.signal, headers: { Accept: "application/json" } });
    } catch (e) {
      if (e.name === "AbortError") {
        throw new ErrorApi("La API tardó demasiado", `Sin respuesta después de ${timeoutMs / 1000} s. Intenta de nuevo.`);
      }
      throw new ErrorApi("No hay conexión con la API",
        "Verifica que el servidor esté corriendo (uvicorn o el contenedor) y que el puerto 8000 esté abierto.");
    } finally {
      clearTimeout(temporizador);
    }

    let cuerpo = null;
    try {
      cuerpo = await respuesta.json();
    } catch {
      /* respuesta sin JSON */
    }

    if (!respuesta.ok) {
      const detalle = extraerDetalle(cuerpo) || `${respuesta.status} ${respuesta.statusText}`;
      throw new ErrorApi(tituloPorEstado(respuesta.status), detalle, respuesta.status);
    }
    if (cuerpo === null) {
      throw new ErrorApi("Respuesta inesperada", "La API no devolvió JSON válido.", respuesta.status);
    }
    return cuerpo;
  }

  return {
    ErrorApi,
    prediccion: ({ horas, historia, confianza }) =>
      obtener(`/api/prediccion?${new URLSearchParams({ horas, historia, confianza })}`),
    salud: () => obtener("/api/salud", { timeoutMs: 10000 }),
    modelo: () => obtener("/api/modelo", { timeoutMs: 10000 }),
  };
})();
