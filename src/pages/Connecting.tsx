import { useConnectionStore } from '../store/connection';

export default function Connecting() {
  const { connectionStatus } = useConnectionStore();

  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      {connectionStatus === 'error' ? (
        <>
          <h1 className="text-xl font-semibold text-red-600">Connection failed</h1>
          <p className="text-muted-foreground">
            Could not reach the kenkui server. Check that it is running and try again.
          </p>
        </>
      ) : (
        <>
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-muted-foreground">Starting kenkui server…</p>
        </>
      )}
    </div>
  );
}
