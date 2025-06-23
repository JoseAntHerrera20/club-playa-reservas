const map = L.map('map');

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Colores según estado
function getColor(status) {
  return status === 'disponible' ? 'green' :
         status === 'reservado'   ? 'yellow' :
         status === 'bloqueado'   ? 'red' :
                                    'gray';
}

// Obtener reservas guardadas (objeto: nombre -> horarios reservados)
function obtenerReservasGuardadas() {
  return JSON.parse(localStorage.getItem('reservas')) || {};
}

// Guardar reservas
function guardarReservas(reservas) {
  localStorage.setItem('reservas', JSON.stringify(reservas));
}

// Reservar un espacio para un horario específico
function reservar(nombre, horario) {
  const reservas = obtenerReservasGuardadas();

  if (!reservas[nombre]) {
    reservas[nombre] = {};
  }

  if (reservas[nombre][horario] === true) {
    alert(`${nombre} ya está reservado para el horario ${horario}.`);
    return;
  }

  geojsonLayer.eachLayer(layer => {
    const props = layer.feature.properties;
    if (props.nombre === nombre) {
      if (props.estado && typeof props.estado === 'object') {
        props.estado[horario] = 'reservado';
        // Si todos horarios reservados, marcar todo como reservado visualmente
        const todosReservados = Object.values(props.estado).every(e => e === 'reservado');
        layer.setStyle({ color: todosReservados ? getColor('reservado') : getColor('disponible') });
      } else {
        props.estado = 'reservado';
        layer.setStyle({ color: getColor('reservado') });
      }
      layer.closePopup();
    }
  });

  reservas[nombre][horario] = true;
  guardarReservas(reservas);

  alert(`${nombre} ha sido reservado para el horario ${horario}. ✅`);
  aplicarFiltros();  // Actualizamos la visualización tras reservar
}

// Variable global para la capa GeoJSON
let geojsonLayer;

// Variable global para horario seleccionado en el popup
let horarioSeleccionado = 'AM';

// Actualizar horario seleccionado desde el popup
function actualizarHorarioSeleccionado(select) {
  horarioSeleccionado = select.value;
}

// Función para mostrar o ocultar capas según filtros
function aplicarFiltros() {
  const filtroTipo = document.getElementById('filtroTipo').value;
  const filtroEstado = document.getElementById('filtroEstado').value;

  geojsonLayer.eachLayer(layer => {
    const p = layer.feature.properties;

    // Estado a comparar: si es objeto, tomar un "estado general" para filtro
    let estadoParaFiltro;
    if (typeof p.estado === 'object') {
      // Consideramos estado general:
      if (Object.values(p.estado).every(e => e === 'disponible')) {
        estadoParaFiltro = 'disponible';
      } else if (Object.values(p.estado).every(e => e === 'reservado')) {
        estadoParaFiltro = 'reservado';
      } else {
        // Estado mixto, podemos considerarlo como disponible para filtro o personalizado
        estadoParaFiltro = 'disponible';
      }
    } else {
      estadoParaFiltro = p.estado;
    }

    // Evaluar filtros
    const cumpleTipo = (filtroTipo === 'todos') || (p.tipo === filtroTipo);
    const cumpleEstado = (filtroEstado === 'todos') || (estadoParaFiltro === filtroEstado);

    if (cumpleTipo && cumpleEstado) {
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  });
}

// Cargar GeoJSON y pintar mapa
fetch('map.geojson')
  .then(res => res.json())
  .then(data => {
    const reservasGuardadas = obtenerReservasGuardadas();

    // Actualizar estados en GeoJSON con reservas guardadas
    data.features.forEach(f => {
      if (reservasGuardadas[f.properties.nombre]) {
        if (typeof f.properties.estado === 'object') {
          Object.keys(reservasGuardadas[f.properties.nombre]).forEach(horario => {
            if (reservasGuardadas[f.properties.nombre][horario]) {
              f.properties.estado[horario] = 'reservado';
            }
          });
        } else if (reservasGuardadas[f.properties.nombre] === true) {
          f.properties.estado = 'reservado';
        }
      }
    });

    geojsonLayer = L.geoJSON(data, {
      style: feature => {
        const estado = feature.properties.estado;
        if (typeof estado === 'object') {
          const todosReservados = Object.values(estado).every(e => e === 'reservado');
          return { color: todosReservados ? getColor('reservado') : getColor('disponible'), weight: 2 };
        }
        return { color: getColor(estado), weight: 2 };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties;

        if (typeof p.estado === 'object' && p.tipo) {
          // Crear popup con selector de horario
          layer.bindPopup(`
            <strong>${p.nombre}</strong><br>
            Tipo: ${p.tipo}<br>
            Precio: $${p.precio}<br><br>
            Horario:
            <select onchange="actualizarHorarioSeleccionado(this)">
              <option value="AM" ${p.estado.AM === 'reservado' ? 'disabled' : ''}>AM (${p.estado.AM})</option>
              <option value="PM" ${p.estado.PM === 'reservado' ? 'disabled' : ''}>PM (${p.estado.PM})</option>
              <option value="Completo" ${p.estado.Completo === 'reservado' ? 'disabled' : ''}>Completo (${p.estado.Completo})</option>
            </select><br><br>
            <button onclick="reservar('${p.nombre}', horarioSeleccionado)">Reservar</button>
          `);
        } else {
          layer.bindPopup(`
            <strong>${p.nombre}</strong><br>
            Tipo: ${p.tipo}<br>
            Estado: ${p.estado}<br>
            Precio: $${p.precio}
          `);
        }
      }
    }).addTo(map);

    map.fitBounds(geojsonLayer.getBounds());

    // Escuchar cambios en filtros para actualizar visualización
    document.getElementById('filtroTipo').addEventListener('change', aplicarFiltros);
    document.getElementById('filtroEstado').addEventListener('change', aplicarFiltros);

    // Aplicar filtros inicialmente
    aplicarFiltros();
  });

// Leyenda
const legend = L.control({ position: 'bottomright' });

legend.onAdd = function () {
  const div = L.DomUtil.create('div', 'legend');
  const estados = ['disponible', 'reservado', 'bloqueado'];
  const etiquetas = {
    disponible: 'Disponible',
    reservado: 'Reservado',
    bloqueado: 'Bloqueado/Mantenimiento'
  };

  estados.forEach(estado => {
    div.innerHTML += `<i style="background:${getColor(estado)}"></i> ${etiquetas[estado]}<br>`;
  });

  return div;
};

legend.addTo(map);

// Mostrar modal con reservas
document.getElementById('btnReservas').addEventListener('click', () => {
  const reservas = obtenerReservasGuardadas();
  const lista = document.getElementById('listaReservas');
  lista.innerHTML = '';

  if (Object.keys(reservas).length === 0) {
    lista.innerHTML = '<li>No tienes reservas aún.</li>';
  } else {
    for (const nombre in reservas) {
      const horarios = reservas[nombre];
      for (const h in horarios) {
        if (horarios[h]) {
          const li = document.createElement('li');
          li.textContent = `${nombre} - Horario: ${h}`;
          lista.appendChild(li);
        }
      }
    }
  }

  document.getElementById('modalReservas').style.display = 'block';
});

// Cerrar modal
function cerrarModal() {
  document.getElementById('modalReservas').style.display = 'none';
}

// Limpiar reservas y recargar
document.getElementById('btnLimpiarReservas').addEventListener('click', () => {
  localStorage.removeItem('reservas');
  location.reload();
});
