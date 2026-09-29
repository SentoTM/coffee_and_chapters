# ☕ Coffee & Chapters

"Tinder" de libros para elegir entre dos qué leemos en el reto.
Flask + SQLite, desplegado en Railway.

## Qué hace

- Desliza **→** leer · **←** descartar · **↑** pasar (vuelve a salir cuando acabes los nuevos)
- **Ya lo he leído** es una casilla aparte: *leído + leer* = releer
- **?** busca el libro en Goodreads · **↶** deshace
- **🔎 Buscador** en Descubrir para cargar un libro concreto como tarjeta (solo para los usuarios de `SEARCH_USERS`, por defecto `sento`). En **Listas → Todos** también se puede buscar y ver el estado de los dos.
- **💞 Nos lo quedamos**: cuando los dos elegís leer un libro, salta el match y entra en el reto
- **Listas**: nos lo quedamos, leer, pasados, descartados, leídos y todos, con el estado de los dos
- **📚 Reto**: de entre los que os quedáis, elegís qué leer **por turnos** (le toca a quien no eligió la última).
  Filtro por estación (arranca en la actual) y "solo los que no ha leído ninguno"; **🎲 Sorpréndenos** saca uno al azar.
  Cada lectura pasa por Próximas → Leyendo ahora → Terminadas.
- **⬇️ Excel** (solo `SEARCH_USERS`): descarga en `/exportar` con dos hojas, *Nos lo quedamos* (quién lo ha leído y
  si ya está en el reto) y *Todos* (lo que ha decidido cada uno).
- **Datos**: al arrancar con la base vacía se carga `seed/coffee_and_chapters.xlsx` (hojas *Criba* + *Lista*),
  con quién ha leído cada libro (columnas *Vicen* → `sento`, *Andrea* → `and`; «Leído» o «Releer»). Las decisiones se toman deslizando. El nivel 7 y el nº 112 (Inferno, ya dentro de La Divina Comedia) no se cargan.
  Desde **Importar** (solo usuarios de `SEARCH_USERS`, como el buscador) se puede subir una versión ampliada; lo que ya existe no se toca.
- **Sinopsis**: cada tarjeta muestra una sinopsis breve sacada de `seed/sinopsis.tsv` (Nº ⇥ texto). Se sincroniza en cada arranque,
  así que basta con editar ese fichero y desplegar.

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
seed/           Excel inicial del reto y sinopsis (sinopsis.tsv)
```
