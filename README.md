# Business Analytics · Spartan Gym (Quetzaltenango)

Plataforma web de Business Intelligence para **Spartan Gym** en Quetzaltenango: ventas, inversión en publicidad, leads por red social, tasa de cierre, ROI, CPL y CPA. Admite agregar más empresas desde Gestión de datos.

## Subir a GitHub

Doble clic en `subir-a-github.bat` (Windows) o ejecuta `./subir-a-github.sh` (Mac/Linux). Git abrirá el navegador para iniciar sesión la primera vez.

Después, en el repositorio: **Settings → Pages → Source: GitHub Actions**. La app queda en `https://noegt93.github.io/Bussines-Analitics/`.

## Inicio rápido

```bash
npm install
npm run dev           # entorno local en http://localhost:5173
npm run build         # versión de producción en /dist (GitHub Pages)
npm run build:single  # un solo HTML liviano; las librerías se cargan desde CDN con versión fija
```

## Secciones

| Sección | Contenido |
|---|---|
| Resumen ejecutivo | Ingresos, ventas cerradas, leads, tasa de cierre, ticket, ROI, CPL y CPA; evolución mensual; hallazgos; leads por red; embudo; corte diario de leads |
| Redes sociales | Alcance, impresiones, engagement, seguidores, inversión en anuncios; pendientes hasta importar datos de Meta Ads o TikTok Ads |
| Ventas | Ingresos y ventas cerradas por mes, ticket promedio, tasa de cierre, rendimiento por red y metas |
| Leads y conversión | Leads y cierres por mes y por red, participación de cada red, mapa de variaciones |
| ROI y costos | Chuleta de métricas, ROI, beneficio neto, ROAS, CPL, CPA, CTR, costo por red y retorno mes a mes |
| Comparativas | Períodos (anterior, año anterior, personalizado) y redes |
| Hallazgos | Reglas analíticas transparentes, cada una con su cálculo |
| Gestión de datos | Importación Excel/CSV, corte diario de leads, edición, empresas, respaldo |

## Datos

### Reporte mensual (`datos/REPORTE_DASHABOARD.xlsx`)

Un bloque por mes, de enero a septiembre de 2026, con **inversión**, **venta** (Q) y leads **recibidos** y **cerrados** por red (Instagram, Facebook, WhatsApp y TikTok). El importador reconoce este formato de bloques aunque estén lado a lado y valida el TOTAL de cada bloque. Hay una plantilla descargable con el mismo formato para los meses siguientes.

| Dato del reporte | En la plataforma |
|---|---|
| VENTA | Ingresos (Q) |
| CERRADOS | Ventas cerradas |
| RECIBIDOS | Leads |
| INVERSIÓN | Costo del mes (ROI y costos) |
| TICKET | Ingresos ÷ ventas cerradas (se recalcula) |

### Corte diario de leads

El reporte que se comparte por WhatsApp (leads en el día, a la fecha y cerrados por fuente: formularios de Instagram y Facebook, Instagram, Messenger y WhatsApp) se registra en **Gestión de datos → Corte de leads** y aparece en el resumen ejecutivo. El corte inicial es del 20 de octubre de 2026.

### Observaciones de los datos

- La inversión es Q 50,000 todos los meses y no se reparte por red, así que el CPL y el CPA por red quedan pendientes hasta registrar cuánto va a cada una.
- El ROI sigue a las ventas: de 1,194 % en julio a 370 % en agosto, con la misma inversión.
- El CPL pasó de Q 26.14 (enero) a Q 60.98 (septiembre) porque los leads bajaron de 1,913 a 820.
- En el corte del 20 de octubre el cierre acumulado es 3.0 % (35 de 1,155), muy por debajo del 13–24 % mensual; conviene confirmar si los cerrados del corte están al día.
- CPM, CPC y CTR necesitan impresiones y clics del administrador de anuncios; se importan en Redes sociales.

## ROI y métricas de publicidad

| Métrica | Qué significa | Fórmula |
|---|---|---|
| ROI | Si la inversión terminó siendo rentable | Beneficio neto ÷ inversión × 100 |
| CPL | Costo por contacto (lead) | Inversión ÷ leads recibidos |
| CPA | Costo por acción o conversión | Inversión ÷ ventas cerradas |
| CPM | Costo por mil impresiones | Inversión en anuncios ÷ impresiones × 1,000 |
| CPC | Costo por clic | Inversión en anuncios ÷ clics |
| CTR | Qué porcentaje hizo clic | Clics ÷ impresiones |
| ROAS | Ventas por cada quetzal invertido | Ventas ÷ inversión |

Beneficio neto = ventas − inversión, como en el reporte. Si se define el margen bruto del gimnasio en ROI y costos, se usa ventas × margen − inversión, que descuenta renta, planilla y demás costos.

## Recorrido mes a mes

Un solo mes seleccionado sincroniza la cinta de indicadores, las tarjetas y el gráfico principal. Se cambia con ◀ / ▶, con las flechas del teclado o con Reproducir. Los destellos decorativos se pausan en Configuración → Animación continua y respetan la preferencia del sistema de reducir movimiento.

## Arquitectura

```
src/
  types/            Modelo de datos con trazabilidad de origen (archivo, hoja, fila)
  lib/
    metrics.ts      Indicadores, consolidación y redes
    roi.ts          ROI, CPL, CPA, ROAS y métricas de anuncios
    insights.ts     Motor de hallazgos (interfaz InsightProvider lista para IA)
    importer.ts     Lectura, detección de tablas y bloques, mapeo y validación
    exporter.ts     CSV, XLSX, PDF ejecutivo y respaldo JSON
    repository.ts   Capa de persistencia intercambiable
    live.ts         Recorrido mes a mes
  store/            Estado global (zustand)
  components/       UI, gráficos, KPIs, layout y paneles
  pages/            Una página por sección
```

Los datos se guardan en el navegador (`localStorage`). Para compartirlos entre usuarios, implementa `DataRepository` en `src/lib/repository.ts` con una base de datos.

## Tecnología

React 18 · TypeScript · Vite · Tailwind CSS · Recharts · Framer Motion · Lucide · SheetJS · jsPDF · zustand
