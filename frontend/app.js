/*
 * Lógica de la página: controles, indicadores, gráfica, tabla y errores.
 * Depende de formato.js, grafica.js y api.js (cargados antes en index.html).
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const AUTO_MS = 5 * 60 * 1000;

  const ui = {
    horas: $("horas"),
    horasValor: $("horas-valor"),
    historia: $("historia"),
    confianza: $("confianza"),
    actualizar: $("actualizar"),
    auto: $("auto"),
    alerta: $("alerta"),
    alertaTitulo: $("alerta-titulo"),
    alertaDetalle: $("alerta-detalle"),
    reintentar: $("reintentar"),
    grafica: $("grafica"),
    leyendaIntervalo: $("leyenda-intervalo"),
    avisoRellenadas: $("aviso-rellenadas"),
    filas: $("filas"),
    tooltip: $("tooltip"),
    serie: $("serie"),
    insignia: $("insignia-fuente"),
    reloj: $("reloj"),
    atendidoPor: $("atendido-por"),
    actualizado: $("actualizado"),
    modeloInfo: $("modelo-info"),
    indicadores: $("indicadores"),
  };

  let ultimosDatos = null;
  let unidad = "";
  let solicitud = 0;            // descarta respuestas viejas si el usuario cambia rápido
  let temporizadorAuto = null;

  // ------------------------------------------------------------ parámetros
  const parametros = () => ({
    horas: Number(ui.horas.value),
    historia: Number(ui.historia.value),
    confianza: Number(ui.confianza.value),
  });

  function guardarPreferencias() {
    try {
      localStorage.setItem("pronostico.preferencias", JSON.stringify(parametros()));
    } catch { /* sin almacenamiento: no pasa nada */ }
  }

  function restaurarPreferencias() {
    try {
      const p = JSON.parse(localStorage.getItem("pronostico.preferencias") || "null");
      if (!p) return;
      if (p.horas) ui.horas.value = p.horas;
      if ([...ui.historia.options].some((o) => Number(o.value) === p.historia)) ui.historia.value = p.historia;
      if ([...ui.confianza.options].some((o) => Number(o.value) === p.confianza)) ui.confianza.value = p.confianza;
    } catch { /* ignorar */ }
  }

  function pintarHoras() {
    const h = Number(ui.horas.value);
    ui.horasValor.textContent = `${h} h`;
    document.querySelectorAll(".atajo").forEach((b) =>
      b.classList.toggle("atajo--activo", Number(b.dataset.horas) === h));
    const pct = ((h - ui.horas.min) / (ui.horas.max - ui.horas.min)) * 100;
    ui.horas.style.setProperty("--progreso", `${pct}%`);
  }

  // ------------------------------------------------------------ errores
  function mostrarError(error) {
    ui.alertaTitulo.textContent = error.titulo || "No se pudo obtener el pronóstico";
    ui.alertaDetalle.textContent = error.message || String(error);
    ui.alerta.hidden = false;
    document.body.classList.add("con-error");
    if (!ultimosDatos) {
      ui.grafica.innerHTML = '<p class="grafica__vacia">No hay datos para mostrar mientras la API responda con error.</p>';
    }
  }

  function ocultarError() {
    ui.alerta.hidden = true;
    document.body.classList.remove("con-error");
  }

  // ------------------------------------------------------------ indicadores
  const conUnidad = (v) => `${Formato.numero(v)}${unidad ? ` <span class="unidad">${unidad}</span>` : ""}`;

  function pintarIndicadores(datos) {
    const pred = datos.prediccion;
    const prox = pred[0];
    const max = pred.reduce((a, b) => (b.prediccion > a.prediccion ? b : a));
    const min = pred.reduce((a, b) => (b.prediccion < a.prediccion ? b : a));
    const ultimo = datos.historico[datos.historico.length - 1];
    const fUltima = Formato.aFecha(datos.ultima_observacion);

    $("kpi-proxima").innerHTML = conUnidad(prox.prediccion);
    $("kpi-proxima-detalle").textContent =
      `${Formato.hora(Formato.aFecha(prox.tiempo))} · entre ${Formato.numero(prox.limite_inferior)} y ${Formato.numero(prox.limite_superior)}`;

    $("kpi-max").innerHTML = conUnidad(max.prediccion);
    $("kpi-max-detalle").textContent = Formato.fechaHora(Formato.aFecha(max.tiempo));

    $("kpi-min").innerHTML = conUnidad(min.prediccion);
    $("kpi-min-detalle").textContent = Formato.fechaHora(Formato.aFecha(min.tiempo));

    $("kpi-ultimo").innerHTML = ultimo ? conUnidad(ultimo.valor) : "—";
    $("kpi-ultimo-detalle").textContent = `${Formato.fechaHora(fUltima)} · ${Formato.haceCuanto(fUltima)}`;

    ui.indicadores.classList.remove("cargando");
  }

  function pintarAvisoRellenadas(datos) {
    const n = datos.horas_rellenadas || 0;
    if (n > 0) {
      const pct = Math.round((n / datos.horas_contexto_usadas) * 100);
      ui.avisoRellenadas.textContent =
        `Atención: ${n} de las ${datos.horas_contexto_usadas} horas usadas por el modelo no tenían dato y se rellenaron (${pct} %). ` +
        "El sensor pudo estar caído y el pronóstico es menos confiable.";
      ui.avisoRellenadas.hidden = false;
    } else {
      ui.avisoRellenadas.hidden = true;
    }
  }

  // ------------------------------------------------------------ tabla
  function pintarTabla(datos) {
    ui.filas.innerHTML = datos.prediccion.map((p) => `
      <tr>
        <td>${Formato.fechaHora(Formato.aFecha(p.tiempo))}</td>
        <td class="num"><strong>${Formato.numero(p.prediccion)}</strong></td>
        <td class="num">${Formato.numero(p.limite_inferior)}</td>
        <td class="num">${Formato.numero(p.limite_superior)}</td>
      </tr>`).join("");
  }

  // ------------------------------------------------------------ gráfica
  function pintarGrafica() {
    if (!ultimosDatos) return;
    ui.leyendaIntervalo.textContent = `Intervalo ${Math.round(ultimosDatos.confianza * 100)} %`;
    Grafica.dibujar(ui.grafica, ultimosDatos, {
      alPasar: mostrarTooltip,
      alSalir: () => { ui.tooltip.hidden = true; },
    });
  }

  function mostrarTooltip(punto, evento) {
    const esPred = punto.lo !== undefined;
    ui.tooltip.innerHTML = `
      <span class="tooltip__hora">${Formato.fechaHora(punto.t)}</span>
      <span class="tooltip__tipo tooltip__tipo--${esPred ? "prediccion" : "historico"}">${esPred ? "Pronóstico" : "Dato real"}</span>
      <span class="tooltip__valor">${Formato.numero(punto.v)}${unidad ? ` ${unidad}` : ""}</span>
      ${esPred ? `<span class="tooltip__rango">${Formato.numero(punto.lo)} – ${Formato.numero(punto.hi)}</span>` : ""}`;
    ui.tooltip.hidden = false;
    const { innerWidth } = window;
    const ancho = ui.tooltip.offsetWidth;
    let left = evento.clientX + 14;
    if (left + ancho > innerWidth - 8) left = evento.clientX - ancho - 14;
    ui.tooltip.style.left = `${Math.max(8, left)}px`;
    ui.tooltip.style.top = `${evento.clientY - ui.tooltip.offsetHeight - 12}px`;
  }

  // ------------------------------------------------------------ carga principal
  async function cargar() {
    const id = ++solicitud;
    const p = parametros();
    guardarPreferencias();
    document.body.classList.add("cargando");
    ui.actualizar.disabled = true;
    ui.actualizar.textContent = "Consultando…";

    try {
      const datos = await Api.prediccion(p);
      if (id !== solicitud) return;
      if (!datos.prediccion || !datos.prediccion.length) {
        throw new Api.ErrorApi("Respuesta vacía", "La API no devolvió horas pronosticadas.");
      }
      ultimosDatos = datos;
      ocultarError();
      pintarIndicadores(datos);
      pintarAvisoRellenadas(datos);
      pintarTabla(datos);
      pintarGrafica();
      ui.actualizado.textContent = Formato.fechaHora(new Date());
    } catch (error) {
      if (id !== solicitud) return;
      mostrarError(error);
    } finally {
      if (id === solicitud) {
        document.body.classList.remove("cargando");
        ui.actualizar.disabled = false;
        ui.actualizar.textContent = "Actualizar";
      }
    }
  }

  async function cargarSalud() {
    try {
      const s = await Api.salud();
      ui.atendidoPor.textContent = s.atendido_por || "—";
      const partes = [s.measurement, s.field].filter(Boolean);
      ui.serie.textContent = partes.length ? `Serie: ${partes.join(" · ")}` : "Serie sin configurar";
      const demo = s.modo_demo || s.modelo_demo;
      ui.insignia.textContent = demo ? "Modo demo" : "Datos reales · InfluxDB";
      ui.insignia.className = `insignia ${demo ? "insignia--demo" : "insignia--real"}`;
      ui.insignia.title = `modelo_demo: ${s.modelo_demo} · modo_demo: ${s.modo_demo}`;
      if (s.field && /temp/i.test(s.field)) unidad = "°C";
      else if (s.field && /hum/i.test(s.field)) unidad = "%";
    } catch (e) {
      ui.insignia.textContent = "Sin conexión";
      ui.insignia.className = "insignia insignia--error";
      ui.serie.textContent = e.message;
    }
  }

  async function cargarModelo() {
    try {
      const m = await Api.modelo();
      const filas = [];
      const fmtOrden = (o) => `(${o.join(", ")})`;
      if (m.order) {
        filas.push(["Modelo", `SARIMA${fmtOrden(m.order)}${m.seasonal_order ? `×${fmtOrden(m.seasonal_order)}` : ""}`]);
      }
      if (m.metricas_test) {
        for (const [k, v] of Object.entries(m.metricas_test)) {
          filas.push([`${k.toUpperCase()} (prueba)`, typeof v === "number" ? Formato.numero(v, 3) : v]);
        }
      }
      if (m.n_observaciones) filas.push(["Horas de entrenamiento", m.n_observaciones.toLocaleString("es-CO")]);
      if (m.entrenado_en) filas.push(["Entrenado", m.entrenado_en]);
      ui.modeloInfo.innerHTML = filas.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    } catch (e) {
      ui.modeloInfo.innerHTML = `<dt>Estado</dt><dd class="error-texto">${e.message}</dd>`;
    }
  }

  // ------------------------------------------------------------ eventos
  function programarAuto() {
    clearInterval(temporizadorAuto);
    if (ui.auto.checked) temporizadorAuto = setInterval(cargar, AUTO_MS);
  }

  ui.horas.addEventListener("input", pintarHoras);
  ui.horas.addEventListener("change", cargar);
  document.querySelectorAll(".atajo").forEach((b) =>
    b.addEventListener("click", () => {
      ui.horas.value = b.dataset.horas;
      pintarHoras();
      cargar();
    }));
  ui.historia.addEventListener("change", cargar);
  ui.confianza.addEventListener("change", cargar);
  ui.actualizar.addEventListener("click", cargar);
  ui.reintentar.addEventListener("click", () => { cargarSalud(); cargarModelo(); cargar(); });
  ui.auto.addEventListener("change", programarAuto);

  let redimension = null;
  window.addEventListener("resize", () => {
    clearTimeout(redimension);
    redimension = setTimeout(pintarGrafica, 120);
  });

  const tic = () => { ui.reloj.textContent = Formato.reloj(new Date()); };
  tic();
  setInterval(tic, 1000);

  // ------------------------------------------------------------ inicio
  restaurarPreferencias();
  pintarHoras();
  cargarSalud().then(cargar);
  cargarModelo();
})();
