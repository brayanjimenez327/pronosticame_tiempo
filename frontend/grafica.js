/*
 * Gráfica SVG sin dependencias externas: histórico, pronóstico e intervalo
 * de confianza, con eje de tiempo en hora de Colombia y tooltip al pasar el
 * cursor. No usa CDN, así que funciona igual dentro del contenedor.
 */
const Grafica = (() => {
  const SVG = "http://www.w3.org/2000/svg";
  const HORA_MS = 3600 * 1000;

  function el(nombre, atributos = {}, padre = null) {
    const nodo = document.createElementNS(SVG, nombre);
    for (const [k, v] of Object.entries(atributos)) nodo.setAttribute(k, v);
    if (padre) padre.appendChild(nodo);
    return nodo;
  }

  /** Marcas "bonitas" para el eje Y. */
  function marcasY(min, max, cantidad = 5) {
    const rango = max - min || Math.abs(max) || 1;
    const paso0 = rango / cantidad;
    const mag = Math.pow(10, Math.floor(Math.log10(paso0)));
    const norm = paso0 / mag;
    const paso = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const inicio = Math.floor(min / paso) * paso;
    const fin = Math.ceil(max / paso) * paso;
    const marcas = [];
    for (let v = inicio; v <= fin + paso / 2; v += paso) marcas.push(+v.toFixed(10));
    return { marcas, inicio, fin, decimales: Math.max(0, -Math.floor(Math.log10(paso))) };
  }

  /** Cada cuántas horas poner una etiqueta en el eje X según el ancho. */
  function pasoEtiquetas(totalHoras, anchoPx) {
    const maxEtiquetas = Math.max(2, Math.floor(anchoPx / 70));
    for (const p of [1, 2, 3, 4, 6, 12, 24, 48]) {
      if (totalHoras / p <= maxEtiquetas) return p;
    }
    return 72;
  }

  function dibujar(contenedor, datos, { alPasar, alSalir } = {}) {
    const { historico, prediccion } = datos;
    contenedor.innerHTML = "";

    if (!historico.length && !prediccion.length) {
      contenedor.innerHTML = '<p class="grafica__vacia">Sin datos para graficar.</p>';
      return;
    }

    const ancho = Math.max(320, contenedor.clientWidth);
    const alto = ancho < 600 ? 280 : 380;
    const m = { arriba: 16, derecha: 16, abajo: ancho < 600 ? 44 : 48, izquierda: 56 };
    const anchoUtil = ancho - m.izquierda - m.derecha;
    const altoUtil = alto - m.arriba - m.abajo;

    // Puntos con fecha
    const hist = historico.map((p) => ({ t: Formato.aFecha(p.tiempo), v: p.valor }));
    const pred = prediccion.map((p) => ({
      t: Formato.aFecha(p.tiempo), v: p.prediccion, lo: p.limite_inferior, hi: p.limite_superior,
    }));
    const todos = [...hist, ...pred];
    const t0 = todos[0].t.getTime();
    const t1 = todos[todos.length - 1].t.getTime();

    const valores = [...hist.map((p) => p.v), ...pred.flatMap((p) => [p.lo, p.hi, p.v])];
    let yMin = Math.min(...valores);
    let yMax = Math.max(...valores);
    const holgura = (yMax - yMin) * 0.06 || 1;
    const ejeY = marcasY(yMin - holgura, yMax + holgura);
    yMin = ejeY.inicio;
    yMax = ejeY.fin;

    const x = (fecha) => m.izquierda + (t1 === t0 ? anchoUtil / 2 : ((fecha.getTime() - t0) / (t1 - t0)) * anchoUtil);
    const y = (v) => m.arriba + (1 - (v - yMin) / (yMax - yMin)) * altoUtil;

    const svg = el("svg", {
      viewBox: `0 0 ${ancho} ${alto}`, width: ancho, height: alto,
      role: "img", "aria-label": "Gráfica del histórico y el pronóstico con su intervalo de confianza",
    }, contenedor);

    // Zona de pronóstico sombreada
    if (hist.length && pred.length) {
      const xAhora = x(hist[hist.length - 1].t);
      el("rect", {
        x: xAhora, y: m.arriba, width: m.izquierda + anchoUtil - xAhora, height: altoUtil,
        class: "g-zona-futuro",
      }, svg);
    }

    // Rejilla y eje Y
    const gY = el("g", { class: "g-eje" }, svg);
    for (const v of ejeY.marcas) {
      const yy = y(v);
      el("line", { x1: m.izquierda, x2: m.izquierda + anchoUtil, y1: yy, y2: yy, class: "g-rejilla" }, gY);
      const txt = el("text", { x: m.izquierda - 8, y: yy, class: "g-etiqueta g-etiqueta--y" }, gY);
      txt.textContent = Formato.numero(v, Math.min(ejeY.decimales, 2));
    }

    // Eje X (hora de Colombia)
    const gX = el("g", { class: "g-eje" }, svg);
    const totalHoras = Math.round((t1 - t0) / HORA_MS);
    const paso = pasoEtiquetas(totalHoras, anchoUtil);
    for (let ms = t0; ms <= t1; ms += HORA_MS) {
      const f = new Date(ms);
      const h = Formato.horaColombia(f);
      if (h % Math.min(paso, 24) !== 0) continue;
      const xx = x(f);
      el("line", { x1: xx, x2: xx, y1: m.arriba + altoUtil, y2: m.arriba + altoUtil + 5, class: "g-tic" }, gX);
      const txt = el("text", { x: xx, y: m.arriba + altoUtil + 18, class: "g-etiqueta g-etiqueta--x" }, gX);
      txt.textContent = h === 0 ? Formato.dia(f) : Formato.hora(f);
      // Evita que las etiquetas de los extremos se corten
      if (xx > m.izquierda + anchoUtil - 40) txt.setAttribute("text-anchor", "end");
      else if (xx < m.izquierda + 30) txt.setAttribute("text-anchor", "start");
      if (h === 0) {
        txt.classList.add("g-etiqueta--dia");
        el("line", { x1: xx, x2: xx, y1: m.arriba, y2: m.arriba + altoUtil, class: "g-medianoche" }, gX);
      }
    }
    const lblX = el("text", {
      x: m.izquierda + anchoUtil, y: alto - 6, class: "g-etiqueta g-etiqueta--titulo",
    }, svg);
    lblX.textContent = "Hora de Colombia (UTC−5)";

    // Intervalo de confianza: arranca en el último dato real para que no quede un hueco
    if (pred.length) {
      const anclaje = hist.length ? [{ t: hist[hist.length - 1].t, lo: hist[hist.length - 1].v, hi: hist[hist.length - 1].v }] : [];
      const banda = [...anclaje, ...pred];
      const arriba = banda.map((p) => `${x(p.t)},${y(p.hi)}`);
      const abajo = banda.slice().reverse().map((p) => `${x(p.t)},${y(p.lo)}`);
      el("polygon", { points: [...arriba, ...abajo].join(" "), class: "g-banda" }, svg);
    }

    // Líneas
    const linea = (puntos) => puntos.map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(p.v)}`).join(" ");
    if (hist.length) el("path", { d: linea(hist), class: "g-linea g-linea--historico" }, svg);
    if (pred.length) {
      const conAncla = hist.length ? [hist[hist.length - 1], ...pred] : pred;
      el("path", { d: linea(conAncla), class: "g-linea g-linea--prediccion" }, svg);
    }

    // Marca "último dato"
    if (hist.length && pred.length) {
      const u = hist[hist.length - 1];
      const xx = x(u.t);
      el("line", { x1: xx, x2: xx, y1: m.arriba, y2: m.arriba + altoUtil, class: "g-ahora" }, svg);
      const cercaDelBorde = xx > m.izquierda + anchoUtil - 80;
      const t = el("text", {
        x: cercaDelBorde ? xx - 6 : xx + 6, y: m.arriba + 12, class: "g-etiqueta g-etiqueta--ahora",
        "text-anchor": cercaDelBorde ? "end" : "start",
      }, svg);
      t.textContent = "Último dato";
    }

    // Interacción: guía vertical + puntos + tooltip
    const guia = el("line", { y1: m.arriba, y2: m.arriba + altoUtil, class: "g-guia", visibility: "hidden" }, svg);
    const punto = el("circle", { r: 4.5, class: "g-punto", visibility: "hidden" }, svg);
    const captura = el("rect", {
      x: m.izquierda, y: m.arriba, width: anchoUtil, height: altoUtil, class: "g-captura",
    }, svg);

    const mover = (evento) => {
      const caja = svg.getBoundingClientRect();
      const escala = ancho / caja.width;
      const px = (evento.clientX - caja.left) * escala;
      let mejor = todos[0];
      let dist = Infinity;
      for (const p of todos) {
        const d = Math.abs(x(p.t) - px);
        if (d < dist) { dist = d; mejor = p; }
      }
      const xx = x(mejor.t);
      guia.setAttribute("x1", xx);
      guia.setAttribute("x2", xx);
      guia.setAttribute("visibility", "visible");
      punto.setAttribute("cx", xx);
      punto.setAttribute("cy", y(mejor.v));
      punto.setAttribute("class", `g-punto ${mejor.lo !== undefined ? "g-punto--prediccion" : ""}`);
      punto.setAttribute("visibility", "visible");
      if (alPasar) alPasar(mejor, evento);
    };
    const salir = () => {
      guia.setAttribute("visibility", "hidden");
      punto.setAttribute("visibility", "hidden");
      if (alSalir) alSalir();
    };
    captura.addEventListener("pointermove", mover);
    captura.addEventListener("pointerdown", mover);
    captura.addEventListener("pointerleave", salir);
  }

  return { dibujar };
})();
