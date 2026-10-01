# ☕ Stars Hollow Book Club

*Haz matcha con tus lectores favoritos.* (Repo: `coffee_and_chapters`.)

"Tinder" de libros para elegir entre varios qué leemos en el reto.
Flask + SQLite, desplegado en Railway.

## Qué hace

- Desliza **→** leer · **←** descartar · **↑** pasar (vuelve a salir cuando acabes los nuevos)
- **Ya lo he leído** es una casilla aparte: *leído + leer* = releer
- **?** busca el libro en Goodreads · **↶** deshace
- **🔎 Buscador** en Descubrir para cargar un libro concreto como tarjeta (solo para los usuarios de `SEARCH_USERS`, por defecto `sento`). En **Listas → Todos** también se puede buscar y ver el estado de cada uno.
- **💞 Nos lo quedamos**: cuando **todos** elegís leer un libro, salta el match (choque de puños 🤜💥🤛) y entra en el reto
- **Listas**: nos lo quedamos, leer, pasados, descartados, leídos y todos, con el estado de cada uno
- **📚 Reto**: de entre los que os quedáis, elegís qué leer **por turnos** (rotando entre todos).
  Filtro por estación (arranca en la actual) y "solo los que no ha leído ninguno"; **🎲 Sorpréndenos** saca uno al azar.
  Cada lectura pasa por Próximas → Leyendo ahora → Terminadas.
  «Otro» no repite candidatos hasta haberlos visto todos. Los usuarios de `SEARCH_USERS` pueden además marcar
  directamente un candidato como *leyendo* o *leído* y, en Terminadas, apuntar cualquier lectura del reto ya hecha
  (aunque no sea coincidencia); las apuntadas así no cuentan para el turno.
- **🤝 Reto por parejas** (con 3 o más usuarios): además de *Todos/Los tres*, cada uno tiene una pestaña
  *Con X* con los libros que solo queréis leer esa pareja; con sus propias Próximas / Leyendo / Terminadas y su turno.
  Un libro solo puede estar en el reto de un grupo.
- **⬇️ Excel** (solo `SEARCH_USERS`): descarga en `/exportar` con tres hojas, *Nos lo quedamos* (quién lo ha leído y
  si ya está en el reto), *Todos* (lo que ha decidido cada uno) y *Reto* (todas las lecturas, con su grupo).
- **💕 Casi** (con 3 o más usuarios): si lo quieren al menos dos, al deslizar la tarjeta se contonea un poco
  («con X · falta Y») y aparece en la lista *Casi*
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
   | `APP_USERS` | `sento:clave,and:clave,carmen:clave` (los que hagan falta) |
   | `SECRET_KEY` | cadena larga aleatoria |
   | `DATABASE_PATH` | `/data/app.db` |
   | `SEARCH_USERS` | *(opcional)* quién ve el 🔎 en Descubrir; por defecto `sento` |

4. **Settings → Networking → Generate Domain**

## Estructura

```
app.py          rutas, login, importación y API
templates/      páginas HTML
static/         CSS y JS del swipe
seed/           Excel inicial del reto y sinopsis (sinopsis.tsv)
```
