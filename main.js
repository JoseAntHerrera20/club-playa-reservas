// URL base del backend desplegado en Azure
const BACKEND_URL = 'https://clubplaya-backend.azurewebsites.net';

// Variables globales
let map;
let geojsonLayer;
let horarioSeleccionado = 'AM';

// Guardar token en localStorage
function guardarToken(token) {
  localStorage.setItem('token', token);
}

// Obtener token
function obtenerToken() {
  return localStorage.getItem('token');
}

// Obtener email desde token JWT
function obtenerUsuarioDesdeToken() {
  const token = obtenerToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.email;
  } catch {
    return null;
  }
}

// Mostrar usuario en la UI
function mostrarUsuario() {
  const usuario = obtenerUsuarioDesdeToken();
  const authMensaje = document.getElementById('authMensaje');
  if (usuario) {
    authMensaje.textContent = `Sesión activa como: ${usuario}`;
  } else {
    authMensaje.textContent = '';
  }
}

// Inicializar mapa y cargar datos
function inicializarMapa() {
  // Elimina mapa anterior si existe para evitar errores
  if (map) {
    map.remove();
    map = null;
    geojsonLayer = null;
  }

  map = L.map('map');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  fetch(`${BACKEND_URL}/api/mapa`)
    .then(res => res.json())
    .then(data => {
      // Aquí puedes adaptar el manejo de reservas guardadas si usas localStorage
      geojsonLayer = L.geoJSON(data, {
        style: feature => {
          const estado = feature.properties.estado;
          if (typeof estado === 'object') {
            if (Object.values(estado).some(e => e === 'bloqueado')) return { color: 'red', weight: 2 };
            if (Object.values(estado).every(e => e === 'reservado')) return { color: 'yellow', weight: 2 };
            return { color: 'green', weight: 2 };
          }
          return { color: estado === 'bloqueado' ? 'red' : estado === 'reservado' ? 'yellow' : 'green', weight: 2 };
        },
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          if (typeof p.estado === 'object' && p.tipo) {
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

      // Configurar filtros
      document.getElementById('filtroTipo').addEventListener('change', aplicarFiltros);
      document.getElementById('filtroEstado').addEventListener('change', aplicarFiltros);
      aplicarFiltros();
    })
    .catch(err => console.error('Error cargando mapa:', err));
}

// Cambiar horario seleccionado en popup
function actualizarHorarioSeleccionado(select) {
  horarioSeleccionado = select.value;
}

// Aplicar filtros en el mapa
function aplicarFiltros() {
  const filtroTipo = document.getElementById('filtroTipo').value;
  const filtroEstado = document.getElementById('filtroEstado').value;

  geojsonLayer.eachLayer(layer => {
    const p = layer.feature.properties;
    let estadoParaFiltro;

    if (typeof p.estado === 'object') {
      if (Object.values(p.estado).some(e => e === 'bloqueado')) {
        estadoParaFiltro = 'bloqueado';
      } else if (Object.values(p.estado).every(e => e === 'reservado')) {
        estadoParaFiltro = 'reservado';
      } else {
        estadoParaFiltro = 'disponible';
      }
    } else {
      estadoParaFiltro = p.estado;
    }

    const cumpleTipo = filtroTipo === 'todos' || p.tipo === filtroTipo;
    const cumpleEstado = filtroEstado === 'todos' || estadoParaFiltro === filtroEstado;

    if (cumpleTipo && cumpleEstado) {
      layer.addTo(map);
    } else {
      map.removeLayer(layer);
    }
  });
}

// Reservar espacio
function reservar(nombre, horario) {
  const usuario = obtenerUsuarioDesdeToken();
  if (!usuario) {
    alert('⚠️ Debes iniciar sesión para reservar.');
    return;
  }

  fetch(`${BACKEND_URL}/api/reservas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, horario, usuario })
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(err => { throw new Error(err.error || 'Error al reservar'); });
    }
    return response.json();
  })
  .then(() => {
    alert(`✅ Reserva exitosa: ${nombre} - Horario ${horario}`);
    recargarMapa();
  })
  .catch(error => {
    alert(`❌ Error al reservar: ${error.message}`);
  });
}

// Recargar mapa para actualizar estados
function recargarMapa() {
  if (!map) return;
  fetch(`${BACKEND_URL}/api/mapa`)
    .then(res => res.json())
    .then(data => {
      geojsonLayer.clearLayers();
      geojsonLayer.addData(data);
      aplicarFiltros();
    })
    .catch(err => console.error('Error al recargar mapa:', err));
}

// Mostrar modal con reservas y manejar cancelaciones
document.getElementById('btnReservas').addEventListener('click', () => {
  const lista = document.getElementById('listaReservas');
  lista.innerHTML = '';

  fetch(`${BACKEND_URL}/api/reservas`)
    .then(res => res.json())
    .then(reservas => {
      if (!reservas || reservas.length === 0) {
        lista.innerHTML = '<li>No tienes reservas aún.</li>';
        document.getElementById('modalReservas').style.display = 'block';
        return;
      }

      reservas.forEach(r => {
        const li = document.createElement('li');
        const fecha = new Date(r.fecha).toLocaleString();
        li.textContent = `${r.nombre} - Usuario: ${r.usuario} - Horario: ${r.horario} - Fecha: ${fecha}`;

        const btnCancelar = document.createElement('button');
        btnCancelar.textContent = 'Cancelar';
        btnCancelar.style.marginLeft = '10px';

        btnCancelar.onclick = () => {
          if (!confirm(`¿Cancelar la reserva de ${r.nombre} (${r.horario})?`)) return;
          fetch(`${BACKEND_URL}/api/reservas/${encodeURIComponent(r.nombre)}/${encodeURIComponent(r.horario)}`, {
            method: 'DELETE'
          })
          .then(res => {
            if (!res.ok) throw new Error('Error al cancelar reserva');
            return res.json();
          })
          .then(() => {
            alert('Reserva cancelada con éxito.');
            li.remove();
            recargarMapa();
          })
          .catch(err => {
            console.error(err);
            alert('No se pudo cancelar la reserva.');
          });
        };

        li.appendChild(btnCancelar);
        lista.appendChild(li);
      });

      document.getElementById('modalReservas').style.display = 'block';
    })
    .catch(err => {
      console.error('Error al obtener reservas:', err);
      alert('No se pudieron cargar las reservas.');
    });
});

// Cerrar modal reservas
function cerrarModal() {
  document.getElementById('modalReservas').style.display = 'none';
}

// Limpiar todas las reservas del usuario
document.getElementById('btnLimpiarReservas').addEventListener('click', () => {
  if (!confirm('¿Cancelar todas tus reservas?')) return;

  fetch(`${BACKEND_URL}/api/reservas`)
    .then(res => res.json())
    .then(reservas => {
      const promesas = reservas.map(r =>
        fetch(`${BACKEND_URL}/api/reservas/${encodeURIComponent(r.nombre)}/${encodeURIComponent(r.horario)}`, {
          method: 'DELETE'
        })
      );
      return Promise.all(promesas);
    })
    .then(() => {
      alert('Todas las reservas han sido canceladas. ✅');
      recargarMapa();
    })
    .catch(err => {
      console.error('Error al cancelar reservas:', err);
      alert('Ocurrió un error al cancelar las reservas.');
    });
});

// Registro
function registrarse() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    document.getElementById('authMensaje').textContent = 'Completa todos los campos';
    return;
  }

  fetch(`${BACKEND_URL}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) throw new Error(data.error);
    document.getElementById('authMensaje').textContent = 'Registro exitoso. Ahora inicia sesión.';
  })
  .catch(err => {
    document.getElementById('authMensaje').textContent = `⚠️ ${err.message}`;
  });
}

// Inicio sesión
function iniciarSesion() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  if (!email || !password) {
    document.getElementById('authMensaje').textContent = 'Completa todos los campos';
    return;
  }

  fetch(`${BACKEND_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error) throw new Error(data.error);
    guardarToken(data.token);
    mostrarUsuario();

    // Cambiar vista
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('mapContainer').style.display = 'block';

    inicializarMapa();
  })
  .catch(err => {
    document.getElementById('authMensaje').textContent = `⚠️ ${err.message}`;
  });
}

// Cerrar sesión
document.getElementById('btnCerrarSesion').addEventListener('click', () => {
  localStorage.removeItem('token');
  alert('Sesión cerrada');

  if (map) {
    map.remove();
    map = null;
    geojsonLayer = null;
  }

  document.getElementById('mapContainer').style.display = 'none';
  document.getElementById('authContainer').style.display = 'block';
  document.getElementById('authMensaje').textContent = '';
});

// Al cargar la página, revisar sesión y mostrar UI correcta
document.addEventListener('DOMContentLoaded', () => {
  const token = obtenerToken();
  if (token) {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('mapContainer').style.display = 'block';
    mostrarUsuario();
    inicializarMapa();
  } else {
    document.getElementById('authContainer').style.display = 'block';
    document.getElementById('mapContainer').style.display = 'none';
  }
});
