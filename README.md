# Business Analytics · Copicentro OVNI y Construex Guatemala

Plataforma web de Business Intelligence para analizar ventas, tráfico digital, conversiones, clientes y redes sociales de **Copicentro OVNI** y **Construex Guatemala**.

## Subir a GitHub

Doble clic en `subir-a-github.bat` (Windows) o ejecuta `./subir-a-github.sh` (Mac/Linux). Git abrirá el navegador para iniciar sesión la primera vez.

## Inicio rápido

```bash
npm install
npm run dev        # entorno local en http://localhost:5173
npm run build      # versión de producción en /dist (GitHub Pages)
npm run build:single  # un solo HTML liviano; las librerías se cargan desde CDN con versión fija
```

Al subir a la rama `main`, el flujo `.github/workflows/deploy.yml` publica la aplicación en GitHub Pages. Actívalo una vez en **Settings → Pages → Source: GitHub Actions**.

## Secciones

| Sección | Contenido |
|---|---|
| Resumen ejecutivo | 8 KPIs con variación y sparkline, evolución mensual interactiva, hallazgos, contribución por canal, embudo y detalle mensual |
| Redes sociales | Alcance, impresiones, engagement, seguidores, inversión, costo por resultado, ROAS, orgánico vs. pagado y publicaciones destacadas. Sin datos se muestran como *Pendiente* |
| Ventas | Ingresos vs. período anterior, ventas, ticket promedio, conversión, adquisición de clientes, rendimiento por canal, embudo y metas con cumplimiento |
| Tráfico y conversiones | Volumen, tasas de avance, adquisición y participación por canal, mapa de variaciones |
| Comparativas | Períodos (anterior, año anterior, personalizado), empresas y canales |
| Hallazgos | Reglas analíticas transparentes, cada una con su método de cálculo |
| Gestión de datos | Importación Excel/CSV con mapeo de columnas y validación, edición de registros, empresas, respaldo y almacenamiento |

## Animación continua

Al estilo de un tablero de bolsa, sin inventar datos: todo recorre los puntos que ya existen.

- **Cinta de indicadores** bajo el encabezado: último mes con datos frente al anterior (▲ ▼) y reparto de ventas por canal. Se detiene al pasar el cursor; cada elemento abre el detalle del mes.
- **Sparklines vivos**: un destello recorre cada curva y un punto marca el mes seleccionado; la tarjeta muestra ese mes, su valor y la variación.
- **Gráfico principal**: un cursor marca el mes seleccionado y una línea superior muestra sus valores. Hacer clic en un punto también lo selecciona.

### Recorrido mes a mes

Un solo mes seleccionado sincroniza la cinta, las tarjetas y el gráfico. Por defecto queda fijo en el último mes con datos y solo cambia cuando la persona lo decide:

- **◀ / ▶** en la cinta y en el gráfico principal: mes anterior o siguiente (también con las flechas ← → del teclado).
- **Reproducir / pausar**: avanza solo cada 1.8 s y vuelve al inicio al llegar al final.

Los destellos decorativos se pausan en Configuración → Animación continua y se apagan si el sistema pide reducir movimiento. La lógica está en `src/lib/live.ts`.

## Definiciones

- **Conversión** = ventas ÷ visitas web
- **Cierre de consultas** = ventas ÷ consultas
- **Visitas que consultan** = consultas ÷ visitas
- **Ticket promedio** = ingresos ÷ ventas (recalculado desde los totales, nunca promediando tickets)
- **Variación** = frente al período anterior de igual duración; solo se calcula si ambos períodos están completos. Las tasas se comparan en puntos porcentuales.
- **Vista consolidada**: un indicador se suma solo si todas las empresas lo tienen para ese mes.
- **Fuentes de tráfico acumuladas** (sin mes) se muestran aparte y nunca se mezclan con los datos mensuales.

## Importación

El importador reconoce las hojas `Datos_Mensuales` y `Fuentes_Trafico` de `Dashboard_Copicentro.xlsx` y omite la hoja `Dashboard` (sus valores se derivan de las otras). También acepta CSV y las plantillas descargables desde la aplicación (datos mensuales, fuentes, redes sociales y publicaciones).

Valida: fila de encabezados, filas de totales, meses no reconocidos, duplicados, valores negativos, coherencia de la conversión y el ticket del archivo, y diferencias entre totales por canal y mensuales. Los registros del mismo mes y empresa se reemplazan, no se duplican.

## Arquitectura

```
src/
  types/            Modelo de datos con trazabilidad de origen (archivo, hoja, fila)
  lib/
    metrics.ts      Cálculo de indicadores, consolidación, canales y redes
    insights.ts     Motor de hallazgos (interfaz InsightProvider lista para IA)
    importer.ts     Lectura, detección, mapeo y validación de archivos
    exporter.ts     CSV, XLSX, PDF ejecutivo y respaldo JSON
    repository.ts   Capa de persistencia intercambiable
  store/            Estado global (zustand)
  components/       UI, gráficos, KPIs, layout y paneles
  pages/            Una página por sección
```

### Persistencia

Hoy los datos se guardan en el navegador (`localStorage`): son privados de ese equipo y se pierden si se borran los datos del sitio. Para compartirlos entre usuarios, implementa la interfaz `DataRepository` de `src/lib/repository.ts` con una base de datos (por ejemplo Supabase o una API propia) y cámbiala en `activeRepository`.

### Hallazgos con IA

`src/lib/insights.ts` define `InsightProvider`. Agrega un proveedor nuevo al arreglo `providers`; sus resultados deben mostrarse etiquetados como generados por IA.

## Datos

`datos/Dashboard_Copicentro.xlsx` es el archivo base. En la primera visita, Copicentro OVNI arranca con sus cifras (hojas `Datos_Mensuales` y `Fuentes_Trafico`), que el propio archivo describe como ejemplos simulados: se marcan como **demostrativas** en toda la interfaz y en los reportes. Al importar datos reales, los meses coincidentes se reemplazan; los datos base se pueden quitar en Gestión de datos → Almacenamiento.

Construex Guatemala arranca vacía, con su estructura lista para importar.

### Inconsistencias detectadas en el archivo base

- La columna **Clics / consultas** combina dos conceptos; se guarda como clics y el embudo la rotula así.
- **Fuentes_Trafico no coincide con Datos_Mensuales**: ingresos Q 277,700 vs. Q 136,000; ventas 6,475 vs. 11,770; visitas 31,500 vs. 34,550. El ticket por canal (≈ Q 42.89) es casi 4 veces el mensual (≈ Q 11.55). Se muestran por separado y nunca se consolidan.
- **Ventas +76 % e ingresos −33 %** de enero a septiembre: el ticket cae de Q 18.37 a Q 6.96. Los ingresos se repiten (Q 18,000 tres meses, Q 15,000 tres meses), igual que clientes nuevos (225 y 238).
- **Conversión de 33–35 %** (ventas ÷ visitas web): muy alta para tráfico web; probablemente las ventas incluyen clientes de mostrador.
- En Fuentes_Trafico, Facebook/Instagram y Google registran más clics/consultas que visitas, y clientes recurrentes/referidos aparecen con 0.
- Las conclusiones escritas en la hoja (“los ingresos crecen con más ventas”) contradicen la hoja mensual, donde los ingresos bajan mientras las ventas suben.

## Tecnología

React 18 · TypeScript · Vite · Tailwind CSS · Recharts · Framer Motion · Lucide · SheetJS · jsPDF · zustand
