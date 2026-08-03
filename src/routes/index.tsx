import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Daily Notes" },
      { name: "description", content: "Daily Notes — NumberWorks'nWords Miranda" },
      { property: "og:title", content: "Daily Notes" },
      { property: "og:description", content: "Daily Notes — NumberWorks'nWords Miranda" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
        Daily Notes
      </h1>
      <p className="mt-3 text-lg text-muted-foreground">
        NumberWorks'nWords Miranda
      </p>
    </main>
  );
}
