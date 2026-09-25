HOME COOKING CUENCA — website files
===================================

This folder is the whole website. It does not need Node, npm, or an installer.

HOW TO PUT IT ONLINE
--------------------
1. Unzip this archive.
2. Open the folder "home-cooking-cuenca".
3. Upload EVERYTHING inside that folder to your hosting public folder
   (often called public_html, www, or htdocs).
   Keep the same structure: index.html next to css/, js/, img/, fonts/.
4. Point the domain at that folder.

Do not upload only index.html. The photos, fonts, and scripts must travel with it.

Check in a browser:  https://your-domain.com/
You should see the oxblood header and the food photos.

TO PREVIEW ON YOUR COMPUTER
---------------------------
Double-click index.html, or drag it onto a browser window.
If a host or browser blocks “file” pages, use any simple local server, or just upload.

TWO SETTINGS YOU WILL WANT TO CHANGE
------------------------------------
Open  js/config.js  in a text editor.

  whatsappNumber:  digits only, with country code. Example Ecuador: "593991234567"
  orderSiteUrl:    the paired online-order site, when it exists. Example: "https://orders.example.com"

Save the file and upload it again. Nothing else needs rebuilding.

ONLINE ORDERS
-------------
The menu, prices, available dishes and delivery days are managed in the kitchen
dashboard (Pájaro y Bestia → Restaurantes → Home Cooking Cuenca). Orders placed
on this site go straight to that kitchen, and the customer follows the order
live in the order panel. If the kitchen cannot be reached, the site falls back
to the original menu and the WhatsApp order message.
To turn online orders off, set  kitchenApi: ""  in js/config.js.

ENGLISH / SPANISH
-----------------
The EN | ES buttons are in the header. The choice is remembered in the visitor’s browser.

WHAT IS IN THIS FOLDER
----------------------
index.html     the page
css/           styles + local fonts
js/            language, menu, order form, online orders, config
vendor/        map library (Leaflet), local like the fonts
img/           kitchen photo, dishes, logos
fonts/         Cormorant Garamond + Outfit (so the site does not depend on Google)
favicon.svg    tab icon
og.jpg         image used when the link is shared
README.txt     this file

Do not add node_modules. Do not run npm. This is not that kind of project.


SITIO WEB — HOME COOKING CUENCA
===============================

Esta carpeta ES el sitio. No necesita Node, npm ni instalación.

CÓMO SUBIRLO
------------
1. Descomprima el archivo.
2. Abra la carpeta "home-cooking-cuenca".
3. Suba TODO lo que hay dentro a la carpeta pública del hosting
   (public_html, www o htdocs).
   index.html debe quedar junto a css/, js/, img/ y fonts/.
4. Apunte el dominio a esa carpeta.

No suba solo index.html.

DOS DATOS PARA EDITAR
---------------------
Abra  js/config.js

  whatsappNumber:  número con código de país, solo dígitos. Ej.: "593991234567"
  orderSiteUrl:    la tienda de pedidos, cuando exista.

Guarde y vuelva a subir ese archivo.

PEDIDOS EN LÍNEA
----------------
El menú, precios, platos disponibles y días de entrega se manejan desde el panel
de la cocina (Pájaro y Bestia → Restaurantes → Home Cooking Cuenca). Los pedidos
de este sitio llegan directo a esa cocina y el cliente sigue su pedido en vivo.
Si la cocina no responde, el sitio vuelve al menú original y al mensaje de WhatsApp.
Para apagar los pedidos en línea: kitchenApi: ""  en js/config.js.
