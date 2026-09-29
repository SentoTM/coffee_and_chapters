# ☕ Coffee & Chapters

"Tinder" de libros para elegir entre dos qué leemos en el reto.
Flask + SQLite, desplegado en Railway.

## Qué hace

- Desliza **→** quiero leerlo · **←** descartar · **↑** pasar (vuelve a salir al final)
- **✓** ya leído · **?** buscar en Goodreads · **↶** deshacer
- **Listas**: coincidencias (los dos lo queremos), quiero leer, leídos, pasados, rechazados
- **Importar**: sube la lista en `.xlsx` o `.csv` (columnas *Título* y *Autor*; el resto se muestra en la tarjeta)

## Arrancar en local

```bash
git clone https://github.com/SentoTM/coffee_and_chapters.git
cd coffee_and_chapters
python -m venv .venv
.venv\Scripts\activate            # Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
$env:APP_USERS="vicente:1234,ana:1234"   # PowerShell (Linux/Mac: export APP_USERS=...)
python app.py                     # http://localhost:5000
```

## Desplegar en Railway

1. **New Project → Deploy from GitHub repo** → `coffee_and_chapters`
2. **Add Volume** montado en `/data` (si no, se pierden los votos en cada deploy)
3. Variables:

   | Variable | Valor |
   |---|---|
   | `APP_USERS` | `vicente:clave,ana:clave` |
   | `SECRET_KEY` | cadena larga aleatoria |
   | `DATABASE_PATH` | `/data/app.db` |

4. **Settings → Networking → Generate Domain**

## Estructura

```
app.py          rutas, login, importación y API
templates/      páginas HTML
static/         CSS y JS del swipe
```
