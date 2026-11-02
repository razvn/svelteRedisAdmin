# Login and server visibility

Anonymous visitors are sent to the sign-in form; a wrong password shows an error; a signed-in user sees a
card per server they may access, and the sidebar lists the same servers; logout returns to the form.

## Sub-features

- `login-redirect` sends anonymous `/` to `/login`.
- `login-wrong` rejects a wrong password with an inline error.
- `login-ok` lands on the home page with server cards.
- `login-logout` signs out from the user menu.
- `login-visibility` shows a user limited to some servers only those servers (home, sidebar, deep links).

## How to get to it (user POV)

- Open any app URL while signed out.
- The `Sign in` form on `/login` (`Username`, `Password`, button `Sign in`).
- The `User menu` button in the top bar, menu item `Log out`.

## Driving it with sra-verify

Preconditions:

- `sra-verify doctor <RUN_ID>` is clean. Journey runs as user `none`.

- **Redirect.** Open `/`. `page.goto(base + '/')`. URL ends in `/login`, heading `Sign in` visible.
- **Wrong password.** Fill `Username` = `admin`, `Password` = `wrong`, click `Sign in`. `getByTestId('login-error')` contains `Wrong username or password`.
- **Sign in.** `login('admin')`. `getByTestId('home')` visible, `getByTestId('server-card')` count 2.
- **Log out.** Click button `User menu`, then menuitem `Log out`. URL ends in `/login`.
- **Visibility.** `login('writer')`. Expect 1 `server-card`; `getByTestId('app-sidebar')` has no link `Verify redis2`; `page.goto(base + '/server/1')` returns 403 or 404.
- **Run.** `sra-verify drive <RUN_ID> login none`.

## Gotchas

- `writer-home-one-server` guards a fixed leak: home used to list and probe every server for a restricted user. A failure there is a regression in `src/routes/(app)/+page.server.ts`.
- The top-bar user label reads `writer@` with no host on the home page (no server selected); not a failure.
- The session cookie is `Secure`; Chromium accepts it on `http://127.0.0.1`, curl needs it passed by hand.
