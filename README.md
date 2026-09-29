# ☕ Coffee & Chapters

"Tinder" de libros para elegir entre dos qué leemos en el reto.
Flask + SQLite, desplegado en Railway.

## Qué hace

- Desliza **→** leer · **←** descartar · **↑** pasar (vuelve a salir cuando acabes los nuevos)
- **Ya lo he leído** es una casilla aparte: *leído + leer* = releer
- **?** busca el libro en Goodreads · **↶** deshace
- **Listas**: coincidencias (los dos queréis leerlo), leer, pasados, descartados, leídos y todos, con el estado de los dos
- **Datos**: al arrancar con la base vacía se carga `seed/coffee_and_chapters.xlsx` (hojas *Criba* + *Lista*),
  con los estados previos de las columnas *Vicen* → `sento` y *Andrea* → `and`. El nivel 7 y el nº 112 (Inferno, ya dentro de La Divina Comedia) no se cargan.
  Desde **Importar** se puede subir una versión ampliada; lo que ya existe no se toca.

## Arrancar en local

```bash
git clone https://github.com/SentoTM/coffee_and_chapters.git
cd coffee_and_chapters
python -m venv .venv
.venv\Scripts\activate            # Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
$env:APP_USERS="sento:1234,and:1234"   # PowerShell (Linux/Mac: export APP_USERS=...)
python app.py                     # http://localhost:5000
```

## Desplegar en Railway

1. **New Project → Deploy from GitHub repo** → `coffee_and_chapters`
2. **Add Volume** montado en `/data` (si no, se pierden los votos en cada deploy)
3. Variables:

   | Variable | Valor |
   |---|---|
   | `APP_USERS` | `sento:clave,and:clave` |
   | `SECRET_KEY` | cadena larga aleatoria |
   | `DATABASE_PATH` | `/data/app.db` |

4. **Settings → Networking → Generate Domain**

## Estructura

```
app.py          rutas, login, importación y API
templates/      páginas HTML
static/         CSS y JS del swipe
seed/           Excel inicial del reto
```
