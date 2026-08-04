# Daily Notes

A small app for jotting quick notes about students through the day. Notes are stored in Supabase and require signing in.

## Run locally

```sh
bun install
bun run dev
```

Build for production with `bun run build`.

## Configuration

Copy `.env.example` to `.env` and fill in the two Supabase values to override the built in defaults. The anon key is designed to be public, so the app also works without a `.env` file.
