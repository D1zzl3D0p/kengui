export default function Installing() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-2xl font-bold">kenkui not found</h1>
      <p className="max-w-md text-muted-foreground">
        Kengui requires kenkui to be installed. Install it with:
      </p>
      <pre className="rounded-md bg-muted px-6 py-3 text-sm">
        uv tool install kenkui
      </pre>
      <p className="text-sm text-muted-foreground">
        The local runtime starts with kenkui serve.
      </p>
    </div>
  );
}
