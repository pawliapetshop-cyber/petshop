# Petshop - Pawlia

Aplicacion web para una tienda de mascotas construida con Node.js, Express, EJS, Sequelize y MySQL.

## Estado actual

El proyecto incluye:

- catalogo publico de productos
- carrito en sesion
- checkout con validaciones
- reserva de stock al crear pedidos
- panel admin para productos, categorias y pedidos
- aceptacion y rechazo de pedidos
- generacion de PDF al aceptar pedidos

## Requisitos

- Node.js 18 o superior
- MySQL en ejecucion
- base de datos creada con el nombre configurado en `.env`

## Configuracion

1. Instala dependencias:

```bash
npm install
```

2. Crea tu archivo `.env` a partir de `.env.example`.

3. Ajusta estas variables:

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=change_this_secret
STORAGE_ROOT=
DB_HOST=localhost
DB_PORT=3306
DB_DIALECT=mysql
DB_NAME=petshop
DB_USER=root
DB_PASSWORD=your_password
ADMIN_EMAIL=admin@pawlia.com
ADMIN_PASSWORD=change_this_password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_FORCE_IPV4=true
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_FROM=notificaciones@tudominio.com
```

`STORAGE_ROOT` es opcional en local. Si no se define, se usan las carpetas del proyecto.
En produccion conviene apuntarlo a una ruta persistente.

4. Sincroniza la base de datos:

```bash
npm run db:sync
```

5. Si necesitas crear el admin inicial:

```bash
npm run seed:admin
```

## Comandos utiles

```bash
npm run dev
npm start
npm run db:sync
npm run seed:admin
npm run stores:bootstrap
```

## Produccion en Railway

### Variables recomendadas

Servicio web:

```env
NODE_ENV=production
SESSION_SECRET=una_clave_larga_y_unica
STORAGE_ROOT=/app/data
DB_DIALECT=mysql
DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_FORCE_IPV4=true
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_FROM=notificaciones@tudominio.com
ADMIN_EMAIL=admin@tudominio.com
ADMIN_PASSWORD=change_this_password
```

### Volumen persistente

Monta un volumen en el servicio web y usa `/app/data` como ruta.
El sistema crea automaticamente:

- `/app/data/uploads`
- `/app/data/pdfs`

### Primer arranque

Despues del deploy:

```bash
npm run db:sync
npm run stores:bootstrap
npm run seed:admin
```

### Flujo sugerido

1. Crear repo en GitHub.
2. Crear proyecto en Railway.
3. Agregar MySQL.
4. Conectar el repo como servicio web.
5. Configurar variables del servicio.
6. Montar volumen en `/app/data`.
7. Ejecutar `npm run db:sync`.
8. Crear admin inicial si hace falta.
9. Generar dominio publico y probar login, tienda, pedidos y uploads.

## Credenciales iniciales del admin

El script `crearAdmin.js` crea:

- correo: `ADMIN_EMAIL` o `admin@pawlia.com`
- contrasena: `ADMIN_PASSWORD` o `123456`

Conviene cambiar esas credenciales despues de la primera carga.

## Mejoras recientes del Sprint 1

- configuracion sensible movida a `.env`
- modelo `Product` alineado con `reservedStock` e `isActive`
- acciones mutables del admin movidas a `POST`
- validaciones basicas en admin y checkout
- mensajes de error y exito mas consistentes
- pedidos e inventario con transacciones en checkout, aceptar y rechazar
- manejo base de 404 y 500

## Siguiente enfoque recomendado

La siguiente fase natural es trabajar sobre:

- filtros y reportes por fechas
- pruebas mas cercanas al flujo real
- proteccion extra de formularios y sesiones
- variantes de producto
- mejoras del catalogo publico
