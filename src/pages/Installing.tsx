export default function Installing() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-2xl font-bold">kenkui not available</h1>
      <p className="max-w-md text-muted-foreground">
        Kengui tried to install kenkui automatically with uv, but could not find a usable local runtime.
      </p>
      <pre className="rounded-md bg-muted px-6 py-3 text-sm">
        uv tool install --upgrade kenkui
      </pre>
      <p className="text-sm text-muted-foreground">
        After installing, restart Kengui. The local runtime starts with kenkui serve.
      </p>
    </div>
  );
}
