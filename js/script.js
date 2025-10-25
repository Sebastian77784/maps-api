let map;
let markers = [];
let infoWindow;
const center = { lat: 30.378746, lng: -107.880062 };
const restaurantListElement = document.getElementById("restaurants-list");
let currentSearch ="Cafeterías" // Cambiamos el valor inicial
let allPlaces = []; // Almacenar todos los lugares encontrados para el promedio y el filtrado
let averageLocation = null; // Almacenar la ubicación promedio
 
async function initMap() {
    const defaultLocation = center;
    // Places y Geometry (para Polyline)
    await google.maps.importLibrary("places");
    await google.maps.importLibrary("geometry");
   
    map = new google.maps.Map(document.getElementById("map"), {
        center: defaultLocation,
        zoom: 14,
        mapId: "ITSNCG-MAP",
    });
   
    infoWindow = new google.maps.InfoWindow();
   
    // Inicializar los listeners para la navegación por categorías
    setupCategoryListeners();
 
    // Iniciar con la búsqueda predeterminada
    findPlaces(currentSearch);
}
 
function setupCategoryListeners() {
    const categories = document.querySelectorAll('.navbar-nav .nav-link');
    categories.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
           
            // Quitar clase 'active' a todos y añadirla al seleccionado
            categories.forEach(l => l.classList.remove('active'));
            event.target.classList.add('active');
 
            // Actualizar la búsqueda
            currentSearch = event.target.textContent.trim();
            findPlaces(currentSearch);
        });
    });
}
 
 
function clearMarkers() {
  markers.forEach((marker) => marker.setMap(null));
  markers = [];
 
  if (infoWindow) infoWindow.close();
  if (restaurantListElement) {
      restaurantListElement.innerHTML = "";
  }
}
 
async function addMarkerAndDisplay(place, bounds) {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
 
    const marker = new AdvancedMarkerElement({
      map,
      position: place.location,
      title: place.displayName,
    });
 
    bounds.extend(place.location);
    markers.push(marker);
    displayRestaurant(place);
   
    // ... (Listener para el marcador)
    marker.addListener("click", () => {
        infoWindow.close();
        const content = `
            <div class="info-window-content">
                <h6 class="fw-bold">${place.displayName}</h6>
                <p class="mb-1">${place.formattedAddress || 'Dirección no disponible'}</p>
                <div class="rating text-warning">⭐ ${place.rating || 'N/A'} (${place.userRatingCount || 0} reviews)</div>
            </div>
        `;
        infoWindow.setContent(content);
        infoWindow.open({
            anchor: marker,
            map: map,
            shouldFocus: false,
        });
        map.panTo(place.location);
    });
}
 
// ⭐ FUNCIÓN: Marcar promedio y filtrar (Valor 5% + 5% del promedio anterior)
async function addAverageMarker(places) {
    // Calcular la ubicación promedio
    let totalLat = 0;
    let totalLng = 0;
    let validPlacesCount = 0;
 
    places.forEach(place => {
        if (place.location && typeof place.location.lat === 'number' && typeof place.location.lng === 'number') {
            totalLat += place.location.lat;
            totalLng += place.location.lng;
            validPlacesCount++;
        }
    });
    if (validPlacesCount === 0) return;
 
    const avgLat = totalLat / validPlacesCount;
    const avgLng = totalLng / validPlacesCount;
    averageLocation = new google.maps.LatLng(avgLat, avgLng); // Guardamos la ubicación promedio
 
    // 1. Marcar el promedio (Icono personalizado)
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
    const averageIconElement = document.createElement("div");
    averageIconElement.className = "average-marker-icon";
    averageIconElement.style.cssText = `
        background-color: #007bff;
        color: white;
        padding: 5px;
        border-radius: 50% 50% 50% 0;
        border: 3px solid #fff;
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
        transform: rotate(-45deg);
        width: 35px;
        height: 35px;
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    averageIconElement.innerHTML = `<i class="fa fa-crosshairs" style="font-size: 1.1rem; transform: rotate(45deg);"></i>`;
 
    const avgMarker = new AdvancedMarkerElement({
        map: map,
        position: averageLocation,
        title: `Punto Central Promedio de ${validPlacesCount} Lugares`,
        content: averageIconElement,
    });
    markers.push(avgMarker);
   
    // 2. Filtrar y dibujar el círculo (Valor 5%)
    const filterRadiusMeters = 500; // Radio de 500 metros
   
    // Dibujar el círculo (Polyline/Circle)
    const cityCircle = new google.maps.Circle({
        strokeColor: "#FF0000",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: "#FF0000",
        fillOpacity: 0.1,
        map,
        center: averageLocation,
        radius: filterRadiusMeters,
    });
    markers.push(cityCircle); // Agregar el círculo para que se borre con clearMarkers
 
    // 3. Filtrar los lugares y borrar los marcadores fuera del radio
    const placesToRemove = [];
    allPlaces = allPlaces.filter(place => {
        const placeLocation = new google.maps.LatLng(place.location.lat, place.location.lng);
        // Calcula la distancia entre el centro promedio y el lugar en metros
        const distance = google.maps.geometry.spherical.computeDistanceBetween(averageLocation, placeLocation);
       
        if (distance >= filterRadiusMeters) {
            placesToRemove.push(place);
            return false; // Excluir
        }
        return true; // Incluir
    });
   
    // Eliminar los marcadores de los lugares filtrados (fuera del círculo)
    markers = markers.filter(marker => {
        // Asume que los AdvancedMarkerElement tienen una propiedad 'position'
        // Esto es una simplificación; en una app más compleja, se usaría un diccionario de Place IDs a Markers
        if (marker.title !== avgMarker.title && marker.position) {
             const markerLocation = new google.maps.LatLng(marker.position.lat, marker.position.lng);
             const distance = google.maps.geometry.spherical.computeDistanceBetween(averageLocation, markerLocation);
             
             if (distance >= filterRadiusMeters) {
                 marker.setMap(null); // Quitar del mapa
                 return false; // Excluir del array markers
             }
        }
        return true; // Conservar
    });
 
 
    // 4. Localizar el punto más alejado y más cercano y trazar una línea (Valor 10%)
    traceClosestAndFarthest(allPlaces);
}
 
// ⭐ FUNCIÓN: Traza el punto más cercano y más lejano (Valor 10%)
async function traceClosestAndFarthest(places) {
    if (!averageLocation || places.length < 2) return;
 
    let closestPlace = null;
    let farthestPlace = null;
    let minDistance = Infinity;
    let maxDistance = -1;
 
    places.forEach(place => {
        const placeLocation = new google.maps.LatLng(place.location.lat, place.location.lng);
        const distance = google.maps.geometry.spherical.computeDistanceBetween(averageLocation, placeLocation);
 
        if (distance < minDistance) {
            minDistance = distance;
            closestPlace = place;
        }
        if (distance > maxDistance) {
            maxDistance = distance;
            farthestPlace = place;
        }
    });
 
    if (!closestPlace || !farthestPlace || closestPlace === farthestPlace) return;
 
    const closestLoc = new google.maps.LatLng(closestPlace.location.lat, closestPlace.location.lng);
    const farthestLoc = new google.maps.LatLng(farthestPlace.location.lat, farthestPlace.location.lng);
 
    // Trazar la línea
    const polyline = new google.maps.Polyline({
        path: [closestLoc, averageLocation, farthestLoc],
        geodesic: true,
        strokeColor: "#0000FF", // Línea azul
        strokeOpacity: 1.0,
        strokeWeight: 2,
    });
 
    polyline.setMap(map);
    markers.push(polyline); // Agregar la línea para su limpieza
 
    console.log(`Punto más cercano: ${closestPlace.displayName} (${minDistance.toFixed(2)}m)`);
    console.log(`Punto más alejado: ${farthestPlace.displayName} (${maxDistance.toFixed(2)}m)`);
}
 
// ⭐ FUNCIÓN: Búsqueda con ordenamiento (Valor 20% + 5% + 5%)
async function findPlaces(searchText) {
  clearMarkers();
  averageLocation = null; // Reiniciar la ubicación promedio
 
  const { Place } = await google.maps.importLibrary("places");
 
  const request = {
    textQuery: searchText,
    // Se piden los campos necesarios para el ordenamiento y la información
    fields: [
        "displayName", "location", "businessStatus", "rating", "photos", "formattedAddress", "userRatingCount"
    ],
    // includedType: "restaurant", // Se comenta para permitir las categorías generales
    locationBias: center,
    isOpenNow: true,
    language: "es-MX",
    maxResultCount: 20,
    region: "mx",
    useStrictTypeFiltering: false,
  };
 
  const { places } = await Place.searchByText(request);
  const { LatLngBounds } = await google.maps.importLibrary("core");
  const bounds = new LatLngBounds();
 
 
  if (places.length) {
    // 1. Almacenar los resultados
    allPlaces = places;
 
    // 2. Ordenar por calificación (Rating) - (Valor 5%)
    // Orden descendente (mejor calificación primero)
    allPlaces.sort((a, b) => (b.rating || 0) - (a.rating || 0));
   
    // 3. Ordenar por número de comentarios (userRatingCount) - (Valor 5%)
    // Orden descendente (más comentarios primero)
    allPlaces.sort((a, b) => (b.userRatingCount || 0) - (a.userRatingCount || 0));
   
    console.log(`Resultados de "${searchText}" ordenados (Comentarios > Rating):`, allPlaces);
 
 
    // 4. Mostrar marcadores y lista
    for (const place of allPlaces) {
        await addMarkerAndDisplay(place, bounds);
    }
   
    map.fitBounds(bounds);
   
    // 5. Aplicar lógica de centro promedio, filtrado y trazo de distancia
    await addAverageMarker(allPlaces);
   
  } else {
    console.log("No se encontraron resultados para la búsqueda.");
    if (restaurantListElement) {
        restaurantListElement.innerHTML = `<p class='text-center mt-4'>No se encontraron resultados para "${searchText}".</p>`;
    }
  }
}
 
async function displayRestaurant(place) {
    if (!restaurantListElement) return;
 
    let photoUrl = "";
   
    if (place.photos && place.photos.length > 0) {
        photoUrl = place.photos[0].getURI({
            maxWidth: 500,
            maxHeight: 200
        });
    }
   
    // Mostrar el número de comentarios (Valor 5%)
    const ratingCount = place.userRatingCount ? `(${place.userRatingCount} Comentarios)` : '(Sin comentarios)';
    let statusText = place.businessStatus === 'OPERATIONAL' ?
        '<span class="text-success fw-bold">Abierto</span>' :
        '<span class="text-danger fw-bold">Estado Desconocido</span>';
 
    const card = `
        <div class="restaurant-card p-3" onclick="map.panTo({lat: ${place.location.lat}, lng: ${place.location.lng}}); map.setZoom(17);">
            <img src="${photoUrl}" class="w-100 restaurant-img" alt="${place.displayName}" loading="lazy">
            <h6 class="mt-3 mb-1 fw-bold">${place.displayName}</h6>
            <p class="mb-1 text-muted">
                ${place.formattedAddress || 'Dirección no disponible'}
            </p>
            <p class="mb-2 text-muted">
                ${statusText}
            </p>
            <div class="rating text-warning">⭐ ${place.rating || 'N/A'} ${ratingCount}</div>
        </div>
    `;
 
    restaurantListElement.innerHTML += card;
}
 
async function searchCityAndPlaces(cityName) {
    const { Geocoder } = await google.maps.importLibrary("geocoding");
    const geocoder = new Geocoder();
 
    geocoder.geocode({ address: cityName }, (results, status) => {
        if (status === "OK" && results[0]) {
            const newLocation = results[0].geometry.location;
            center.lat = newLocation.lat();
            center.lng = newLocation.lng();
            map.setCenter(newLocation);
            findPlaces(currentSearch);
        } else {
            console.error("Geocoding falló con el estado:", status);
            alert(`No se pudo encontrar la ubicación para "${cityName}": ${status}`);
        }
    });
}
document.addEventListener("DOMContentLoaded", () => {
    const searchButton = document.getElementById("search-btn");
    const locationInput = document.getElementById("location-input");
   
    if (searchButton && locationInput) {
        searchButton.addEventListener("click", () => {
            const searchText = locationInput.value.trim();
            if (searchText) {
                searchCityAndPlaces(searchText);
            }
        });
       
        locationInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                searchButton.click();
            }
        });
    }
});