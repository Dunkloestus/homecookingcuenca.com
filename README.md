# Home Cooking Cuenca

Sitio web oficial de **Home Cooking Cuenca** (<https://homecookingcuenca.com>).

Sitio estático (HTML/CSS/JS, sin build). Instrucciones de hosting manual en `README.txt`.
WhatsApp y URL de pedidos se editan en `js/config.js`.

## Pedidos en línea

El menú (ES/EN), disponibilidad, días de entrega y pedidos vienen del backend de
Pájaro y Bestia (dark kitchen), vía `js/order-live.js` y el cliente
`https://pajaroybestia.com/embed/kitchen.js`. Se configura en `js/config.js`
(`kitchenApi`, `kitchenBrand`). Si el backend no responde, queda el flujo
original: menú estático (`js/menu.js`) + mensaje de WhatsApp (`js/site.js`).
El mapa usa Leaflet local en `vendor/leaflet/` (BSD-2).

## Correr con Docker

```bash
docker compose up -d --build   # http://localhost:3940
```

## Mantenedor

Wizard Systems Corp.
