Welcome to your new TanStack app! 

# Getting Started

To run this application:

```bash
bun install
bun run start
```

# Building For Production

To build this application for production:

```bash
bun run build
```

## Styling

This project uses [Tailwind CSS](https://tailwindcss.com/) for styling.


## Solid-UI

This installation of Solid-UI follows the manual instructions but was modified to work with Tailwind V4.

To install the components, run the following command (this install button):

```bash
npx solidui-cli@latest add button
```



## Routing
This project uses [TanStack Router](https://tanstack.com/router). The initial setup is a code based router. Which means that the routes are defined in code (in the `./src/main.tsx` file). If you like you can also use a file based routing setup by following the [File Based Routing](https://tanstack.com/router/latest/docs/framework/solid/guide/file-based-routing) guide.

### Adding A Route

To add a new route to your application just add another `createRoute` call to the `./src/main.tsx` file. The example below adds a new `/about`route to the root route.

```tsx
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: () => <h1>About</h1>,
});
```

You will also need to add the route to the `routeTree` in the `./src/main.tsx` file.

```tsx
const routeTree = rootRoute.addChildren([indexRoute, aboutRoute]);
```

With this set up you should be able to navigate to `/about` and see the about page.

Of course you don't need to implement the About page in the `main.tsx` file. You can create that component in another file and import it into the `main.tsx` file, then use it in the `component` property of the `createRoute` call, like so:

```tsx
import About from "./components/About.tsx";

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: About,
});
```

That is how we have the `App` component set up with the home page.

For more information on the options you have when you are creating code based routes check out the [Code Based Routing](https://tanstack.com/router/latest/docs/framework/solid/guide/code-based-routing) documentation.

Now that you have two routes you can use a `Link` component to navigate between them.

### Adding Links

To use SPA (Single Page Application) navigation you will need to import the `Link` component from `@tanstack/solid-router`.

```tsx
import { Link } from "@tanstack/solid-router";
```

Then anywhere in your JSX you can use it like so:

```tsx
<Link to="/about">About</Link>
```

This will create a link that will navigate to the `/about` route.

More information on the `Link` component can be found in the [Link documentation](https://tanstack.com/router/v1/docs/framework/solid/api/router/linkComponent).

### Using A Layout


Layouts can be used to wrap the contents of the routes in menus, headers, footers, etc.

There is already a layout in the `src/main.tsx` file:

```tsx
const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
```

You can use the Soliid component specified in the `component` property of the `rootRoute` to wrap the contents of the routes. The `<Outlet />` component is used to render the current route within the body of the layout. For example you could add a header to the layout like so:

```tsx
import { Link } from "@tanstack/solid-router";

const rootRoute = createRootRoute({
  component: () => (
    <>
      <header>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
        </nav>
      </header>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
```

The `<TanStackRouterDevtools />` component is not required so you can remove it if you don't want it in your layout.

More information on layouts can be found in the [Layouts documentation](https://tanstack.com/router/latest/docs/framework/solid/guide/routing-concepts#layouts).

## Data Fetching

There are multiple ways to fetch data in your application. You can use TanStack Query to fetch data from a server. But you can also use the `loader` functionality built into TanStack Router to load the data for a route before it's rendered.

For example:

```tsx
const peopleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/people",
  loader: async () => {
    const response = await fetch("https://swapi.dev/api/people");
    return response.json() as Promise<{
      results: {
        name: string;
      }[];
    }>;
  },
  component: () => {
    const data = peopleRoute.useLoaderData();
    return (
      <ul>
        {data.results.map((person) => (
          <li key={person.name}>{person.name}</li>
        ))}
      </ul>
    );
  },
});
```

Loaders simplify your data fetching logic dramatically. Check out more information in the [Loader documentation](https://tanstack.com/router/latest/docs/framework/solid/guide/data-loading#loader-parameters).

# Demo files

Files prefixed with `demo` can be safely deleted. They are there to provide a starting point for you to play around with the features you've installed.



# Learn More

You can learn more about all of the offerings from TanStack in the [TanStack documentation](https://tanstack.com).

# Ana Maria Admin

An admin panel for managing Ana Maria's discography.

## Setup

1. Clone this repository
2. Create a `.env` file in the root directory with the following variables:
   ```
   VITE_TURSO_DATABASE_URL=libsql://ana-maria-discography-jhonra121.aws-eu-west-1.turso.io
   VITE_TURSO_AUTH_TOKEN=your_turso_auth_token
   ```
3. Install dependencies:
   ```
   bun install
   ```
4. Run the development server:
   ```
   bun run dev
   ```

## Database Schema

The application expects the following schema in Turso:

### Albums Table
```sql
CREATE TABLE albums (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  release_date TEXT NOT NULL,
  coverart_url TEXT
);
```

### Songs Table
```sql
CREATE TABLE songs (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  track_number INTEGER NOT NULL,
  is_single INTEGER DEFAULT 0,
  album_id INTEGER,
  FOREIGN KEY (album_id) REFERENCES albums (id)
);
```

## Database Setup

Before using the authentication system, you need to set up the required database tables in D1:

### Method 1: Using Better Auth CLI (Recommended)

1. Run the Better Auth CLI to generate schema files:
   ```
   bun run auth:migrate
   ```

2. This will generate migration files based on your Drizzle schema in `src/db/auth-schema.ts`.

3. Start the API worker:
   ```
   bun run api:dev
   ```

4. After the migrations are created, visit `http://127.0.0.1:8787/setup-auth` to create the tables.

### Method 2: Direct Setup

If you prefer to create the tables directly:

1. Start the API worker:
   ```
   bun run api:dev
   ```

2. Visit `http://127.0.0.1:8787/setup-auth` to create the necessary authentication tables based on your Drizzle schema.

You should see a JSON response confirming that the tables were created successfully.

### Schema Integration

The authentication system uses Drizzle ORM with the schema defined in `src/db/auth-schema.ts`. The tables are created to match this schema, ensuring compatibility between your application and the authentication system.

## Cross-Domain Configuration

To support cross-domain cookies:
1. Frontend includes `credentials: 'include'` with all requests
2. Backend CORS configuration allows credentials
3. Cookies use `SameSite=none` and `secure=true`

# Convex Better Auth Testing

This project demonstrates integration of Better Auth with:
- SolidJS frontend on Cloudflare Pages
- Hono API backend on Cloudflare Workers
- Cross-domain authentication with SameSite=None, secure cookies

## Project Structure

- `/src` - SolidJS frontend code
- `/api` - Hono API backend code
- `/convex` - Convex backend code

## Authentication Flow

This project uses Better Auth for authentication across different domains:

1. Frontend on Cloudflare Pages (e.g., `convex-testing.pages.dev`)
2. API on Cloudflare Workers (e.g., `better-auth-d1-worker.workers.dev`)

Since the domains are different, cookies are configured with:
- `SameSite=none` 
- `secure=true`
- `partitioned=true`

## Development Setup

1. Install dependencies:
   ```
   bun install
   ```

2. Set up environment variables in `.dev.vars`:
   ```
   BETTER_AUTH_SECRET=your_secret_key
   BETTER_AUTH_URL=http://127.0.0.1:8788 #Base URL of your app
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_CLIENT_ID=your_google_client_id
   ```

3. Run the development server:
   ```
   bun dev
   ```

4. Run the API worker:
   ```
   bun wrangler dev api/index.ts
   ```

## Production Deployment

For production deployment to Cloudflare:

1. Deploy the frontend to Cloudflare Pages
2. Deploy the API to Cloudflare Workers
3. Set the environment variables in the Cloudflare dashboard

## Authentication Implementation Details

The authentication system uses:

1. **Backend (Hono)**: 
   - Better Auth middleware for all routes
   - Cross-domain cookie configuration
   - Session management

2. **Frontend (SolidJS)**:
   - AuthProvider for app-wide authentication state
   - useAuth hook for authentication operations
   - Cross-domain fetch with credentials

## API Endpoints

- `/api/auth/*` - Better Auth endpoints
- `/session` - Check authentication status
- `/users` - List users
- `/add` - Add a user

## Cross-Domain Configuration

To support cross-domain cookies:
1. Frontend includes `credentials: 'include'` with all requests
2. Backend CORS configuration allows credentials
3. Cookies use `SameSite=none` and `secure=true`
