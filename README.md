# Business Analytics · Copicentro OVNI y Construex Guatemala

Plataforma web de Business Intelligence para analizar ventas, tráfico digital, conversiones, clientes y redes sociales de **Copicentro OVNI** y **Construex Guatemala**.

## Inicio rápido

```bash
npm install
npm run dev        # entorno local en http://localhost:5173
npm run build      # versión de producción en /dist
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

Las cifras del Excel son demostrativas y no deben presentarse como verificadas. El botón **Ver con datos de ejemplo** carga cifras ficticias, marcadas en toda la interfaz y en los reportes, para recorrer la plataforma sin el archivo real.

## Tecnología

React 18 · TypeScript · Vite · Tailwind CSS · Recharts · Framer Motion · Lucide · SheetJS · jsPDF · zustand
